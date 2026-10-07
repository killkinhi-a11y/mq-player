import { NextRequest, NextResponse } from "next/server";
import { isSpotifyConfigured, spotifySuggestions } from "@/lib/spotify/catalog";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/spotify/suggestions?q=...
 * Typeahead suggestions from real Spotify track names.
 * 200 { configured, suggestions: string[] } — honest empty when unavailable.
 */

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: string[]; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (!isSpotifyConfigured()) {
    return NextResponse.json({ configured: false, suggestions: [] });
  }
  if (!q) {
    return NextResponse.json({ configured: true, suggestions: [] });
  }

  const key = `sp-sug:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) {
    return NextResponse.json({ configured: true, suggestions: hit.data });
  }

  const suggestions = await spotifySuggestions(q);
  if (!suggestions) {
    return NextResponse.json({ configured: true, unavailable: true, suggestions: [] });
  }

  if (cache.size > 300) cache.clear();
  cache.set(key, { data: suggestions, expiry: Date.now() + CACHE_TTL });
  return NextResponse.json({ configured: true, suggestions });
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
