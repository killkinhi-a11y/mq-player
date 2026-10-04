import type { LyricsResult } from "@/lib/lyrics/types";

export type { LyricsResult } from "@/lib/lyrics/types";

interface CacheEntry {
  data: LyricsResult;
  expiresAt: number;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 200; // LRU-ish cap (drop oldest by insertion order)
const cache = new Map<string, CacheEntry>();

/** Get cached lyrics result, or null if not cached / expired. */
export function getCached(key: string): LyricsResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/** Store lyrics result in cache with 30-minute TTL. */
export function setCached(key: string, data: LyricsResult): void {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** Build cache key from artist + title (+ album + duration when supplied). */
export function cacheKey(
  artist: string,
  title: string,
  album?: string,
  durationSec?: number,
): string {
  return [
    artist.toLowerCase(),
    title.toLowerCase(),
    (album || "").toLowerCase(),
    durationSec && durationSec > 0 ? Math.round(durationSec) : 0,
  ].join("|");
}

/** Clear all cached lyrics. */
export function clearCache(): void {
  cache.clear();
}
