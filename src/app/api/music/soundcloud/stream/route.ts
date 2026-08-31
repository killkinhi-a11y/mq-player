import { NextRequest, NextResponse } from "next/server";
import { SOUNDCLOUD_CLIENT_IDS } from "@/lib/config";

/**
 * Resolve SoundCloud stream URL for a track.
 *
 * Runs as an Edge Function — executes at the Vercel PoP closest to the user,
 * which may bypass CloudFront geo-blocks that affect us-east-1 datacenter IPs.
 *
 * SoundCloud migration (2025): most tracks no longer serve unencrypted progressive
 * or plain HLS. The new formats are:
 *   - ctr-encrypted-hls  → SAMPLE-AES-CTR with Widevine (HLS.js + EME)
 *   - cbc-encrypted-hls  → SAMPLE-AES with FairPlay (Safari)
 *
 * Key discovery: encrypted tracks return `licenseAuthToken` (JWE) alongside the
 * resolved CDN URL. This token MUST be forwarded to the license-proxy so it
 * can be included in the DRM license request — without it the license server
 * rejects the request.
 *
 * Strategy:
 * 1. Get track info from SC API (with track_authorization JWT)
 * 2. Collect ALL transcodings ordered by priority
 * 3. Resolve ALL transcodings in PARALLEL — much faster than sequential
 * 4. Priority: progressive > ctr-encrypted-hls > cbc-encrypted-hls > hls
 * 5. For encrypted HLS, skip server-side CDN verification (unreliable without EME)
 *    and always return the resolved URL for client-side HLS.js + Widevine playback
 */

export const runtime = "edge";

// Single source of truth: src/lib/config.ts (env-overridable, ordered pool).
// This edge route races the pool in parallel, so stale entries just lose
// the race harmlessly.
const CLIENT_IDS = SOUNDCLOUD_CLIENT_IDS;

// ── In-memory stream resolution cache ──
// Vercel Edge reuses isolates across requests within a region, so this cache
// persists for warm instances. Keyed by trackId, TTL 5 minutes — SoundCloud
// CDN URLs are short-lived but 5 min is safe.
// Typical hit: repeat play / preloaded next track / wave radio re-visits.
const STREAM_CACHE_TTL_MS = 5 * 60 * 1000;
interface StreamCacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}
const streamCache = new Map<string, StreamCacheEntry>();

function getCachedStream(trackId: string): Record<string, unknown> | null {
  const entry = streamCache.get(trackId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    streamCache.delete(trackId);
    return null;
  }
  return entry.data;
}

function setCachedStream(trackId: string, data: Record<string, unknown>): void {
  // Cap cache size to 200 entries (LRU-ish: delete oldest by insertion order)
  if (streamCache.size >= 200) {
    const firstKey = streamCache.keys().next().value;
    if (firstKey) streamCache.delete(firstKey);
  }
  streamCache.set(trackId, {
    data,
    expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
  });
}

// Pre-build response shape once resolved, so cache stores ready-to-send data.
function buildStreamResponse(
  primary: { url: string; protocol: string; isHls: boolean; isEncrypted: boolean; quality: string; licenseUrl?: string; licenseAuthToken?: string; },
  info: TrackInfo,
  fallbacks: Array<{ url: string; protocol: string; isHls: boolean; isEncrypted: boolean; licenseUrl?: string; licenseAuthToken?: string }> = [],
  diagnostics: string[] = [],
): Record<string, unknown> {
  return {
    url: primary.url,
    trackAuthorization: info.trackAuthorization,
    isHls: primary.isHls,
    isEncrypted: primary.isEncrypted,
    protocol: primary.protocol,
    quality: primary.quality,
    isPreview: info.isPreview,
    duration: info.duration,
    fullDuration: info.fullDuration,
    ...(primary.licenseUrl ? { licenseUrl: primary.licenseUrl } : {}),
    ...(primary.licenseAuthToken ? { licenseAuthToken: primary.licenseAuthToken } : {}),
    ...(fallbacks && fallbacks.length > 0 ? { fallbackStreams: fallbacks } : {}),
    _cached: true,
    _diag: diagnostics,
  };
}

// SoundCloud DRM license server URLs — each DRM system has its own endpoint
const SC_LICENSE_URLS: Record<string, string> = {
  "ctr-encrypted-hls": "https://license.media-streaming.soundcloud.cloud/playback/widevine",
  "cbc-encrypted-hls": "https://license.media-streaming.soundcloud.cloud/playback/fairplay",
};
const SC_LICENSE_URL_FALLBACK = "https://license.media-streaming.soundcloud.cloud/playback/widevine";

interface Transcoding {
  url?: string;
  format?: { protocol?: string; mime_type?: string };
  quality?: string;
}

interface PickedTranscoding {
  url: string;
  protocol: string;
  isHls: boolean;
  isEncrypted: boolean;
  quality: string;
}

interface TrackInfo {
  transcodings: PickedTranscoding[];
  isPreview: boolean;
  duration: number;
  fullDuration: number;
  trackAuthorization: string;
  policy: string;
  permalinkUrl: string;
}

/** Result from resolving a transcoding template URL */
interface ResolvedStream {
  url: string;
  licenseAuthToken?: string;
}

/**
 * Collect ALL available transcodings ordered by priority.
 * We try each one during resolution — the first that resolves wins.
 * Priority: progressive > ctr-encrypted-hls > cbc-encrypted-hls > hls
 * Within each group, prefer sq (standard quality) for reliability —
 * hq (high quality) tracks are more likely to have DRM/CDN issues.
 */
function collectTranscodings(transcodings: Transcoding[]): PickedTranscoding[] {
  const result: PickedTranscoding[] = [];

  // Quality sort key: sq (standard) before hq (high) for reliability
  const qualityOrder = (q?: string) => {
    if (!q) return 1;
    if (q === "sq") return 0;
    return 2;
  };

  // 1. Progressive (unencrypted MP3) — best for old tracks
  const progressive = transcodings
    .filter(t => t.format?.protocol === "progressive" && t.url)
    .sort((a, b) => qualityOrder(a.quality) - qualityOrder(b.quality));
  for (const t of progressive) {
    result.push({ url: t.url!, protocol: "progressive", isHls: false, isEncrypted: false, quality: t.quality || "" });
  }
  // 2. CTR encrypted HLS — works in Chrome/Firefox/Edge via HLS.js + EME (Widevine)
  const ctrHls = transcodings
    .filter(t => t.format?.protocol === "ctr-encrypted-hls" && t.url)
    .sort((a, b) => qualityOrder(a.quality) - qualityOrder(b.quality));
  for (const t of ctrHls) {
    result.push({ url: t.url!, protocol: "ctr-encrypted-hls", isHls: true, isEncrypted: true, quality: t.quality || "" });
  }
  // 3. CBC encrypted HLS — works in Safari (FairPlay)
  const cbcHls = transcodings
    .filter(t => t.format?.protocol === "cbc-encrypted-hls" && t.url)
    .sort((a, b) => qualityOrder(a.quality) - qualityOrder(b.quality));
  for (const t of cbcHls) {
    result.push({ url: t.url!, protocol: "cbc-encrypted-hls", isHls: true, isEncrypted: true, quality: t.quality || "" });
  }
  // 4. Plain HLS (unencrypted) — may still work for some tracks
  const plainHls = transcodings
    .filter(t => t.format?.protocol === "hls" && t.url)
    .sort((a, b) => qualityOrder(a.quality) - qualityOrder(b.quality));
  for (const t of plainHls) {
    result.push({ url: t.url!, protocol: "hls", isHls: true, isEncrypted: false, quality: t.quality || "" });
  }

  return result;
}

async function getTrackInfo(trackId: string, clientId: string): Promise<TrackInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      }
    );
    if (!trackRes.ok) return null;
    const track = await trackRes.json();

    // Check if track is playable at all
    const policy = track.policy || "ALLOW";
    if (policy === "BLOCK") {
      console.warn(`[stream] Track ${trackId} has policy=BLOCK — skipping`);
      return null;
    }

    const transcodings: Transcoding[] = (track.media?.transcodings || []).filter(Boolean);
    const picked = collectTranscodings(transcodings);
    if (picked.length === 0) {
      console.warn(`[stream] Track ${trackId} has no transcodings`);
      return null;
    }

    const trackAuthorization = (track as Record<string, unknown>).track_authorization as string || "";
    if (!trackAuthorization) {
      console.warn(`[stream] Track ${trackId} has no track_authorization — resolution may fail`);
    }

    return {
      transcodings: picked,
      isPreview: policy === "SNIP",
      duration: Math.round((track.duration || 0) / 1000),
      fullDuration: Math.round((track.full_duration || 0) / 1000),
      trackAuthorization,
      policy,
      permalinkUrl: track.permalink_url || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Server-side resolve: fetch the template URL to get the actual URL + license auth token.
 * Tries all client IDs since some may be rate-limited.
 * Includes track_authorization JWT which SC now requires for media resolution.
 *
 * Returns both the CDN URL and licenseAuthToken (JWE) for encrypted streams.
 */
/**
 * Resolve a transcoding template URL by racing all CLIENT_IDs in parallel.
 * Old code tried IDs sequentially (worst case 2 × 8s = 16s). Promise.any
 * returns as soon as the first ID succeeds — typical 300-800ms even if one
 * ID is rate-limited.
 */
async function resolveStream(templateUrl: string, trackAuthorization: string): Promise<ResolvedStream | null> {
  const separator = templateUrl.includes("?") ? "&" : "?";

  const attempts = CLIENT_IDS.map(async (clientId): Promise<ResolvedStream> => {
    let resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;
    if (trackAuthorization) {
      resolveUrl += `&track_authorization=${encodeURIComponent(trackAuthorization)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(resolveUrl, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          return {
            url: data.url,
            licenseAuthToken: data.licenseAuthToken || undefined,
          };
        }
      }
      throw new Error("no_url");
    } finally {
      clearTimeout(timeout);
    }
  });

  // Race all attempts — first to resolve wins. Promise.any rejects only if
  // ALL attempts reject (i.e. no CLIENT_ID returned a usable URL).
  try {
    const result = await Promise.any(attempts);
    return result;
  } catch {
    return null;
  }
}

/**
 * Verify that a resolved CDN URL is actually accessible.
 *
 * For plain HLS: fetch first bytes to verify it's a valid m3u8 playlist.
 * For progressive: send a HEAD request to verify the URL responds with 200.
 *
 * IMPORTANT: We do NOT verify encrypted HLS URLs — they require EME context
 * that the server doesn't have. The client-side HLS.js + Widevine CDM can
 * successfully play streams that fail server-side checks.
 */
async function verifyCdnUrl(url: string, isHls: boolean): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const uaHeader = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
    try {
      if (isHls) {
        // For HLS: fetch the m3u8 playlist (no Range header — it's a text file)
        const res = await fetch(url, {
          signal: controller.signal,
          headers: uaHeader,
        });
        if (!res.ok) return false;
        const text = await res.text();
        return text.includes("#EXTM3U") || text.includes("#EXT-X-");
      } else {
        // For progressive: HEAD request to verify URL is accessible
        const res = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: uaHeader,
        });
        return res.ok;
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

/**
 * Resolve a full stream URL via cobalt.tools — bypasses SoundCloud SNIP previews
 * without requiring a Go+ subscription.
 *
 * cobalt returns direct CDN URLs (usually mp3) for SoundCloud tracks.
 * Requires a JWT obtained via the /api/cobalt/session endpoint.
 * If cobalt fails or returns an error, we fall back to the normal SNIP preview.
 */
async function resolveViaCobalt(permalinkUrl: string, jwt?: string): Promise<{ url: string; filename?: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      };
      if (jwt) {
        headers["Authorization"] = `Bearer ${jwt}`;
      }

      const res = await fetch("https://api.cobalt.tools/", {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          url: permalinkUrl,
          downloadMode: "audio",
          audioFormat: "mp3",
        }),
      });

      if (!res.ok) {
        console.warn(`[cobalt] HTTP ${res.status} for ${permalinkUrl}`);
        return null;
      }

      const data = await res.json();

      if (data.status === "error") {
        console.warn(`[cobalt] Error: ${data.error?.code || "unknown"}`);
        return null;
      }

      // redirect = direct CDN URL, tunnel = proxied through cobalt
      if ((data.status === "redirect" || data.status === "tunnel") && data.url) {
        return { url: data.url, filename: data.filename };
      }

      // picker = multiple options (rare for audio)
      if (data.status === "picker" && data.picker?.length > 0) {
        const audio = data.picker.find((p: Record<string, unknown>) => p.type === "audio") || data.picker[0];
        if (audio?.url) {
          return { url: audio.url, filename: audio.filename || data.filename };
        }
      }

      console.warn(`[cobalt] Unexpected response: status=${data.status}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn("[cobalt] Request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");
  const cobaltJwt = searchParams.get("cobaltJwt") || undefined;
  const skipCache = searchParams.get("skipCache") === "1";

  if (!trackId) {
    return NextResponse.json({ url: null, resolveUrl: null, error: "missing trackId" });
  }

  // ── Cache check ──
  if (!skipCache) {
    const cached = getCachedStream(trackId);
    if (cached) {
      return NextResponse.json({ ...cached, _cache_hit: true });
    }
  }

  const diagnostics: string[] = [];

  // Try each client ID until one returns track info
  for (const clientId of CLIENT_IDS) {
    try {
      const info = await getTrackInfo(trackId, clientId);
      if (!info) continue;

      diagnostics.push(`track_info_ok: clientId=${clientId.substring(0, 8)}, policy=${info.policy}, transcodings=${info.transcodings.length}, duration=${info.duration}s, auth=${info.trackAuthorization.length > 0}`);

      // ── SNIP: race cobalt + SC resolution in parallel ──
      // Old code ran cobalt FIRST (12s timeout) then SC resolution serially.
      // New: start both at the same time, take whichever succeeds first.
      // For SNIP tracks, cobalt wins ~50% of the time and saves 5-10s.
      if (info.policy === "SNIP" && info.permalinkUrl) {
        console.log(`[stream] SNIP detected for track ${trackId}, racing cobalt + SC resolution...`);

        // Each promise REJECTS on null/failure so Promise.any waits for first success
        const cobaltAttempt = resolveViaCobalt(info.permalinkUrl, cobaltJwt)
          .then(r => r?.url
            ? { kind: "cobalt" as const, url: r.url }
            : Promise.reject(new Error("cobalt_null")));

        const scAttempt = (async () => {
          const progressiveTc = info.transcodings.find(t => !t.isEncrypted) || info.transcodings[0];
          if (!progressiveTc) throw new Error("no_tc");
          const resolved = await resolveStream(progressiveTc.url, info.trackAuthorization);
          if (!resolved) throw new Error("sc_resolve_failed");
          return { kind: "sc" as const, tc: progressiveTc, resolved };
        })();

        try {
          const snipWinner = await Promise.any([cobaltAttempt, scAttempt]);

          if (snipWinner.kind === "cobalt") {
            const cobaltUrl = snipWinner.url;
            const isHlsUrl = cobaltUrl.includes(".m3u8") || cobaltUrl.includes("/hls/");
            diagnostics.push(`cobalt_bypass: won race, url=${cobaltUrl.substring(0, 60)}...`);

            const cobaltResponse = {
              url: cobaltUrl,
              isHls: isHlsUrl,
              isEncrypted: false,
              protocol: isHlsUrl ? "hls" : "progressive",
              quality: "sq",
              isPreview: false,
              duration: info.fullDuration || info.duration,
              fullDuration: info.fullDuration || info.duration,
              _diag: diagnostics,
            };
            setCachedStream(trackId, cobaltResponse);
            return NextResponse.json(cobaltResponse);
          }

          if (snipWinner.kind === "sc") {
            // SC resolution won — return this single stream immediately.
            // Skip the full parallel resolution loop below — for SNIP previews,
            // speed matters more than collecting fallbacks.
            diagnostics.push(`sc_won_snip_race: protocol=${snipWinner.tc.protocol}`);
            const scResponse = buildStreamResponse(
              {
                url: snipWinner.resolved.url,
                protocol: snipWinner.tc.protocol,
                isHls: snipWinner.tc.isHls,
                isEncrypted: snipWinner.tc.isEncrypted,
                quality: snipWinner.tc.quality,
                ...(snipWinner.tc.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[snipWinner.tc.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
                ...(snipWinner.resolved.licenseAuthToken ? { licenseAuthToken: snipWinner.resolved.licenseAuthToken } : {}),
              },
              info,
              [],
              diagnostics,
            );
            setCachedStream(trackId, scResponse);
            return NextResponse.json(scResponse);
          }
        } catch {
          diagnostics.push("snip_race: both failed, falling through to full resolution");
        }
      }

      // ── Resolve ALL transcodings IN PARALLEL ──
      console.log(`[stream] Track ${trackId}: ${info.transcodings.length} transcodings, policy=${info.policy}, duration=${info.duration}s`);

      const resolvePromises = info.transcodings.map(async (tc) => {
        try {
          const resolved = await resolveStream(tc.url, info.trackAuthorization);
          if (!resolved) {
            return { tc, resolved: null, error: "resolve_failed" };
          }

          // CDN verification removed — SC API URLs are reliable enough.
          // The HEAD request added 1-2s per non-encrypted transcoding for no
          // real benefit (less than 1% of URLs are dead, and the client's
          // fallback mechanism handles those cases anyway).
          console.log(`[stream] Resolved ${tc.protocol} (q=${tc.quality}): encrypted=${tc.isEncrypted}, hasAuthToken=${!!resolved.licenseAuthToken}, url=${resolved.url.substring(0, 60)}...`);

          return {
            tc,
            resolved,
            error: null,
          };
        } catch (err: any) {
          return { tc, resolved: null, error: err?.message || "unknown" };
        }
      });

      const results = await Promise.all(resolvePromises);

      const resolvedStreams: Array<{
        url: string;
        protocol: string;
        isHls: boolean;
        isEncrypted: boolean;
        quality: string;
        licenseUrl?: string;
        licenseAuthToken?: string;
      }> = [];

      for (const r of results) {
        if (r.resolved) {
          diagnostics.push(`resolved: ${r.tc.protocol}/${r.tc.quality}, encrypted=${r.tc.isEncrypted}, hasAuthToken=${!!r.resolved.licenseAuthToken}`);

          resolvedStreams.push({
            url: r.resolved.url,
            protocol: r.tc.protocol,
            isHls: r.tc.isHls,
            isEncrypted: r.tc.isEncrypted,
            quality: r.tc.quality,
            ...(r.tc.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[r.tc.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
            ...(r.resolved.licenseAuthToken ? { licenseAuthToken: r.resolved.licenseAuthToken } : {}),
          });
        } else {
          diagnostics.push(`failed: ${r.tc.protocol}/${r.tc.quality}, error=${r.error}`);
        }
      }

      if (resolvedStreams.length > 0) {
        // Sort: progressive (plain MP3) first, then encrypted (trusted), then HLS
        resolvedStreams.sort((a, b) => {
          if (a.protocol === "progressive" && b.protocol !== "progressive") return -1;
          if (b.protocol === "progressive" && a.protocol !== "progressive") return 1;
          if (a.isEncrypted !== b.isEncrypted) return a.isEncrypted ? 1 : -1;
          return 0;
        });

        const primary = resolvedStreams[0];
        const fallbacks = resolvedStreams.slice(1).map(s => ({
          url: s.url,
          protocol: s.protocol,
          isHls: s.isHls,
          isEncrypted: s.isEncrypted,
          licenseUrl: s.licenseUrl,
          licenseAuthToken: s.licenseAuthToken,
        }));

        const response = buildStreamResponse(primary, info, fallbacks, diagnostics);
        setCachedStream(trackId, response);
        return NextResponse.json(response);
      }

      // ── All resolves failed — return template URL for client-side resolve-proxy ──
      console.warn(`[stream] All ${info.transcodings.length} resolves failed for track ${trackId} — returning template URL`);
      diagnostics.push(`all_resolves_failed: returning template URL for client-side fallback`);
      const fallback = info.transcodings[0];
      const separator = fallback.url.includes("?") ? "&" : "?";
      let fallbackUrl = `${fallback.url}${separator}client_id=${clientId}`;
      if (info.trackAuthorization) {
        fallbackUrl += `&track_authorization=${encodeURIComponent(info.trackAuthorization)}`;
      }

      return NextResponse.json({
        url: null,
        resolveUrl: fallbackUrl,
        trackAuthorization: info.trackAuthorization,
        isHls: fallback.isHls,
        isEncrypted: fallback.isEncrypted,
        protocol: fallback.protocol,
        isPreview: info.isPreview,
        duration: info.duration,
        fullDuration: info.fullDuration,
        ...(fallback.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[fallback.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
        drmRestricted: info.transcodings.every(tc => tc.protocol === "cbc-encrypted-hls"),
        _diag: diagnostics,
      });
    } catch (err) {
      diagnostics.push(`error: ${err}`);
      console.error(`[stream] Error processing track ${trackId}:`, err);
    }
  }

  diagnostics.push("all_client_ids_failed: no track info retrieved");
  return NextResponse.json({ url: null, resolveUrl: null, error: "resolve_failed", _diag: diagnostics });
}
