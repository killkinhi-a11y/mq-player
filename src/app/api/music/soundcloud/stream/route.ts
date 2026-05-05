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
 * Strategy:
 * 1. Get track info from SC API (with track_authorization JWT)
 * 2. Collect ALL transcodings ordered by priority
 * 3. Try to resolve each one — return the first that succeeds
 * 4. Priority: progressive > ctr-encrypted-hls > cbc-encrypted-hls > hls
 *
 * IMPORTANT: We do NOT block CTR-HLS streams just because server-side CDN
 * verification fails. The client-side HLS.js + Widevine EME pipeline can
 * often play streams that fail server-side HEAD checks (different IP/geo).
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

    const transcodings: Transcoding[] = (track.media?.transcodings || []).filter(Boolean);
    const picked = collectTranscodings(transcodings);
    if (picked.length === 0) return null;

    return {
      transcodings: picked,
      isPreview: track.policy === "SNIP",
      duration: Math.round((track.duration || 0) / 1000),
      fullDuration: Math.round((track.full_duration || 0) / 1000),
      trackAuthorization: (track as Record<string, unknown>).track_authorization as string || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Server-side resolve: fetch the template URL to get the actual URL.
 * Tries all client IDs since some may be rate-limited.
 * Includes track_authorization JWT which SC now requires for media resolution.
 */
async function resolveUrl(templateUrl: string, trackAuthorization: string): Promise<string | null> {
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
          if (data.url) return data.url;
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
 * For HLS (plain or encrypted): fetch the first bytes to verify it's a valid m3u8.
 *   NOTE: We do NOT verify init.mp4 for encrypted streams. The server-side HEAD/GET
 *   request may get 403 from CDN (different IP/geo than the user, no EME context),
 *   but the client-side HLS.js + Widevine CDM can successfully fetch it. Let the
 *   client's EME pipeline handle encrypted stream validation.
 *
 * For progressive: send a HEAD request to verify the URL responds with 200.
 */
async function verifyCdnUrl(url: string, isHls: boolean): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const uaHeader = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
    try {
      if (isHls) {
        // For HLS: fetch first bytes to verify it's a valid m3u8 playlist
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { ...uaHeader, "Range": "bytes=0-2047" },
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

  // Try each client ID until one returns track info
  for (const clientId of CLIENT_IDS) {
    try {
      const info = await getTrackInfo(trackId, clientId);
      if (!info) continue;

      // Try ALL transcodings in priority order — verify each CDN URL
      // Collect both verified and unverified resolved streams as fallbacks
      const verifiedStreams: Array<{
        url: string;
        protocol: string;
        isHls: boolean;
        isEncrypted: boolean;
        quality: string;
        licenseUrl?: string;
      }> = [];
      const unverifiedStreams: Array<{
        url: string;
        protocol: string;
        isHls: boolean;
        isEncrypted: boolean;
        quality: string;
        licenseUrl?: string;
      }> = [];

      for (const tc of info.transcodings) {
        const resolvedUrl = await resolveUrl(tc.url, info.trackAuthorization);

        if (resolvedUrl) {
          const streamObj = {
            url: resolvedUrl,
            protocol: tc.protocol,
            isHls: tc.isHls,
            isEncrypted: tc.isEncrypted,
            quality: tc.quality,
            ...(tc.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[tc.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
          };
          // Verify the CDN URL returns a valid m3u8 / responds OK
          const isValid = await verifyCdnUrl(resolvedUrl, tc.isHls);
          if (isValid) {
            verifiedStreams.push(streamObj);
          } else {
            console.warn(`[stream] CDN verification failed for ${tc.protocol} (q=${tc.quality}) — keeping as unverified fallback`);
            unverifiedStreams.push(streamObj);
          }
        }
      }

      // Merge: verified first, then unverified — ALL become potential fallbacks
      const allStreams = [...verifiedStreams, ...unverifiedStreams];

      if (allStreams.length > 0) {
        // Return the best (first) stream as primary, ALL others as fallbacks
        const primary = allStreams[0];
        const fallbacks = allStreams.slice(1);
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
          ...(fallbacks.length > 0 ? { fallbackStreams: fallbacks } : {}),
        });
      }

      // ── No stream passed CDN verification ──
      // Server-side verification can fail for CTR-HLS due to geo/IP mismatch.
      // The client-side HLS.js + Widevine EME pipeline often succeeds where
      // the server fails. Return the best unverified stream for client to try.
      //
      // Prefer CTR-HLS (Widevine) over CBC-HLS (FairPlay) since CTR works
      // in Chrome/Firefox/Edge — the vast majority of users.
      const hasCtr = info.transcodings.some(tc => tc.protocol === "ctr-encrypted-hls");
      const bestUnverified = hasCtr
        ? info.transcodings.find(tc => tc.protocol === "ctr-encrypted-hls") || info.transcodings[0]
        : info.transcodings[0];

      // Try to resolve the best unverified stream's actual URL
      const bestUrl = await resolveUrl(bestUnverified.url, info.trackAuthorization);
      if (bestUrl) {
        return NextResponse.json({
          url: bestUrl,
          trackAuthorization: info.trackAuthorization,
          isHls: bestUnverified.isHls,
          isEncrypted: bestUnverified.isEncrypted,
          protocol: bestUnverified.protocol,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
          ...(bestUnverified.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[bestUnverified.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
          // Only truly DRM-restricted if ONLY CBC-HLS (FairPlay/Safari) available
          drmRestricted: info.transcodings.every(tc => tc.protocol === "cbc-encrypted-hls"),
        });
      }

      // Even resolveUrl failed — return template URL for client-side resolve-proxy
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
      });
    } catch {}
  }

  return NextResponse.json({ url: null, resolveUrl: null, error: "resolve_failed" });
}
