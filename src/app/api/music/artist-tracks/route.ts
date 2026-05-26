import { NextRequest, NextResponse } from "next/server";
import { searchSCArtists, getSCUserTracks, searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/music/artist-tracks?q=ArtistName&limit=20
 *
 * 1. Search for the artist on SoundCloud to get their user ID + avatar
 * 2. Fetch their tracks sorted by release date (newest first)
 * 3. Return both artist info and tracks
 *
 * Falls back to generic search if artist lookup fails.
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 8 * 60 * 1000; // 8 min cache

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
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 5), 50);

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ tracks: [], artist: null });
  }

  const cacheKey = `artist-tracks:${query.trim().toLowerCase()}:${limit}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Step 1: Find the artist on SoundCloud
    const artists = await searchSCArtists(query.trim(), 5);
    let artistInfo: { id: number; username: string; avatar: string; followers: number; genre: string; trackCount: number } | null = null;
    let tracks: Awaited<ReturnType<typeof getSCUserTracks>> = [];

    // Find exact or best match
    const queryLower = query.trim().toLowerCase();
    const match = artists.find(a => a.username.toLowerCase() === queryLower)
      || artists.find(a => a.username.toLowerCase().includes(queryLower))
      || artists[0];

    if (match) {
      artistInfo = match;

      // Step 2: Get artist's tracks sorted by release date (newest first)
      tracks = await getSCUserTracks(match.id, limit);

      // If no tracks from user endpoint, fallback to search filtered by artist
      if (tracks.length === 0) {
        const searchResults = await searchSCTracks(query.trim(), limit);
        // Only keep tracks from this specific artist
        tracks = searchResults.filter(t => t.artist.toLowerCase() === match!.username.toLowerCase());
        if (tracks.length === 0) {
          // Second fallback: include tracks where artist name is similar
          tracks = searchResults.filter(t => t.artist.toLowerCase().includes(queryLower) || queryLower.includes(t.artist.toLowerCase()));
        }
      }
    } else {
      // Fallback: search tracks and try to extract artist info from results
      const searchResults = await searchSCTracks(query.trim(), limit);
      // Filter to tracks from this artist
      tracks = searchResults.filter(t => t.artist.toLowerCase().includes(queryLower) || queryLower.includes(t.artist.toLowerCase()));
      // Try to get artist info from track data (first track's user)
      if (searchResults.length > 0 && tracks.length > 0) {
        // Build a basic artist object from the most relevant track
        const bestTrack = tracks[0] || searchResults[0];
        artistInfo = {
          id: -(Date.now() % 100000), // negative placeholder ID
          username: query.trim(),
          avatar: bestTrack.cover || "",
          followers: 0,
          genre: bestTrack.genre || "",
          trackCount: tracks.length,
        };
      }
    }

    const responseData = {
      tracks,
      artist: artistInfo ? {
        id: artistInfo.id,
        username: artistInfo.username,
        avatar: artistInfo.avatar,
        followers: artistInfo.followers,
        genre: artistInfo.genre,
        trackCount: artistInfo.trackCount,
      } : null,
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [], artist: null });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
