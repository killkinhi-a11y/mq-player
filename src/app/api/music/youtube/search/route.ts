import { NextRequest, NextResponse } from "next/server";
import { searchYouTubeMusic } from "@/lib/youtube";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Search YouTube Music for tracks.
 *
 * Query params:
 *   q       — search query (track title)
 *   artist  — artist name (optional, improves results)
 *   limit   — max results (default: 3)
 */
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const artist = searchParams.get("artist") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "3", 10), 10);

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [], error: "Query is required" }, { status: 400 });
  }

  try {
    const results = await searchYouTubeMusic(query.trim(), artist.trim(), limit);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[YouTube Search] Error:", err);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
