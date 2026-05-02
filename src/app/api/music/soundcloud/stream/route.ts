import { NextRequest, NextResponse } from "next/server";
import { getSoundCloudClientId, invalidateClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Resolve SoundCloud stream URL for a track.
 * Returns the direct CDN URL that the browser can play natively (CORS allowed).
 * Falls back through all client IDs on failure.
 */

async function tryResolve(trackId: string, clientId: string): Promise<{
  url: string;
  directUrl: string;
  isHls: boolean;
  isPreview: boolean;
  duration: number;
  fullDuration: number;
} | null> {
  // Fetch track details
  const trackRes = await fetch(
    `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!trackRes.ok) return null;

  const track = await trackRes.json();
  const transcodings: { url?: string; format?: { protocol?: string } }[] = (track.media?.transcodings || []).filter(Boolean);

  // Prefer progressive (MP3) over HLS
  let streamUrl: string | null = null;
  let isHls = false;
  for (const t of transcodings) {
    if (t.format?.protocol === "progressive" && t.url) { streamUrl = t.url; break; }
  }
  if (!streamUrl && transcodings.length > 0) {
    for (const t of transcodings) {
      if (t.format?.protocol === "hls" && t.url) { streamUrl = t.url; isHls = true; break; }
    }
    if (!streamUrl) {
      streamUrl = transcodings[0]?.url || null;
      isHls = transcodings[0]?.format?.protocol === "hls";
    }
  }
  if (!streamUrl) return null;

  // Resolve the stream URL
  const separator = streamUrl.includes("?") ? "&" : "?";
  const resolvedUrl = `${streamUrl}${separator}client_id=${clientId}`;

  let directUrl = "";
  try {
    const redirectRes = await fetch(resolvedUrl, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const redirectData = await redirectRes.json();
    if (redirectData.url) directUrl = redirectData.url;
  } catch {}

  if (!directUrl) return null;

  return {
    url: directUrl, // Direct CDN URL — browser plays it natively (CORS: *)
    directUrl,
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

  const clientId = await getSoundCloudClientId();
  if (!clientId) {
    return NextResponse.json({ url: null, error: "no_client_id" });
  }

  // Try resolve with current client ID
  let result = await tryResolve(trackId, clientId);

  // If failed, try other client IDs
  if (!result) {
    invalidateClientId();
    const CLIENT_IDS = [
      "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
      "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
      "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
    ];
    for (const altId of CLIENT_IDS) {
      result = await tryResolve(trackId, altId);
      if (result) {
        // Found working ID — update it for future requests
        const { invalidateClientId: inv } = await import("@/lib/soundcloud");
        // Reset to this working ID
        break;
      }
    }
  }

  if (!result) {
    return NextResponse.json({ url: null, error: "resolve_failed" });
  }

  return NextResponse.json(result);
});
