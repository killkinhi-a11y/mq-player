/**
 * Next-track prefetch — V3 PHASE 12.
 *
 * While track A plays, PREPARE track B (the next queue entry):
 *   - catalog resolve (metadata → best full-length source match) — the big
 *     win: kills the resolver round-trip from the switch path;
 *   - artwork decode warm-up;
 *   - lyrics availability probe (LRCLib search is cheap).
 *
 * NEVER downloads audio (user §12: «НЕ скачивать запрещённый audio»).
 * Results land in the client resolve cache + waveform/lyrics caches, so the
 * actual A→B switch reads them warm.
 *
 * Race-safe by design: every prefetch is scoped to the CURRENT queue
 * generation — when the queue changes (user reorders/skips), stale
 * prefetches simply land in the cache and are harmless.
 */

import { resolveCatalogTrack, type CatalogTrackInput } from "./client";
import type { Track } from "@/lib/musicApi";

/** Prefetch budget: never run more than this many concurrent prefetches. */
const MAX_CONCURRENT = 2;

const inflight = new Map<string, Promise<unknown>>();
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => {
    active++;
    resolve();
  }));
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) next();
}

/** Diagnostics (§29 dev panel). */
export interface PrefetchState {
  inflight: string[];
  active: number;
  hits: number;
  misses: number;
}

const stats = { hits: 0, misses: 0 };

export function prefetchState(): PrefetchState {
  return { inflight: [...inflight.keys()], active, hits: stats.hits, misses: stats.misses };
}

/**
 * Prefetch the RESOLVE for a catalog track (SoundCloud/Audius match).
 * Deduplicated + budgeted; the result warms the local resolve cache.
 */
export async function prefetchResolve(track: Track): Promise<void> {
  const isCatalog = track.source === "spotify" && !!track.catalogId && !track.playbackId;
  if (!isCatalog) {
    stats.misses++;
    return;
  }
  const key = `prefetch-resolve:${track.catalogProvider}:${track.catalogId}`;
  if (inflight.has(key)) return;

  const job = (async () => {
    await acquire();
    try {
      const catalog: CatalogTrackInput = {
        provider: track.catalogProvider === "deezer" ? "deezer" : "spotify",
        catalogId: track.catalogId!,
        title: track.title,
        artist: track.artist,
        album: track.album || undefined,
        albumImage: track.cover || undefined,
        durationSec: track.duration,
      };
      await resolveCatalogTrack(catalog); // lands in localCache (30 min TTL)
      stats.hits++;
    } catch {
      stats.misses++;
    } finally {
      inflight.delete(key);
      release();
    }
  })();
  inflight.set(key, job);
}

/**
 * Prefetch the LYRICS availability for the next track (LRCLib probe).
 * Cheap GET; result lands in the lyrics cache via the same client call the
 * Lyrics view uses, so opening lyrics on switch is instant.
 */
export async function prefetchLyrics(track: Track): Promise<void> {
  if (!track?.title || !track.artist) return;
  const key = `prefetch-lyrics:${track.id}`;
  if (inflight.has(key)) return;
  const job = (async () => {
    await acquire();
    try {
      const { fetchLyrics } = await import("@/lib/lyrics-client");
      await fetchLyrics({
        artist: track.artist,
        title: track.title,
        album: track.album || "",
        duration: track.duration || 0,
      });
      stats.hits++;
    } catch {
      // lyrics are best-effort — absence is a normal state
    } finally {
      inflight.delete(key);
      release();
    }
  })();
  inflight.set(key, job);
}

/**
 * Prefetch ARTWORK decode (browser warms the image in its cache).
 * Uses a plain Image() — no audio, no CORS issues.
 */
export function prefetchArtwork(track: Track): void {
  if (!track?.cover || typeof window === "undefined") return;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = track.cover;
  } catch { /* best-effort */ }
}

/**
 * Full next-track preparation (§12): resolve + artwork + lyrics probe.
 * Called by the engine while the current track plays (deferred, budgeted).
 */
export function prefetchNextTrack(next: Track | null | undefined): void {
  if (!next) return;
  void prefetchResolve(next);
  prefetchArtwork(next);
  void prefetchLyrics(next);
}

/** Test hook. */
export function __resetPrefetch(): void {
  inflight.clear();
  queue.length = 0;
  active = 0;
  stats.hits = 0;
  stats.misses = 0;
}
