import { NextRequest, NextResponse } from "next/server";
import { getSpotifyPlaylist, spotifyTrackToAppTrack } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(
  _request: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  const { id } = await ctx?.params || {};

  if (!id) {
    return NextResponse.json({ error: "Playlist ID required" }, { status: 400 });
  }

  try {
    const data = await getSpotifyPlaylist(id);
    if (!data) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      tracks: data.tracks.map(spotifyTrackToAppTrack),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
