import { NextRequest, NextResponse } from "next/server";
import { getSoundCloudClientId, invalidateClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Resolve SoundCloud stream URL for a track.
 *
 * The server resolves the template URL → actual CDN URL itself,
 * so the browser never hits the SoundCloud API (which lacks CORS headers).
 * Returns the final CDN URL directly.
 */

const CLIENT_IDS = [
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];

async function getTrackInfo(trackId: string, clientId: string) {
  const trackRes = await fetch(
    `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!trackRes.ok) return null;
  const track = await trackRes.json();

  const transcodings: { url?: string; format?: { protocol?: string } }[] =
    (track.media?.transcodings || []).filter(Boolean);

  // Find the best transcoding
  let streamUrl: string | null = null;
  let isHls = false;

  // Prefer non-encrypted progressive
  for (const t of transcodings) {
    if (t.format?.protocol === "progressive" && t.url) {
      streamUrl = t.url;
      break;
    }
  }
  // Then non-encrypted HLS
  if (!streamUrl) {
    for (const t of transcodings) {
      if (t.format?.protocol === "hls" && t.url) {
        streamUrl = t.url;
        isHls = true;
        break;
      }
    }
  }
  // Then any available
  if (!streamUrl && transcodings.length > 0) {
    const t = transcodings[0];
    if (t.url) {
      streamUrl = t.url;
      isHls = !!(t.format?.protocol === "hls" || t.format?.protocol?.includes("hls"));
    }
  }

  if (!streamUrl) return null;

  return {
    streamUrl,
    isHls,
    isPreview: track.policy === "SNIP",
    duration: Math.round((track.duration || 0) / 1000),
    fullDuration: Math.round((track.full_duration || 0) / 1000),
  };
}

/**
 * Server-side resolve: fetch the template URL to get the actual CDN URL.
 * Tries all client IDs since some may be rate-limited.
 */
async function resolveCdnUrl(templateUrl: string): Promise<string | null> {
  for (const clientId of CLIENT_IDS) {
    try {
      const separator = templateUrl.includes("?") ? "&" : "?";
      const resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;
      const res = await fetch(resolveUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) return data.url;
      }
    } catch {}
  }
  return null;
}

export const GET = withRateLimit(RATE_LIMITS.read, async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ url: null, error: "missing trackId" });
  }

  // Try each client ID until one returns track info
  for (let i = 0; i < CLIENT_IDS.length; i++) {
    const clientId = CLIENT_IDS[i];
    try {
      const info = await getTrackInfo(trackId, clientId);
      if (info) {
        // Server-side resolve: template URL → actual CDN URL
        // This avoids CORS issues — the browser never hits SoundCloud API
        const cdnUrl = await resolveCdnUrl(info.streamUrl);

        if (cdnUrl) {
          return NextResponse.json({
            url: cdnUrl,
            isHls: info.isHls,
            isPreview: info.isPreview,
            duration: info.duration,
            fullDuration: info.fullDuration,
          });
        }

        // CDN resolve failed — return null so client can handle gracefully
        return NextResponse.json({
          url: null,
          isHls: info.isHls,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
          error: "cdn_resolve_failed",
        });
      }
    } catch {}
  }

  return NextResponse.json({ url: null, error: "resolve_failed" });
});
