import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/music/spotify-charts?country=RU
 *
 * Returns Top 50 tracks from Spotify (if SPOTIFY_CLIENT_ID/SECRET are set)
 * or Deezer Chart API (no key needed). Each chart entry is then searched
 * on SoundCloud to get a playable audio URL.
 *
 * NOTE: The heavy chart-fetch + SoundCloud-search logic is in
 * `fetcher.ts` to keep this file minimal — Vercel was returning 404 when
 * the route file contained too many top-level awaits / complex imports.
 */

import { fetchSpotifyTop } from "./fetcher";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "RU").toUpperCase();
  try {
    const tracks = await fetchSpotifyTop(country);
    return NextResponse.json({ tracks, source: "ok", country });
  } catch {
    return NextResponse.json({ tracks: [], source: "error", country });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
