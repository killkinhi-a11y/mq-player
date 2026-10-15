"use client";

/**
 * Client-side search result cache (5 min TTL, 30 entries LRU).
 *
 * The server route already caches, but every repeat query still paid a full
 * HTTP round trip + result merge before anything painted. This memoizes the
 * merged client state per query so re-typed / revisited searches render
 * instantly. Search HISTORY stays in its own localStorage store (unchanged).
 */

import type { Track } from "@/lib/musicApi";
import type { CatalogTrackDTO, CatalogArtistDTO, CatalogAlbumDTO } from "@/lib/spotify/types";

export interface CachedSearchResult {
  /** SoundCloud + Audius merged tracks. */
  tracks: Track[];
  spotifyTracks: CatalogTrackDTO[];
  spotifyArtists: CatalogArtistDTO[];
  spotifyAlbums: CatalogAlbumDTO[];
  spotifyState: "ok" | "unavailable";
}

interface Entry {
  data: CachedSearchResult;
  at: number;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 30;
const cache = new Map<string, Entry>();

function keyOf(query: string): string {
  return query.trim().toLowerCase();
}

export function getCachedSearch(query: string): CachedSearchResult | null {
  const key = keyOf(query);
  if (!key) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // LRU touch: re-insert at the end.
  cache.delete(key);
  cache.set(key, hit);
  return hit.data;
}

export function putCachedSearch(query: string, data: CachedSearchResult): void {
  const key = keyOf(query);
  if (!key) return;
  cache.set(key, { data, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Test hook. */
export function clearSearchCache(): void {
  cache.clear();
}
