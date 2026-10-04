/**
 * Wave diversity engine (§8) — the anti-"Artist A ×5" layer.
 *
 * Constraints (all SOFT with a relaxation ladder — §35 "one artist in the
 * whole pool" must still produce output, never an infinite loader):
 *   • artist spacing  — same artist at least `artistSpacing` picks apart
 *   • track fatigue   — recently played ids are excluded pre-ranking;
 *                       duplicates counted for observability
 *   • album diversity — max `albumMaxPerBatch` per album per batch
 *   • genre diversity — max `genreMaxPerBatch` per genre per batch
 *
 * Implementation: greedy pick over the ranked list with a sliding artist
 * window; spacing relaxes down a ladder until the batch is filled. Pure —
 * no module-level state, no mutation of inputs.
 */

import type { ScoredCandidate, WaveMemory, WaveTrackMinimal } from "./types";
import type { WaveConfig } from "./config";
import { normArtist, normGenre } from "./profile";

export interface DiversityStats {
  duplicate_count: number;
  artist_fatigue_count: number;
  filtered_count: number;
}

export interface DiversityContext {
  memory: WaveMemory;
  config: WaveConfig;
  now: number;
  /** Output batch size to select. */
  batchSize: number;
}

/**
 * Hard pre-filter: removes candidates that cannot be picked at all
 * (excluded ids, already played recently per memory). Runs BEFORE
 * scoring-adjacent selection in the engine pipeline.
 */
export function hardFilter<T extends WaveTrackMinimal>(
  candidates: ScoredCandidate<T>[],
  excludeIds: Set<string>,
  memory: WaveMemory,
  config: WaveConfig,
  now: number,
): { kept: ScoredCandidate<T>[]; stats: DiversityStats } {
  const stats: DiversityStats = { duplicate_count: 0, artist_fatigue_count: 0, filtered_count: 0 };
  const kept = candidates.filter((c) => {
    if (excludeIds.has(c.track.id)) {
      stats.duplicate_count++;
      return false;
    }
    const memEntry = memory.tracks.find((e) => e.value === c.track.id);
    if (memEntry && now - memEntry.at < config.memory.trackTtlMs) {
      stats.duplicate_count++;
      return false;
    }
    return true;
  });
  stats.filtered_count = candidates.length - kept.length;
  return { kept, stats };
}

interface BatchCounters {
  artistsOrder: string[];
  artist: Map<string, number>;
  album: Map<string, number>;
  genre: Map<string, number>;
}

/** A relaxation rung: everything at least this strict. */
interface Rung {
  spacing: number;
  artistCap: number;
  genreCap: number;
  albumCap: number;
}

function canPick<T extends WaveTrackMinimal>(
  c: ScoredCandidate<T>,
  counters: BatchCounters,
  rung: Rung,
): boolean {
  const artist = normArtist(c.track.artist);
  const genre = normGenre(c.track.genre);
  const album = (c.track.album || "").trim();

  // Artist spacing — sliding window over this batch's pick history.
  if (artist) {
    const windowStart = Math.max(0, counters.artistsOrder.length - rung.spacing);
    if (counters.artistsOrder.slice(windowStart).includes(artist)) return false;
    if ((counters.artist.get(artist) || 0) >= rung.artistCap) return false;
  }
  if (album && (counters.album.get(album) || 0) >= rung.albumCap) return false;
  if (genre && (counters.genre.get(genre) || 0) >= rung.genreCap) return false;
  return true;
}

function commit<T extends WaveTrackMinimal>(
  c: ScoredCandidate<T>,
  counters: BatchCounters,
): void {
  const artist = normArtist(c.track.artist);
  const genre = normGenre(c.track.genre);
  const album = (c.track.album || "").trim();
  if (artist) {
    counters.artistsOrder.push(artist);
    counters.artist.set(artist, (counters.artist.get(artist) || 0) + 1);
  }
  if (album) counters.album.set(album, (counters.album.get(album) || 0) + 1);
  if (genre) counters.genre.set(genre, (counters.genre.get(genre) || 0) + 1);
}

/**
 * Diverse selection from a ranked (descending score) list.
 *
 * Rung 0 = strict constraints (spacing, artist/genre/album caps). Relaxation
 * rungs engage ONLY while the batch is critically short (< minViable), so a
 * mixed pool ships strictly diverse while a mono-artist / mono-genre pool
 * still produces a viable batch (§35 graceful degradation, never an empty
 * loader). Counters are CUMULATIVE across rungs — relaxing spacing never
 * resets the per-batch caps.
 */
export function selectDiverseBatch<T extends WaveTrackMinimal>(
  ranked: ScoredCandidate<T>[],
  ctx: DiversityContext,
): { batch: ScoredCandidate<T>[]; stats: DiversityStats } {
  const { config, batchSize } = ctx;
  const stats: DiversityStats = { duplicate_count: 0, artist_fatigue_count: 0, filtered_count: 0 };
  if (ranked.length === 0) return { batch: [], stats };

  const target = Math.min(batchSize, ranked.length);
  const minViable = Math.max(1, Math.ceil(target * 0.6));
  const poolIsSmall = ranked.length < config.diversity.minPoolForStrict;

  // Relaxation ladder (§8 soft constraints): spacing tightens the flow,
  // caps relax in steps derived from diversity.relaxationLadder.
  const ladder = config.diversity.relaxationLadder;
  const rungs: Rung[] = [
    {
      spacing: config.fatigue.artistSpacing,
      artistCap: config.diversity.maxPerArtistPerBatch,
      genreCap: config.fatigue.genreMaxPerBatch,
      albumCap: config.fatigue.albumMaxPerBatch,
    },
    ...ladder.map((step, i) => ({
      spacing: Math.max(1, config.fatigue.artistSpacing - i - 1),
      artistCap: Math.max(config.diversity.maxPerArtistPerBatch, step),
      genreCap: config.fatigue.genreMaxPerBatch + (i + 1) * 2,
      albumCap: Math.max(config.fatigue.albumMaxPerBatch, step),
    })),
  ];

  const counters: BatchCounters = { artistsOrder: [], artist: new Map(), album: new Map(), genre: new Map() };
  const picks: ScoredCandidate<T>[] = [];
  let pool = [...ranked];

  for (let r = 0; r < rungs.length; r++) {
    const rung = rungs[r];
    const deferred: ScoredCandidate<T>[] = [];
    for (const c of pool) {
      if (picks.length >= target) {
        deferred.push(c);
        continue;
      }
      if (canPick(c, counters, rung)) {
        picks.push(c);
        commit(c, counters);
        if (r > 0) stats.artist_fatigue_count++; // relaxed pick (observability)
      } else {
        deferred.push(c);
      }
    }
    pool = deferred;
    if (picks.length >= target || picks.length >= minViable) break;
  }

  // Absolute fallback (§35): tiny / mono-artist pools — fill ignoring all
  // constraints so the wave keeps flowing instead of starving the user.
  if (picks.length < minViable && pool.length > 0 && (poolIsSmall || picks.length === 0)) {
    for (const c of pool) {
      if (picks.length >= Math.min(target, minViable + Math.ceil(minViable / 2))) break;
      picks.push(c);
      commit(c, counters);
      stats.artist_fatigue_count++;
    }
  }

  return { batch: picks, stats };
}
