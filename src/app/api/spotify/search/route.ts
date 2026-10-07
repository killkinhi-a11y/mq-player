import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifySearch, lastDiag } from "@/lib/spotify/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/spotify/search?q=...&limit=10
 *
 * Spotify CATALOG search — tracks / artists / albums / playlists.
 * Catalog only: results carry metadata + artwork; playback is resolved
 * separately via /api/resolve (SoundCloud / Audius audio providers).
 *
 * Honest states:
 *   200 { configured: true,  tracks/artists/albums/playlists } — real data
 *   200 { configured: false, …empty } — SPOTIFY_CLIENT_ID/SECRET not set
 *   200 { configured: true, unavailable: true, …empty } — Spotify unreachable
 */

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit")) || 10));

  if (!isSpotifyConfigured()) {
    return NextResponse.json({
      configured: false,
      unavailable: false,
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
    });
  }

  if (!q) {
    return NextResponse.json({
      configured: true,
      unavailable: false,
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
    });
  }

  const key = `sp-search:${q.toLowerCase()}:${limit}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return NextResponse.json(hit.data);
  if (cache.size > 200) cache.clear();

  const result = await spotifySearch(q, limit);
  if (!result) {
    // Spotify unreachable — honest unavailable state (not an error: the rest
    // of the app keeps working with SoundCloud/Audius catalog). diag carries
    // the failure class (HTTP status / network) — never credentials.
    return NextResponse.json({
      configured: true,
      unavailable: true,
      diag: lastDiag,
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
    });
  }

  const payload = { configured: true, unavailable: false, ...result };
  cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json(payload);
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
