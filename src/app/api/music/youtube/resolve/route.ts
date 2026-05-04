import { NextRequest, NextResponse } from "next/server";
import { resolveYouTubeAudio } from "@/lib/youtube";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Resolve a Spotify track to a YouTube audio stream.
 * This is the main endpoint used by the PlayerBar for Spotify→YouTube fallback.
 *
 * Query params:
 *   title  — track title
 *   artist — artist name
 */
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const artist = searchParams.get("artist") || "";

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const result = await resolveYouTubeAudio(title.trim(), artist.trim());
    if (!result) {
      return NextResponse.json({ error: "No matching video found" }, { status: 404 });
    }
    return NextResponse.json({
      streamUrl: result.streamUrl,
      duration: result.duration,
      videoId: result.videoId,
    });
  } catch (err) {
    console.error("[YouTube Resolve] Error:", err);
    return NextResponse.json({ error: "Failed to resolve" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
