import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { searchSpotify, spotifyTrackToAppTrack } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Unified Search API — SoundCloud + Spotify.
 *
 * Query params:
 *   q       — search query (required)
 *   source  — "soundcloud" | "spotify" | "all" (default: "all")
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const source = (searchParams.get("source") || "all") as "soundcloud" | "spotify" | "all";

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ tracks: [], artists: [], albums: [] });
  }

  const trimmed = query.trim();
  const cacheKey = `search:${trimmed.toLowerCase()}:${source}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const allTracks: import("@/lib/musicApi").Track[] = [];
    let artists: unknown[] = [];
    let albums: unknown[] = [];

    // SoundCloud search
    if (source === "all" || source === "soundcloud") {
      const scTracks = await searchSCTracks(trimmed, 20);
      allTracks.push(...scTracks);
    }

    // Spotify search
    if (source === "all" || source === "spotify") {
      const spResults = await searchSpotify(trimmed, ["tracks", "artists", "albums"], 20);
      allTracks.push(...spResults.tracks.map(spotifyTrackToAppTrack));
      artists = spResults.artists;
      albums = spResults.albums;
    }

    const responseData = {
      tracks: allTracks.slice(0, 40),
      artists: artists || [],
      albums: albums || [],
    };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [], artists: [], albums: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, handler);
