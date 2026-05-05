import { NextRequest, NextResponse } from "next/server";

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

const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa", // Fresh: extracted from SC website
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  // NOTE: gYfbOmxj... and nDSHHx4F... removed — both return 401 on all endpoints (2025-05)
];

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
  const timeout = setTimeout(() => controller.abort(), 10000);

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
async function resolveStream(templateUrl: string, trackAuthorization: string): Promise<ResolvedStream | null> {
  for (const clientId of CLIENT_IDS) {
    try {
      const separator = templateUrl.includes("?") ? "&" : "?";
      let resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;
      if (trackAuthorization) {
        resolveUrl += `&track_authorization=${encodeURIComponent(trackAuthorization)}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

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
      } finally {
        clearTimeout(timeout);
      }
    } catch {}
  }
  return null;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ url: null, resolveUrl: null, error: "missing trackId" });
  }

  const diagnostics: string[] = [];

  // Try each client ID until one returns track info
  for (const clientId of CLIENT_IDS) {
    try {
      const info = await getTrackInfo(trackId, clientId);
      if (!info) continue;

      diagnostics.push(`track_info_ok: clientId=${clientId.substring(0, 8)}, policy=${info.policy}, transcodings=${info.transcodings.length}, duration=${info.duration}s, auth=${info.trackAuthorization.length > 0}`);

      // ── Resolve ALL transcodings IN PARALLEL ──
      // This is dramatically faster than sequential — if the first transcoding
      // fails, we don't waste 24s (3 IDs × 8s) before trying the next one.
      console.log(`[stream] Track ${trackId}: ${info.transcodings.length} transcodings, policy=${info.policy}, duration=${info.duration}s`);

      const resolvePromises = info.transcodings.map(async (tc) => {
        try {
          const resolved = await resolveStream(tc.url, info.trackAuthorization);
          if (!resolved) {
            return { tc, resolved: null, error: "resolve_failed" };
          }

          // For encrypted HLS: skip server-side CDN verification — unreliable without EME.
          // The client's HLS.js + Widevine will handle validation.
          // For plain streams: verify CDN accessibility.
          let verified = false;
          if (!tc.isEncrypted) {
            verified = await verifyCdnUrl(resolved.url, tc.isHls);
          } else {
            verified = true;
            console.log(`[stream] Encrypted ${tc.protocol} (q=${tc.quality}) resolved — skipping CDN verify (needs EME)`);
          }

          console.log(`[stream] Resolved ${tc.protocol} (q=${tc.quality}): verified=${verified}, encrypted=${tc.isEncrypted}, url=${resolved.url.substring(0, 60)}...`);

          return {
            tc,
            resolved,
            verified,
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
        verified: boolean;
      }> = [];

      for (const r of results) {
        if (r.resolved) {
          diagnostics.push(`resolved: ${r.tc.protocol}/${r.tc.quality}, verified=${r.verified}, encrypted=${r.tc.isEncrypted}`);

          resolvedStreams.push({
            url: r.resolved.url,
            protocol: r.tc.protocol,
            isHls: r.tc.isHls,
            isEncrypted: r.tc.isEncrypted,
            quality: r.tc.quality,
            ...(r.tc.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[r.tc.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
            ...(r.resolved.licenseAuthToken ? { licenseAuthToken: r.resolved.licenseAuthToken } : {}),
            verified: r.verified,
          });
        } else {
          diagnostics.push(`failed: ${r.tc.protocol}/${r.tc.quality}, error=${r.error}`);
        }
      }

      if (resolvedStreams.length > 0) {
        // Sort: verified first, encrypted (trusted) second, unverified last
        resolvedStreams.sort((a, b) => {
          if (a.verified && !b.verified) return -1;
          if (!a.verified && b.verified) return 1;
          // Within same verification status, prefer plain over encrypted as fallback
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

        return NextResponse.json({
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
          ...(fallbacks.length > 0 ? { fallbackStreams: fallbacks } : {}),
          _diag: diagnostics,
        });
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
