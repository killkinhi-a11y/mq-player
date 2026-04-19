import { NextRequest, NextResponse } from "next/server";
import { getSoundCloudClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Resolve SoundCloud stream URL for a track.
 * Returns the direct MP3/HLS URL that can be played by HTML5 Audio.
 */

// Cache resolved stream URLs (they expire quickly, cache 3 min)
const streamCache = new Map<string, { url: string; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ url: null, error: "missing trackId" });
  }

  // Check cache
  const cached = streamCache.get(trackId);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ url: cached.url });
  }

  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) {
      return NextResponse.json({ url: null, error: "no_client_id" });
    }

    // Fetch track details to get media transcodings
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!trackRes.ok) {
      return NextResponse.json({ url: null, error: "track_not_found" });
    }

    const track = await trackRes.json();
    const transcodings = track.media?.transcodings || [];

    // Prefer progressive (MP3) over HLS
    let streamUrl: string | null = null;
    for (const t of transcodings) {
      if (t.format?.protocol === "progressive") {
        streamUrl = t.url;
        break;
      }
    }
    if (!streamUrl && transcodings.length > 0) {
      streamUrl = transcodings[0].url;
    }
    if (!streamUrl) {
      return NextResponse.json({ url: null, error: "no_transcodings" });
    }

    // Resolve the stream URL (append client_id)
    const separator = streamUrl.includes("?") ? "&" : "?";
    const resolvedUrl = `${streamUrl}${separator}client_id=${clientId}`;

    // Try to fetch the actual redirect URL
    try {
      const redirectRes = await fetch(resolvedUrl, {
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      const redirectData = await redirectRes.json();
      if (redirectData.url) {
        streamCache.set(trackId, {
          url: redirectData.url,
          expiry: Date.now() + 3 * 60 * 1000,
        });
        return NextResponse.json({
          url: redirectData.url,
          isPreview: track.policy === "SNIP",
          duration: Math.round((track.duration || 0) / 1000),
          fullDuration: Math.round((track.full_duration || 0) / 1000),
        });
      }
    } catch {
      // Fallback: return the resolved URL template
    }

    return NextResponse.json({
      url: resolvedUrl,
      isPreview: track.policy === "SNIP",
      duration: Math.round((track.duration || 0) / 1000),
      fullDuration: Math.round((track.full_duration || 0) / 1000),
    });
  } catch {
    return NextResponse.json({ url: null, error: "resolve_failed" });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
