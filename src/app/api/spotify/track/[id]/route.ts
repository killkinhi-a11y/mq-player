import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifyTrack } from "@/lib/spotify/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/spotify/track/[id]
 * Track details + album context + album tracks + primary artist profile.
 * Playback resolved via /api/resolve.
 */

const CACHE_TTL = 60 * 60 * 1000;
interface SpotifyTrackPayload {
  track: unknown;
  album: unknown;
  albumTracks: unknown[];
  artist: unknown;
}
const cache = new Map<string, { data: SpotifyTrackPayload; expiry: number }>();

async function handler(
  _request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) {
  const { id } = await ctx.params;
  const spotifyId = (id || "").replace(/^sp_/, "");
  if (!spotifyId || !/^[A-Za-z0-9]{16,30}$/.test(spotifyId)) {
    return NextResponse.json({ error: "Некорректный Spotify track id" }, { status: 400 });
  }

  if (!isSpotifyConfigured()) {
    return NextResponse.json({
      configured: false,
      unavailable: false,
      track: null,
      album: null,
      albumTracks: [],
      artist: null,
    });
  }

  const key = `sp-track:${spotifyId}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json({ configured: true, unavailable: false, ...hit.data });
  }
  if (cache.size > 200) cache.clear();

  const data = await spotifyTrack(spotifyId);
  if (!data) {
    return NextResponse.json({
      configured: true,
      unavailable: true,
      track: null,
      album: null,
      albumTracks: [],
      artist: null,
    });
  }

  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json({ configured: true, unavailable: false, ...data });
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
