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
 */
function collectTranscodings(transcodings: Transcoding[]): PickedTranscoding[] {
  const result: PickedTranscoding[] = [];

  // 1. Progressive (unencrypted MP3) — best for old tracks
  for (const t of transcodings) {
    if (t.format?.protocol === "progressive" && t.url) {
      result.push({ url: t.url, protocol: "progressive", isHls: false, isEncrypted: false });
    }
  }
  // 2. CTR encrypted HLS — works in Chrome/Firefox/Edge via HLS.js + EME (Widevine)
  for (const t of transcodings) {
    if (t.format?.protocol === "ctr-encrypted-hls" && t.url) {
      result.push({ url: t.url, protocol: "ctr-encrypted-hls", isHls: true, isEncrypted: true });
    }
  }
  // 3. CBC encrypted HLS — works in Safari (FairPlay)
  for (const t of transcodings) {
    if (t.format?.protocol === "cbc-encrypted-hls" && t.url) {
      result.push({ url: t.url, protocol: "cbc-encrypted-hls", isHls: true, isEncrypted: true });
    }
  }
  // 4. Plain HLS (unencrypted) — may still work for some tracks
  for (const t of transcodings) {
    if (t.format?.protocol === "hls" && t.url) {
      result.push({ url: t.url, protocol: "hls", isHls: true, isEncrypted: false });
    }
  }

  return result;
}

async function getTrackInfo(trackId: string, clientId: string): Promise<TrackInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      { signal: controller.signal }
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
 * Some SC tracks resolve to signed CDN URLs that return 403/404 (e.g. CTR-HLS init.mp4).
 * This check prevents returning broken URLs to the client.
 *
 * For encrypted HLS: also checks init.mp4 accessibility (critical for DRM init).
 * For plain HLS: fetches the first 512 bytes to verify it's a valid m3u8.
 * For progressive: sends a HEAD request to verify the URL responds with 200.
 */
async function verifyCdnUrl(url: string, isHls: boolean, isEncrypted: boolean): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const uaHeader = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
    try {
      if (isHls) {
        // For HLS: fetch playlist to verify it's a valid m3u8
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { ...uaHeader, "Range": "bytes=0-2047" },
        });
        if (!res.ok) return false;
        const text = await res.text();
        const isValidM3u8 = text.includes("#EXTM3U") || text.includes("#EXT-X-");
        if (!isValidM3u8) return false;

        // For encrypted HLS: also verify init.mp4 is accessible (DRM init segment)
        // Some tracks return 200 for m3u8 but 403 for init.mp4 → DRM pipeline fails
        if (isEncrypted) {
          // Extract the init.mp4 URI from the playlist
          // Format: #EXT-X-MAP:URI="init.mp4"  or  #EXT-X-MAP:URI="https://..."
          const initMatch = text.match(/#EXT-X-MAP[^"]*"([^"]+)"/);
          if (initMatch) {
            let initUrl = initMatch[1];
            // Resolve relative URLs against the playlist URL
            if (initUrl.startsWith("/")) {
              const playlistUrl = new URL(url);
              initUrl = `${playlistUrl.origin}${initUrl}`;
            } else if (!initUrl.startsWith("http")) {
              const lastSlash = url.lastIndexOf("/");
              initUrl = url.substring(0, lastSlash + 1) + initUrl;
            }
            // HEAD request to check init.mp4 accessibility
            const initRes = await fetch(initUrl, {
              method: "HEAD",
              signal: controller.signal,
              headers: uaHeader,
            });
            if (!initRes.ok) {
              console.warn(`[stream] init.mp4 returned ${initRes.status} for encrypted stream — skipping`);
              return false;
            }
          }
        }
        return true;
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

      // Try ALL transcodings in priority order — verify each CDN URL actually works
      const verifiedStreams: Array<{
        url: string;
        protocol: string;
        isHls: boolean;
        isEncrypted: boolean;
        licenseUrl?: string;
      }> = [];

      for (const tc of info.transcodings) {
        const resolvedUrl = await resolveUrl(tc.url, info.trackAuthorization);

        if (resolvedUrl) {
          // Verify the CDN URL is actually accessible (not 403/404)
          const isValid = await verifyCdnUrl(resolvedUrl, tc.isHls, tc.isEncrypted);
          if (isValid) {
            verifiedStreams.push({
              url: resolvedUrl,
              protocol: tc.protocol,
              isHls: tc.isHls,
              isEncrypted: tc.isEncrypted,
              ...(tc.isEncrypted ? { licenseUrl: SC_LICENSE_URLS[tc.protocol] || SC_LICENSE_URL_FALLBACK } : {}),
            });
          } else {
            console.warn(`[stream] CDN URL verification failed for ${tc.protocol} — skipping`);
          }
        }
      }

      if (verifiedStreams.length > 0) {
        // Return the best (first verified) stream as primary, plus all alternatives as fallbacks
        const primary = verifiedStreams[0];
        const fallbacks = verifiedStreams.slice(1);
        return NextResponse.json({
          url: primary.url,
          trackAuthorization: info.trackAuthorization,
          isHls: primary.isHls,
          isEncrypted: primary.isEncrypted,
          protocol: primary.protocol,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
          ...(primary.licenseUrl ? { licenseUrl: primary.licenseUrl } : {}),
          // Include fallback streams for client-side retry if primary fails
          ...(fallbacks.length > 0 ? { fallbackStreams: fallbacks } : {}),
        });
      }

      // All transcodings failed verification — return first template URL for client-side retry
      const fallback = info.transcodings[0];
      const separator = fallback.url.includes("?") ? "&" : "?";
      let fallbackUrl = `${fallback.url}${separator}client_id=${clientId}`;
      if (info.trackAuthorization) {
        fallbackUrl += `&track_authorization=${encodeURIComponent(info.trackAuthorization)}`;
      }

      // All transcodings failed verification — track may be DRM-only
      // Check if all transcodings were encrypted (DRM restricted track)
      const allEncrypted = info.transcodings.every(tc => tc.isEncrypted);

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
        // Flag for client: all streams are DRM-protected and none could be verified
        drmRestricted: allEncrypted,
        error: allEncrypted ? "drm_restricted" : "all_streams_failed_verification",
      });
    } catch {}
  }

  return NextResponse.json({ url: null, resolveUrl: null, error: "resolve_failed" });
}
