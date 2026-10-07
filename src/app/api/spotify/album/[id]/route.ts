import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyAlbum } from "@/lib/spotify/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/spotify/album/[id]
 * Album details (cover, year, label, total duration, track count) + tracks.
 * Tracks are catalog tracks — playback resolved via /api/resolve.
 */

const CACHE_TTL = 60 * 60 * 1000; // albums never change
interface SpotifyAlbumPayload { album: unknown; tracks: unknown[] }
const cache = new Map<string, { data: SpotifyAlbumPayload; expiry: number }>();

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const spotifyId = (id || "").replace(/^spl_/, "");
  if (!spotifyId || !/^[A-Za-z0-9]{16,30}$/.test(spotifyId)) {
    return NextResponse.json({ error: "Некорректный Spotify album id" }, { status: 400 });
  }

  if (!isSpotifyConfigured()) {
    return NextResponse.json({ configured: false, unavailable: false, album: null, tracks: [] });
  }

  const key = `sp-album:${spotifyId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json({ configured: true, unavailable: false, ...hit.data });
  }
  if (cache.size > 150) cache.clear();

  const data = await spotifyAlbum(spotifyId);
  if (!data) {
    return NextResponse.json({ configured: true, unavailable: true, album: null, tracks: [] });
  }

  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json({ configured: true, unavailable: false, ...data });
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
