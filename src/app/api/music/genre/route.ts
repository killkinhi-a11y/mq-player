import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";

/**
 * Genre browse API — searches SoundCloud by genre name.
 * Used by SearchView's genre chips.
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min (genre results change slowly)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre");

  if (!genre || genre.trim().length === 0) {
    return NextResponse.json({ tracks: [] });
  }

  const cacheKey = `genre:${genre.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return NextResponse.json(cached);

  try {
    const tracks = await searchSCTracks(genre.trim(), 30);
    const responseData = { tracks };
    cache.set(cacheKey, { data: responseData, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
