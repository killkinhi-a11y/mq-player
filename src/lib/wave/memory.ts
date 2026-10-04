/**
 * Wave recommendation memory (§21).
 *
 * Bounded, TTL-pruned record of what the Wave already played — feeds
 * artist/genre/track fatigue and duplicate suppression. Pure functions
 * return NEW memory objects (immutability for React/Zustand).
 */

import type { WaveMemory, WaveTrackMinimal } from "./types";
import type { WaveConfig } from "./config";
import { normArtist, normGenre } from "./profile";

export function createWaveMemory(): WaveMemory {
  return { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 };
}

function pruneList(list: { value: string; at: number }[], max: number, ttlMs: number, now: number) {
  const alive = list.filter((e) => now - e.at < ttlMs);
  // Keep the most recent `max` entries (list is append-newest-first).
  return alive.slice(0, max);
}

/** Prune every list by TTL + size caps. Returns a new memory object. */
export function pruneWaveMemory(memory: WaveMemory, now: number, config: WaveConfig): WaveMemory {
  return {
    tracks: pruneList(memory.tracks, config.memory.maxTracks, config.memory.trackTtlMs, now),
    artists: pruneList(memory.artists, config.memory.maxArtists, config.memory.artistTtlMs, now),
    genres: pruneList(memory.genres, config.memory.maxGenres, config.memory.genreTtlMs, now),
    seeds: pruneList(memory.seeds, config.memory.maxSeeds, config.memory.seedTtlMs, now),
    playedCount: memory.playedCount,
  };
}

/** Record a played track (id + artist + genre) in memory. */
export function rememberWaveTrack<T extends WaveTrackMinimal>(memory: WaveMemory, track: T, now: number, config: WaveConfig): WaveMemory {
  const artist = normArtist(track.artist);
  const genre = normGenre(track.genre);
  const next: WaveMemory = {
    ...memory,
    tracks: [{ value: track.id, at: now }, ...memory.tracks],
    artists: artist ? [{ value: artist, at: now }, ...memory.artists.filter((e) => e.value !== artist)] : memory.artists,
    genres: genre ? [{ value: genre, at: now }, ...memory.genres.filter((e) => e.value !== genre)] : memory.genres,
    playedCount: memory.playedCount + 1,
  };
  return pruneWaveMemory(next, now, config);
}

/** Record a seed change (bounded seed history, §21). */
export function rememberWaveSeed(memory: WaveMemory, seedKey: string, now: number, config: WaveConfig): WaveMemory {
  return pruneWaveMemory(
    {
      ...memory,
      seeds: [{ value: seedKey, at: now }, ...memory.seeds.filter((e) => e.value !== seedKey)],
    },
    now,
    config,
  );
}

/** How many times `artist` appears within the recent window. */
export function artistAppearanceCount(memory: WaveMemory, artist: string, window: number): number {
  const a = normArtist(artist);
  if (!a) return 0;
  return memory.artists.slice(0, window).filter((e) => e.value === a).length;
}

/** Has this track been played recently (still within its TTL)? */
export function isRecentlyPlayedTrack(memory: WaveMemory, trackId: string, now: number, config: WaveConfig): boolean {
  return memory.tracks.some((e) => e.value === trackId && now - e.at < config.memory.trackTtlMs);
}

/** Compact serialization for the API signals payload. */
export function memoryToSignals(memory: WaveMemory, config: WaveConfig): {
  recentWaveArtists: string[];
  recentWaveGenres: string[];
  recentWaveTrackIds: string[];
} {
  const now = Date.now();
  const m = pruneWaveMemory(memory, now, config);
  return {
    recentWaveArtists: m.artists.slice(0, 25).map((e) => e.value),
    recentWaveGenres: m.genres.slice(0, 15).map((e) => e.value),
    recentWaveTrackIds: m.tracks.slice(0, 60).map((e) => e.value),
  };
}
