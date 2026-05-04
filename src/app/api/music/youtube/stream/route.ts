import { NextRequest, NextResponse } from "next/server";
import { getYouTubeStream } from "@/lib/youtube";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Get YouTube audio stream URL for a video.
 *
 * Query params:
 *   videoId — YouTube video ID
 */
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const stream = await getYouTubeStream(videoId);
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }
    return NextResponse.json({
      url: stream.url,
      duration: stream.duration,
      bitrate: stream.bitrate,
      mimeType: stream.mimeType,
    });
  } catch (err) {
    console.error("[YouTube Stream] Error:", err);
    return NextResponse.json({ error: "Failed to get stream" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
