import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Smart Recommendations API — generates recommendations based on user taste profile.
 * Accepts: genres[], artists[], excludeIds[]
 * Falls back to random discovery if no taste data.
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 8 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre") || "random";
  const genresParam = searchParams.get("genres");
  const artistsParam = searchParams.get("artists");
  const excludeParam = searchParams.get("excludeIds");
  const dislikedParam = searchParams.get("dislikedIds");
  const dislikedArtistsParam = searchParams.get("dislikedArtists");
  const dislikedGenresParam = searchParams.get("dislikedGenres");

  const excludeIds = new Set(
    (excludeParam || "").split(",").filter(Boolean)
  );
  const dislikedIds = new Set(
    (dislikedParam || "").split(",").filter(Boolean)
  );

  // Artists/genres to avoid from disliked tracks
  const dislikedArtists = new Set(
    (dislikedArtistsParam || "").split(",").filter(Boolean).map(a => a.toLowerCase())
  );
  const dislikedGenres = new Set(
    (dislikedGenresParam || "").split(",").filter(Boolean).map(g => g.toLowerCase())
  );

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 3) : [];

  const tasteKey = `${genre}:${genresParam || ""}:${artistsParam || ""}:${dislikedParam || ""}:${dislikedArtistsParam || ""}:${dislikedGenresParam || ""}`;
  const cacheKey = `rec:smart:${tasteKey}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    let queries: string[] = [];

    if (genres.length > 0 || artists.length > 0) {
      // Taste-based: search for specific genres and artists
      for (const g of genres.slice(0, 3)) {
        queries.push(g);  // Simple genre search works better
      }
      for (const a of artists.slice(0, 2)) {
        queries.push(a);
      }
      // Add related searches
      if (genres.length > 0) {
        queries.push(`${genres[0]} new`);
        queries.push(`best ${genres[0]}`);
      }
    } else if (genre !== "random") {
      queries = [genre, `${genre} new`, `top ${genre}`];
    } else {
      // Better fallback: popular/trending searches
      const fallbacks = [
        "new music", "trending", "popular", "chill", "lofi",
        "electronic", "indie", "hip hop", "rock", "jazz",
        "ambient", "deep house", "synthwave", "r&b soul",
        "drum and bass", "techno", "acoustic", "piano"
      ];
      queries = fallbacks.sort(() => Math.random() - 0.5).slice(0, 3);
    }

    queries = [...new Set(queries)].slice(0, 4);

    const results = await Promise.allSettled(
      queries.map((q) => searchSCTracks(q, 12))
    );

    const allTracks: Awaited<ReturnType<typeof searchSCTracks>> = [];
    const seenIds = new Set<number>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const track of result.value) {
        if (excludeIds.has(track.id)) continue;
        if (seenIds.has(track.scTrackId)) continue;
        // Filter out tracks from disliked artists
        if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
        // Filter out tracks from disliked genres
        if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(track.genre.toLowerCase())) continue;
        // Also filter disliked tracks by id
        if (dislikedIds.has(track.id)) continue;
        // Filter out tracks without artwork for better quality
        if (!track.cover) continue;
        // Skip very short tracks
        if (track.duration && track.duration < 30) continue;
        seenIds.add(track.scTrackId);
        allTracks.push(track);
      }
    }

    const responseData = { tracks: allTracks.sort(() => Math.random() - 0.5).slice(0, 15) };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
