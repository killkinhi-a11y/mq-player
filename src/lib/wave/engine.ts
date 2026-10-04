/**
 * Wave recommendation engine — the pure orchestrator (§2, §23, §24, §31).
 *
 * Pipeline:
 *   candidates → hard filters → dedup (channel merge)
 *   → scoring → exploration injection → diversity/fatigue → final ranking
 *
 * DETERMINISM (§23): given identical (seed, profile, candidates, memory,
 * randomSeed) the output is byte-identical. All randomness flows through
 * the seeded rng. When `randomSeed` is omitted the engine derives a
 * context seed (varied per call, still reproducible for tests via resolveRandomSeed).
 *
 * PERFORMANCE (§24): candidate pool is capped (`maxCandidates`), memory is
 * bounded upstream, no allocations proportional to the full catalog.
 */

import type {
  ScoredCandidate,
  WaveCandidate,
  WaveEngineMeta,
  WaveEngineResult,
  WaveMemory,
  WaveProfile,
  WaveSeed,
  WaveTrackMinimal,
} from "./types";
import type { WaveConfig } from "./config";
import { WAVE_CONFIG } from "./config";
import { createRng, resolveRandomSeed } from "./rng";
import { scoreCandidate, effectiveExplorationRate } from "./scoring";
import { selectDiverseBatch } from "./diversity";
import { buildWaveProfile, mergedAffinity, normArtist, normGenre } from "./profile";
import type { WaveProfileInput } from "./types";

/** Channel priority for dedup — the first producer wins attribution. */
const CHANNEL_PRIORITY = [
  "similar_track",
  "similar_artist",
  "recent_listening",
  "recent_favorites",
  "taste",
  "exploration",
] as const;

export interface WaveEngineInput<T extends WaveTrackMinimal = WaveTrackMinimal> {
  seed: WaveSeed | null;
  /** Pre-fetched candidates from the generation channels (server) or fixtures (tests). */
  candidates: WaveCandidate<T>[];
  /** Full taste profile — OR raw signals to build one (profile takes precedence). */
  profile?: WaveProfile;
  profileInput?: WaveProfileInput;
  memory?: WaveMemory;
  /** Recently played track ids (client history slice) — soft-excluded. */
  recentHistoryTrackIds?: string[];
  /** Hard exclusions: current queue ids, seed id, dislikes. */
  excludeIds?: string[];
  /** Deterministic test seed. */
  randomSeed?: number;
  config?: WaveConfig;
  now?: number;
  /** Output batch size (defaults to config.output.batchSize). */
  batchSize?: number;
}

/**
 * Dedup candidates by track id, merging channels: the highest-priority
 * channel provides attribution, seedRef is kept from that producer.
 * Duplicate arrivals are counted (observability §31).
 */
export function dedupCandidates<T extends WaveTrackMinimal>(
  candidates: WaveCandidate<T>[],
): { unique: WaveCandidate<T>[]; duplicateCount: number } {
  const byId = new Map<string, WaveCandidate<T>>();
  const priority = new Map<string, number>(
    CHANNEL_PRIORITY.map((ch, i) => [ch as string, i]),
  );
  let duplicateCount = 0;
  for (const c of candidates) {
    const existing = byId.get(c.track.id);
    if (!existing) {
      byId.set(c.track.id, c);
      continue;
    }
    duplicateCount++;
    // Keep the higher-priority channel's attribution.
    if ((priority.get(c.channel) ?? 99) < (priority.get(existing.channel) ?? 99)) {
      byId.set(c.track.id, c);
    }
  }
  return { unique: [...byId.values()], duplicateCount };
}

/** Skipped artists/genres derived from profile session layer (negative signals). */
function skippedSets(profile: WaveProfile): { artists: Set<string>; genres: Set<string> } {
  const artists = new Set<string>();
  const genres = new Set<string>();
  for (const [a, v] of Object.entries(profile.session.artists)) if (v <= -0.3) artists.add(a);
  for (const [g, v] of Object.entries(profile.session.genres)) if (v <= -0.4) genres.add(g);
  // Disliked artists are permanent session-level negatives too.
  for (const [a, v] of Object.entries(profile.longTerm.artists)) if (v <= -0.4) artists.add(a);
  for (const [g, v] of Object.entries(profile.longTerm.genres)) if (g && v <= -0.4) genres.add(g);
  return { artists, genres };
}

/**
 * The engine. Pure and deterministic. See WaveEngineInput for options.
 */
export function getWaveRecommendations<T extends WaveTrackMinimal = WaveTrackMinimal>(
  input: WaveEngineInput<T>,
): WaveEngineResult<T> {
  const config = input.config ?? WAVE_CONFIG;
  const started = Date.now();
  const now = input.now ?? Date.now();
  const deterministic = typeof input.randomSeed === "number";

  const rng = createRng(
    resolveRandomSeed(input.randomSeed, [
      input.seed?.kind,
      input.seed?.trackId,
      input.seed?.artist,
      input.seed?.genre,
      input.profile?.confidence,
      input.candidates.length,
    ]),
  );

  /* ── Profile ── */
  const profile =
    input.profile ??
    buildWaveProfile(input.profileInput ?? {}, config);

  /* ── Memory (default empty — fresh wave) ── */
  const memory = input.memory ?? { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 };

  /* ── Stage 1: dedup + channel merge ── */
  const { unique: deduped, duplicateCount } = dedupCandidates(input.candidates);

  /* ── Stage 2: hard filters ──
   * Exclusions: explicit excludeIds (queue/dislikes/seed), memory tracks,
   * quality gates (duration window). */
  const excludeIds = new Set<string>([...(input.excludeIds || [])]);
  const skipped = skippedSets(profile);
  const filtered: WaveCandidate<T>[] = [];
  let filteredCount = 0;
  for (const c of deduped) {
    if (excludeIds.has(c.track.id)) { filteredCount++; continue; }
    if (memory.tracks.some((e) => e.value === c.track.id)) { filteredCount++; continue; }
    const dur = c.track.duration || 0;
    if (dur > 0 && (dur < config.output.minDuration || dur > config.output.maxDuration)) { filteredCount++; continue; }
    // Suppressed artists (less_like_this/not_interested) are soft-penalized
    // in scoring, NOT hard-removed (§18 — temporary downweight only).
    filtered.push(c);
  }

  /* ── Stage 3: candidate cap (§24 performance) ── */
  const capped = filtered.slice(0, config.channels.maxCandidates);

  /* ── Stage 4: scoring ── */
  const affinity = mergedAffinity(profile, config);
  const recentHistory = new Set(input.recentHistoryTrackIds || []);
  const scored: ScoredCandidate<T>[] = capped.map((c) =>
    scoreCandidate(c, {
      profile,
      seed: input.seed,
      memory,
      config,
      rng,
      recentHistoryTrackIds: recentHistory,
      skippedArtists: skipped.artists,
      skippedGenres: skipped.genres,
      language: profile.language,
      now,
      // Reuse the merged affinity across candidates — computed once.
      _affinity: affinity,
    }),
  );

  /* ── Stage 5: exploration injection (§9) ──
   * A share of the batch is reserved for exploration-channel candidates
   * (real novelty signals — never fake, §36). Rate adapts to profile
   * confidence: cold users explore more. */
  const rate = effectiveExplorationRate(profile, config);
  const batchSize = input.batchSize ?? config.output.batchSize;
  const explorationQuota = Math.min(
    config.exploration.explorationSlots,
    Math.round(batchSize * rate),
  );

  scored.sort((a, b) => b.score - a.score);

  const explorationPool = scored.filter((s) => s.exploration);
  const exploitationPool = scored.filter((s) => !s.exploration);

  // Deterministic exploration pick: top-scored exploration candidates
  // (their scores already include the exploration bonus).
  const explorationPicks = explorationPool.slice(0, explorationQuota);
  const rest = [
    ...exploitationPool,
    ...explorationPool.slice(explorationQuota),
  ];

  /* ── Stage 6: diversity + final ranking ── */
  const { batch, stats } = selectDiverseBatch<T>(rest, {
    memory,
    config,
    now,
    batchSize,
  });

  // Reinsert exploration picks into the front half of the batch (they were
  // competing inside `rest` already; ensure at least the quota lands when
  // the diversity pass dropped them — only if they exist).
  let explorationLanded = batch.filter((b) => b.exploration).length;
  if (explorationLanded < explorationPicks.length) {
    for (const pick of explorationPicks) {
      if (explorationLanded >= explorationQuota) break;
      if (batch.some((b) => b.track.id === pick.track.id)) continue;
      const insertAt = Math.min(batch.length, config.exploration.explorationInsertFrom + explorationLanded);
      batch.splice(insertAt, 0, pick);
      explorationLanded++;
    }
  }

  const meta: WaveEngineMeta = {
    candidate_count: input.candidates.length,
    filtered_count: filteredCount,
    ranked_count: scored.length,
    exploration_count: batch.filter((b) => b.exploration).length,
    duplicate_count: duplicateCount,
    artist_fatigue_count: stats.artist_fatigue_count,
    generation_ms: Date.now() - started,
    deterministic,
  };

  return { tracks: batch, meta };
}

export { buildWaveProfile };
