import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyArtist } from "@/lib/spotify/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/spotify/artist/[id]
 *
 * Full artist page data from the Spotify catalog:
 *   artist (image, followers, genres) · topTracks · albums · singles · eps
 *   appearsOn · related artists.
 *
 * Playback: topTracks are catalog tracks — resolved to audio via /api/resolve.
 */

const CACHE_TTL = 30 * 60 * 1000; // artist pages are stable
const cache = new Map<string, { data: SpotifyArtistPayload; expiry: number }>();

interface SpotifyArtistPayload {
  artist: unknown;
  topTracks: unknown[];
  albums: unknown[];
  singles: unknown[];
  eps: unknown[];
  appearsOn: unknown[];
  related: unknown[];
}

const EMPTY = {
  artist: null,
  topTracks: [],
  albums: [],
  singles: [],
  eps: [],
  appearsOn: [],
  related: [],
};

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const spotifyId = (id || "").replace(/^spa_/, "");
  if (!spotifyId || !/^[A-Za-z0-9]{16,30}$/.test(spotifyId)) {
    return NextResponse.json({ error: "Некорректный Spotify artist id" }, { status: 400 });
  }

  if (!isSpotifyConfigured()) {
    return NextResponse.json({ configured: false, unavailable: false, ...EMPTY });
  }

  const key = `sp-artist:${spotifyId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json({ configured: true, unavailable: false, ...hit.data });
  }
  if (cache.size > 100) cache.clear();

  const data = await spotifyArtist(spotifyId);
  if (!data) {
    return NextResponse.json({ configured: true, unavailable: true, ...EMPTY });
  }

  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json({ configured: true, unavailable: false, ...data });
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
