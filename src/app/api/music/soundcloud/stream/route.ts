import { NextRequest, NextResponse } from "next/server";
import { getSoundCloudClientId, invalidateClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Resolve SoundCloud stream URL for a track.
 *
 * Returns the transcoding template URL — the CLIENT will resolve it
 * by fetching the template + client_id to get the actual CDN URL.
 *
 * This avoids server-side resolve failures caused by SoundCloud's
 * CloudFront returning {} from certain server IPs/regions.
 * The browser can always reach the CDN (CORS: *).
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
        // Return the template URL + client_id — client will resolve to CDN URL
        const separator = info.streamUrl.includes("?") ? "&" : "?";
        const templateWithClient = `${info.streamUrl}${separator}client_id=${clientId}`;

        return NextResponse.json({
          // Client must fetch this URL to get the actual CDN URL
          resolveUrl: templateWithClient,
          isHls: info.isHls,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
        });
      }
    } catch {}
  }

  return NextResponse.json({ url: null, error: "resolve_failed" });
});
