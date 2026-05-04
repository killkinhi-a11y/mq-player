import { NextRequest, NextResponse } from "next/server";
import { getSpotifyArtist, spotifyTrackToAppTrack } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(
  _request: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  const { id } = await ctx?.params || {};

  if (!id) {
    return NextResponse.json({ error: "Artist ID required" }, { status: 400 });
  }

  try {
    const data = await getSpotifyArtist(id);
    if (!data || !data.artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    return NextResponse.json({
      artist: data.artist,
      topTracks: data.topTracks.map(spotifyTrackToAppTrack),
      albums: data.albums,
      relatedArtists: data.relatedArtists,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch artist" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
