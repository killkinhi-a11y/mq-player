import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyTrack } from "@/lib/spotify/catalog";
import { deezerTrack } from "@/lib/deezer/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/catalog/track/[id]?p=spotify|deezer
 * Track details + album context + album tracks + artist profile.
 * Playback resolved via /api/resolve.
 */

const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiry: number }>();

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const provider = new URL(_request.url).searchParams.get("p") === "spotify" ? "spotify" : "deezer";
  const cleanId = (id || "").replace(/^(sp_|dz_)/, "");
  if (!cleanId || !/^[A-Za-z0-9]{1,40}$/.test(cleanId)) {
    return NextResponse.json({ error: "Некорректный track id" }, { status: 400 });
  }

  const key = `cat-track:${provider}:${cleanId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return NextResponse.json(hit.data);
  if (cache.size > 200) cache.clear();

  if (provider === "spotify") {
    if (!isSpotifyConfigured()) {
      return NextResponse.json({ provider: "spotify", track: null, album: null, albumTracks: [], artist: null });
    }
    const data = await spotifyTrack(cleanId);
    if (!data) {
      return NextResponse.json({ provider: "spotify", track: null, album: null, albumTracks: [], artist: null });
    }
    const payload = { provider: "spotify", ...data };
    cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(payload);
  }

  const data = await deezerTrack(cleanId);
  if (!data) {
    return NextResponse.json({ provider: "deezer", track: null, album: null, albumTracks: [], artist: null });
  }
  const payload = { provider: "deezer", ...data };
  cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json(payload);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
