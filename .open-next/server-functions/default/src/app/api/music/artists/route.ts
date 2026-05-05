import { NextRequest, NextResponse } from "next/server";
import { searchSCArtists, searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/music/artists?q=hip-hop&limit=20
 * Search SoundCloud artists by query.
 * Falls back to extracting artists from track search if user search fails.
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

/**
 * Fallback: extract unique artists from track search results.
 * Used when searchSCArtists returns empty (e.g. all client IDs invalid).
 */
async function extractArtistsFromTracks(query: string, limit: number) {
  const tracks = await searchSCTracks(query, 50);
  if (tracks.length === 0) return [];

  // Group by artist, count occurrences, take most popular
  const artistMap = new Map<string, {
    username: string;
    avatar: string;
    genre: string;
    followers: number;
    trackCount: number;
    occurrences: number;
  }>();

  for (const t of tracks) {
    const name = t.artist;
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = artistMap.get(key);
    if (existing) {
      existing.occurrences++;
      // Use the best genre (non-empty)
      if (!existing.genre && t.genre) existing.genre = t.genre;
      // Use the first avatar we find
      if (!existing.avatar && t.cover) existing.avatar = t.cover;
    } else {
      artistMap.set(key, {
        username: name,
        avatar: t.cover || "",
        genre: t.genre || "",
        followers: t.scIsFull ? 1000 : 100, // heuristic
        trackCount: 1,
        occurrences: 1,
      });
    }
  }

  // Sort by occurrence count (most frequent = most relevant), then by followers
  const sorted = [...artistMap.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.followers - a.followers)
    .slice(0, limit);

  return sorted.map((a, i) => ({
    id: -(i + 1), // negative IDs to distinguish from real SC IDs
    username: a.username,
    avatar: a.avatar,
    followers: a.followers * a.occurrences,
    genre: a.genre,
    trackCount: a.occurrences,
  }));
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

    // Try direct artist search first
    let artists = await searchSCArtists(query.trim(), limit);

    // Fallback: extract from tracks if artist search returned nothing
    if (artists.length === 0) {
      artists = await extractArtistsFromTracks(query.trim(), limit);
    }

    setCache(cacheKey, { artists });
    return NextResponse.json({ artists });
  }

  // Case 2: Find similar artists
  if (similar && similar.trim().length > 0) {
    const cacheKey = `artists:similar:${similar.toLowerCase()}:${limit}`;
    const cached = getFromCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    const allArtists: { id: number; username: string; avatar: string; followers: number; genre: string; trackCount: number }[] = [];
    const seenNames = new Set<string>([similar.trim().toLowerCase()]);

    // Try direct artist search by artist name
    let artists = await searchSCArtists(similar.trim(), limit);
    for (const a of artists) {
      if (!seenNames.has(a.username.toLowerCase())) {
        seenNames.add(a.username.toLowerCase());
        allArtists.push(a);
      }
    }

    // Search for the artist's tracks to discover their genre
    const artistTracks = await searchSCTracks(similar.trim(), 10);
    if (artistTracks.length > 0) {
      // Collect genres from the artist's tracks
      const genres = new Set<string>();
      for (const t of artistTracks) {
        if (t.genre && t.genre.length > 0) genres.add(t.genre);
      }
      const genreList = [...genres].slice(0, 3);

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

      // Also extract artists from track results as fallback
      if (allArtists.length < 5) {
        const trackArtists = await extractArtistsFromTracks(similar.trim(), limit);
        for (const a of trackArtists) {
          if (!seenNames.has(a.username.toLowerCase())) {
            seenNames.add(a.username.toLowerCase());
            allArtists.push(a);
          }
        }
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
