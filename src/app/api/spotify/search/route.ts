import { NextRequest, NextResponse } from "next/server";
import { searchSpotify, spotifyTrackToAppTrack } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type") || "tracks";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ tracks: [], artists: [], albums: [], playlists: [] });
  }

  const types = type.split(",") as Array<"tracks" | "artists" | "albums" | "playlists">;

  try {
    const results = await searchSpotify(query.trim(), types, limit);

    // Convert Spotify tracks to app tracks
    const tracks = results.tracks.map(spotifyTrackToAppTrack);

    return NextResponse.json({
      tracks,
      artists: results.artists,
      albums: results.albums,
      playlists: results.playlists,
    });
  } catch {
    return NextResponse.json({ tracks: [], artists: [], albums: [], playlists: [] }, { status: 200 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
