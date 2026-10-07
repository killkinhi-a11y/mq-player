import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyAlbum } from "@/lib/spotify/catalog";
import { deezerAlbum } from "@/lib/deezer/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/catalog/album/[id]?p=spotify|deezer
 * Album details (cover, year, duration, track count) + tracks.
 * Tracks are catalog tracks — playback resolved via /api/resolve.
 */

const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiry: number }>();

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const provider = new URL(_request.url).searchParams.get("p") === "spotify" ? "spotify" : "deezer";
  const cleanId = (id || "").replace(/^(spl_|dzl_)/, "");
  if (!cleanId || !/^[A-Za-z0-9]{1,40}$/.test(cleanId)) {
    return NextResponse.json({ error: "Некорректный album id" }, { status: 400 });
  }

  const key = `cat-album:${provider}:${cleanId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return NextResponse.json(hit.data);
  if (cache.size > 150) cache.clear();

  if (provider === "spotify") {
    if (!isSpotifyConfigured()) {
      return NextResponse.json({ provider: "spotify", album: null, tracks: [] });
    }
    const data = await spotifyAlbum(cleanId);
    if (!data) return NextResponse.json({ provider: "spotify", album: null, tracks: [] });
    const payload = { provider: "spotify", ...data };
    cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(payload);
  }

  const data = await deezerAlbum(cleanId);
  if (!data) return NextResponse.json({ provider: "deezer", album: null, tracks: [] });
  const payload = { provider: "deezer", ...data };
  cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json(payload);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
