import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyArtist } from "@/lib/spotify/catalog";
import { deezerArtist } from "@/lib/deezer/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/catalog/artist/[id]?p=spotify|deezer
 * Provider-agnostic artist page: top tracks, albums, singles, EPs,
 * appears-on, related. `p` selects the provider (default: deezer — ids are
 * provider-native). Playback is resolved via /api/resolve.
 */

const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiry: number }>();

const EMPTY = (provider: string) => ({
  provider,
  artist: null,
  topTracks: [],
  albums: [],
  singles: [],
  eps: [],
  appearsOn: [],
  related: [],
});

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const provider = new URL(_request.url).searchParams.get("p") === "spotify" ? "spotify" : "deezer";
  const cleanId = (id || "").replace(/^(spa_|dza_)/, "");
  if (!cleanId || !/^[A-Za-z0-9]{1,40}$/.test(cleanId)) {
    return NextResponse.json({ error: "Некорректный artist id" }, { status: 400 });
  }

  const key = `cat-artist:${provider}:${cleanId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return NextResponse.json(hit.data);
  if (cache.size > 100) cache.clear();

  if (provider === "spotify") {
    if (!isSpotifyConfigured()) return NextResponse.json(EMPTY("spotify"));
    const data = await spotifyArtist(cleanId);
    if (!data) return NextResponse.json(EMPTY("spotify"));
    const payload = { provider: "spotify", ...data };
    cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(payload);
  }

  const data = await deezerArtist(cleanId);
  if (!data) return NextResponse.json(EMPTY("deezer"));
  const payload = { provider: "deezer", ...data };
  cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json(payload);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
