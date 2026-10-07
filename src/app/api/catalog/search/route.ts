import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifySearch, lastDiag } from "@/lib/spotify/catalog";
import { deezerSearch } from "@/lib/deezer/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/catalog/search?q=...&limit=10
 *
 * Provider-agnostic CATALOG search: Spotify when its Web API is reachable
 * (requires extended-quota app), Deezer as the open fallback. Catalog only —
 * playback is resolved separately via /api/resolve.
 *
 * Response carries the ACTIVE provider so badges/attribution stay honest:
 *   { provider: "spotify" | "deezer", tracks, artists, albums }
 *   { provider: "none" } — honest empty when both are unreachable.
 */

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit")) || 10));

  if (!q) {
    return NextResponse.json({ provider: "none", tracks: [], artists: [], albums: [] });
  }

  const key = `cat-search:${q.toLowerCase()}:${limit}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return NextResponse.json(hit.data);
  if (cache.size > 200) cache.clear();

  // ── 1) Spotify (preferred catalog — richest metadata) ──
  if (isSpotifyConfigured()) {
    const sp = await spotifySearch(q, limit);
    if (sp && (sp.tracks.length > 0 || sp.artists.length > 0 || sp.albums.length > 0)) {
      const payload = {
        provider: "spotify" as const,
        ...sp,
        playlists: sp.playlists || [],
      };
      cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
      return NextResponse.json(payload);
    }
  }

  // ── 2) Deezer (open catalog — no credentials) ──
  const dz = await deezerSearch(q, limit);
  if (dz && (dz.tracks.length > 0 || dz.artists.length > 0 || dz.albums.length > 0)) {
    const payload = { provider: "deezer" as const, playlists: [], ...dz };
    cache.set(key, { data: payload, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(payload);
  }

  // ── 3) Honest empty (SoundCloud/Audius search still works) ──
  const payload = {
    provider: "none" as const,
    diag: lastDiag,
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
  };
  return NextResponse.json(payload);
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
