import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { searchAudiusTracks } from "@/lib/audius";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Unified Search API — SoundCloud + Audius.
 *
 * Audius is a free, decentralized music platform with no API key required.
 * If SoundCloud fails (client_id expired), Audius results still come through.
 *
 * Query params:
 *   q       — search query (required)
 *   source  — "soundcloud" | "audius" | "all" (default: "all")
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const source = searchParams.get("source") || "all";

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ tracks: [] });
  }

  const trimmed = query.trim();
  const cacheKey = `search:${source}:${trimmed.toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const allTracks: import("@/lib/musicApi").Track[] = [];

    // Run searches in parallel for speed
    const searchPromises: Promise<import("@/lib/musicApi").Track[]>[] = [];

    if (source === "all" || source === "soundcloud") {
      searchPromises.push(
        searchSCTracks(trimmed, 50).catch(() => [])
      );
    }

    if (source === "all" || source === "audius") {
      searchPromises.push(
        searchAudiusTracks(trimmed, 30).catch(() => [])
      );
    }

    const results = await Promise.allSettled(searchPromises);
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        allTracks.push(...result.value);
      }
    }

    const responseData = {
      tracks: allTracks.slice(0, 100),
    };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, handler);
