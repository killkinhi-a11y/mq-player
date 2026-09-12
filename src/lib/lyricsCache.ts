import type { LyricLine } from "@/components/mq/LyricsView";

export interface LyricsResult {
  lyrics: LyricLine[];
  plainText: string;
  synced: boolean;
  source: "lrclib" | "server" | "none";
}

interface CacheEntry {
  data: LyricsResult;
  expiresAt: number;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
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
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** Build cache key from artist + title. */
export function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase()}|${title.toLowerCase()}`;
}

/** Clear all cached lyrics. */
export function clearCache(): void {
  cache.clear();
}
