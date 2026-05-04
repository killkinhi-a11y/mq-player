import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAlbum, spotifyTrackToAppTrack } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(
  _request: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  const { id } = await ctx?.params || {};

  if (!id) {
    return NextResponse.json({ error: "Album ID required" }, { status: 400 });
  }

  try {
    const data = await getSpotifyAlbum(id);
    if (!data) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json({
      album: data.album,
      artist: data.artist,
      tracks: data.tracks.map(spotifyTrackToAppTrack),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch album" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
