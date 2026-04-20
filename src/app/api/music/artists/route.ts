import { NextRequest, NextResponse } from "next/server";
import { searchSCArtists, searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/music/artists?q=hip-hop&limit=20
 * Search SoundCloud artists by query.
 *
 * GET /api/music/artists?similar=ArtistName&limit=20
 * Find artists similar to a given artist by searching their top tracks' genres.
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min cache

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const similar = searchParams.get("similar");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 5), 50);

  // Case 1: Direct artist search
  if (query && query.trim().length > 0) {
    const cacheKey = `artists:q:${query.toLowerCase()}:${limit}`;
    const cached = getFromCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    const artists = await searchSCArtists(query.trim(), limit);
    setCache(cacheKey, { artists });
    return NextResponse.json({ artists });
  }

  // Case 2: Find similar artists
  if (similar && similar.trim().length > 0) {
    const cacheKey = `artists:similar:${similar.toLowerCase()}:${limit}`;
    const cached = getFromCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Search for the artist's tracks to discover their genre
    const artistTracks = await searchSCTracks(similar.trim(), 5);
    if (artistTracks.length === 0) {
      // Fallback: just search by artist name + "related"
      const artists = await searchSCArtists(`${similar.trim()} new`, limit);
      const filtered = artists.filter(a => a.username.toLowerCase() !== similar.trim().toLowerCase());
      setCache(cacheKey, { artists: filtered });
      return NextResponse.json({ artists: filtered });
    }

    // Collect genres from the artist's tracks
    const genres = new Set<string>();
    for (const t of artistTracks) {
      if (t.genre && t.genre.length > 0) genres.add(t.genre);
    }
    const genreList = [...genres].slice(0, 3);

    // Search for artists in those genres
    const allArtists: Awaited<ReturnType<typeof searchSCArtists>> = [];
    const seenNames = new Set<string>([similar.trim().toLowerCase()]);

    // Search by each genre
    for (const genre of genreList) {
      const results = await searchSCArtists(genre, limit);
      for (const a of results) {
        if (!seenNames.has(a.username.toLowerCase())) {
          seenNames.add(a.username.toLowerCase());
          allArtists.push(a);
        }
      }
    }

    // Also search by artist name + "similar" as a fallback
    const simResults = await searchSCArtists(`${similar.trim()}`, limit);
    for (const a of simResults) {
      if (!seenNames.has(a.username.toLowerCase())) {
        seenNames.add(a.username.toLowerCase());
        allArtists.push(a);
      }
    }

    // Sort by followers (most popular first) and limit
    allArtists.sort((a, b) => b.followers - a.followers);
    const final = allArtists.slice(0, limit);

    setCache(cacheKey, { artists: final });
    return NextResponse.json({ artists: final });
  }

  return NextResponse.json({ artists: [] }, { status: 400 });
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
