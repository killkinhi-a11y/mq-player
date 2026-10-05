/**
 * WAVE_CONFIG — every tunable weight of the Wave recommendation engine in
 * ONE place (§7). Tests override sections via `mergeWaveConfig`; changing
 * production behaviour means changing values here, not engine code.
 *
 * Calibration notes reference the task scenarios (§37 A–F) they serve.
 */

export interface WaveScoringConfig {
  // ── Positive signals ──
  /** Max points for artist affinity from the merged taste profile (0..1 → pts). */
  tasteArtistAffinity: number;
  /** Max points for genre affinity from the merged taste profile. */
  tasteGenreAffinity: number;
  /** Max points for per-track affinity (liked / completed before). */
  tasteTrackAffinity: number;
  /** Candidate came from the seed track's /related (strongest seed signal). */
  seedSimilarityTrack: number;
  /** Candidate came from a search on the seed artist. */
  seedSimilarityArtist: number;
  /** Candidate's genre matches the seed genre. */
  seedGenreMatch: number;
  /** Candidate artist is liked/favorited (hard positive signal). */
  favoriteArtistBonus: number;
  /** Candidate genre is a liked genre. */
  favoriteGenreBonus: number;
  /** Artist/genre has completions in trackFeedback (§4 completionAffinity). */
  completionAffinity: number;
  /** Session layer multiplier — session taste outweighs long-term (§19). */
  sessionAffinityMultiplier: number;
  /** Deliberate exploration pick bonus (§9). */
  explorationBonus: number;
  /** Artist never seen in history/wave → novelty (§38 discovery flow). */
  noveltyBonus: number;
  /** Fully playable track (scIsFull). */
  playabilityBonus: number;
  /** Has cover art (basic content quality). */
  coverBonus: number;
  /** Language matches user preference. */
  languageMatch: number;
  /** Duration in the 2–6 min sweet spot. */
  durationSweetSpot: number;
  /** SoundCloud playback_count popularity — mild quality prior. */
  popularityBonus: number;
  /** more_like_this boost (§17 — stronger than a like). */
  boostedBonus: number;
  /** Cluster matches a cluster the user has real history with (PART 8). */
  clusterMatchBonus: number;
  /** Candidate genre is a bridge-genre of a user genre with real affinity —
   *  the ONLY way an exploration candidate earns an anchor (PART 7). */
  explorationAnchoredBonus: number;
  /** Session context bonus — candidate continues the live session sound (PART 9). */
  sessionContextBonus: number;
  // ── Negative signals ──
  /** Track id already played recently (memory) — near-hard penalty. */
  recentTrackPenalty: number;
  /** Per-appearance penalty for artists recently played by the Wave (§8). */
  artistFatigue: number;
  /** Per-appearance penalty for genres over-represented recently. */
  genreFatigue: number;
  /** Same artist already picked in the current batch. */
  repeatedArtistPenalty: number;
  /** Artist/genre of recently skipped tracks (§11 immediate reaction). */
  recentSkipPenalty: number;
  /** Extra penalty when the skip was very early (<10% — §4). */
  strongSkipPenalty: number;
  /** less_like_this / not_interested suppression (§18). */
  suppressedPenalty: number;
  /** Album-level suppression (PART 10 — cluster includes albums). */
  suppressedAlbumPenalty: number;
  /** Cultural-cluster suppression (PART 10 — the whole cultural sound). */
  suppressedClusterPenalty: number;
  /** Candidate's cultural cluster is FOREIGN to this user (PART 8): no
   *  history, no anchor — the "random Hindi rap" killer. Dominates every
   *  quality prior combined so it can never be outscored. */
  culturalMismatchPenalty: number;
  /** Seeded jitter amplitude (±) — variety without non-determinism. */
  maxJitter: number;
}

export interface WaveFatigueConfig {
  /** Min positions between two picks of the same artist (soft — relaxed when the pool is small). */
  artistSpacing: number;
  /** A played track may not return for N refills. */
  trackCooldownBatches: number;
  /** Max picks per album per batch. */
  albumMaxPerBatch: number;
  /** Max picks per genre per batch (before relaxation). */
  genreMaxPerBatch: number;
  /** How many recent wave picks count as "recent" for artist fatigue. */
  artistRecentWindow: number;
}

export interface WaveDiversityConfig {
  /** Max picks per artist per batch (before relaxation). */
  maxPerArtistPerBatch: number;
  /** Relaxation ladder when the strict pool is too small (§35 one-artist pool). */
  relaxationLadder: number[];
  /** Below this many candidates, strict diversity starts relaxing. */
  minPoolForStrict: number;
}

export interface WaveExplorationConfig {
  /** Base exploration fraction (epsilon) once we know the user. */
  baseRate: number;
  /** Exploration fraction for a cold / low-confidence profile (§10). */
  coldStartRate: number;
  /** Confidence above which baseRate applies (else lerp to coldStartRate). */
  confidenceThreshold: number;
  /** V2 (PART 7): exploration slots are NO LONGER guaranteed. 0 = every
   *  exploration candidate must survive scoring + the relevance gate on
   * its own merits. Kept as a knob for experiments. */
  explorationSlots: number;
  /** Position range in the batch where exploration picks may land (start index). */
  explorationInsertFrom: number;
  /** V2 (PART 7): hard cap on the exploration share of a batch — novelty
   *  must never dominate a personal wave. */
  maxSharePerBatch: number;
  /** V2 (PART 10): skip streak ≥ this → exploration rate is throttled
   *  (steer back to what the user actually likes). */
  skipStreakThrottleAt: number;
  /** V2 (PART 10): multiplier applied to the exploration rate while the
   *  skip streak is active. */
  skipStreakRateMultiplier: number;
}

export interface WaveFeedbackConfig {
  /** Skip thresholds (fractions of duration listened, §4). */
  skipStrongNegativeThreshold: number;
  skipNegativeThreshold: number;
  skipNeutralThreshold: number;
  skipPositiveThreshold: number;
  /** Event → session-layer signal strengths (normalized 0..1). */
  signal: {
    skipStrongNegative: number;
    skipNegative: number;
    skipNeutral: number;
    skipPositive: number;
    completed: number;
    replayed: number;
    liked: number;
    unliked: number;
    addedToPlaylist: number;
    addedToQueue: number;
    moreLikeThis: number;
    lessLikeThis: number;
    notInterested: number;
  };
  /** Max events kept in the client session log (bounded, §24). */
  maxSessionEvents: number;
}

export interface WaveQueueConfig {
  /** Refill the wave queue when it holds fewer items than this. */
  minBuffer: number;
  /** Refill up to this many items. */
  targetBuffer: number;
  /** Batch size requested from /api/wave/next. */
  batchSize: number;
  /** Hard cap of logical wave queue length. */
  maxQueueSize: number;
  /** Min ms between refill fetches (throttle, §24). */
  refillThrottleMs: number;
}

export interface WaveMemoryConfig {
  maxTracks: number;
  maxArtists: number;
  maxGenres: number;
  maxSeeds: number;
  /** A played track stays "recent" for this long. */
  trackTtlMs: number;
  /** An artist stays "recent" for this long (shorter than tracks). */
  artistTtlMs: number;
  /** A genre stays "recent" for this long. */
  genreTtlMs: number;
  /** A seed stays remembered for this long. */
  seedTtlMs: number;
}

export interface WaveChannelsConfig {
  similarTrack: { enabled: boolean; limit: number };
  similarArtist: { enabled: boolean; limit: number };
  taste: { enabled: boolean; limit: number; maxArtists: number };
  recentFavorites: { enabled: boolean; limit: number; maxLikedSeeds: number };
  recentListening: { enabled: boolean; limit: number; maxHistorySeeds: number };
  exploration: { enabled: boolean; limit: number; maxGenreQueries: number };
  /** Hard cap of candidates entering scoring (§24 performance). */
  maxCandidates: number;
}

export interface WaveColdStartConfig {
  /** Signals (likes×2 + history + session events×0.5) for full confidence. */
  minSignalsForConfidence: number;
  /**
   * Quality-anchored fallback queries when the profile is EMPTY (§10, §36).
   * Genre names only — never random vibe strings; the reason text stays
   * honest ("новое для вас" / exploration).
   */
  fallbackGenres: string[];
  /** Bridge genres adjacent to a known genre (for exploration queries). */
  bridgeGenres: Record<string, string[]>;
}

export interface WaveCacheConfig {
  ttlMs: number;
  maxEntries: number;
}

/**
 * V2 — FINAL RELEVANCE GATE (PART 6). Runs AFTER ranking, BEFORE the queue:
 *   profile → seed → candidates → hard filters → scoring → diversity →
 *   exploration → ranking → **FINAL RELEVANCE GATE** → queue
 *
 * A candidate must hold at least one POSITIVE ANCHOR (a real taste/seed/
 * session link) and carry NO HARD NEGATIVE (foreign cultural cluster without
 * user history, suppressed artist/cluster, disliked artist). Anchor-less
 * candidates are only allowed when the profile is cold (rung 1) — and hard
 * negatives still block there. Rung 2 is the last-resort §35 degradation for
 * degenerate pools (never an infinite loader).
 */
export interface WaveRelevanceConfig {
  /** Min merged artist affinity that counts as an anchor. */
  minArtistAffinity: number;
  /** Min merged genre affinity that counts as an anchor. */
  minGenreAffinity: number;
  /** Min track affinity (liked/completed before) that counts as an anchor. */
  minTrackAffinity: number;
  /** Min session-layer artist/genre value that counts as an anchor. */
  minSessionAffinity: number;
  /** Bridge-genre anchor: user genre needs at least this merged affinity
   *  for its bridge genres to count as exploration anchors. */
  minAnchorGenreAffinity: number;
  /** Cluster signal count for a cultural cluster to be "the user's own"
   *  (likes count ×2). Below this the cluster is foreign → hard block for
   *  non-anchored candidates. NOT a blacklist: the count is personal. */
  clusterMinSignals: number;
  /** Rung 1: profile richness below this = cold profile; anchor-less
   *  candidates allowed (still no hard negatives). Richness = number of
   *  distinct artists/genres/tracks with merged affinity ≥ 0.15. */
  coldProfileRichness: number;
  /** Rung 2 (§35 last resort): only when rung 0+1 left the batch EMPTY.
   *  Allows anchor-less candidates that still have no hard negative. */
  degeneratePoolFallback: boolean;
  /** Disliked-artist threshold (longTerm artist ≤ this = hard negative). */
  dislikedArtistThreshold: number;
}

export interface WaveOutputConfig {
  /** Default output batch size. */
  batchSize: number;
  maxOutput: number;
  /** Below this duration (sec) a candidate is noise. */
  minDuration: number;
  /** Above this duration (sec) a candidate is likely a mix/set. */
  maxDuration: number;
}

export interface WaveConfig {
  scoring: WaveScoringConfig;
  fatigue: WaveFatigueConfig;
  diversity: WaveDiversityConfig;
  exploration: WaveExplorationConfig;
  feedback: WaveFeedbackConfig;
  queue: WaveQueueConfig;
  memory: WaveMemoryConfig;
  channels: WaveChannelsConfig;
  coldStart: WaveColdStartConfig;
  cache: WaveCacheConfig;
  output: WaveOutputConfig;
  relevance: WaveRelevanceConfig;
}

export const WAVE_CONFIG: WaveConfig = {
  scoring: {
    tasteArtistAffinity: 40,
    tasteGenreAffinity: 30,
    tasteTrackAffinity: 25,
    seedSimilarityTrack: 70,
    seedSimilarityArtist: 55,
    seedGenreMatch: 20,
    favoriteArtistBonus: 30,
    favoriteGenreBonus: 15,
    completionAffinity: 25,
    sessionAffinityMultiplier: 1.35,
    explorationBonus: 18,
    noveltyBonus: 10,
    playabilityBonus: 15,
    coverBonus: 5,
    languageMatch: 10,
    durationSweetSpot: 8,
    popularityBonus: 8,
    boostedBonus: 50,
    clusterMatchBonus: 6,
    explorationAnchoredBonus: 12,
    sessionContextBonus: 8,
    recentTrackPenalty: 100,
    artistFatigue: 35,
    genreFatigue: 12,
    repeatedArtistPenalty: 25,
    recentSkipPenalty: 45,
    strongSkipPenalty: 80,
    suppressedPenalty: 60,
    suppressedAlbumPenalty: 48,
    suppressedClusterPenalty: 70,
    culturalMismatchPenalty: 130,
    maxJitter: 10,
  },
  fatigue: {
    artistSpacing: 4,
    trackCooldownBatches: 6,
    albumMaxPerBatch: 2,
    genreMaxPerBatch: 4,
    artistRecentWindow: 12,
  },
  diversity: {
    maxPerArtistPerBatch: 2,
    relaxationLadder: [2, 3, 4, 6],
    minPoolForStrict: 10,
  },
  exploration: {
    baseRate: 0.15,
    coldStartRate: 0.35,
    confidenceThreshold: 0.6,
    // V2 (PART 7): no guaranteed exploration slots — every exploration
    // candidate competes AND passes the relevance gate like everyone else.
    explorationSlots: 0,
    explorationInsertFrom: 2,
    maxSharePerBatch: 0.3,
    skipStreakThrottleAt: 2,
    skipStreakRateMultiplier: 0.35,
  },
  feedback: {
    skipStrongNegativeThreshold: 0.10,
    skipNegativeThreshold: 0.30,
    skipNeutralThreshold: 0.70,
    skipPositiveThreshold: 0.95,
    signal: {
      skipStrongNegative: 0.8,
      skipNegative: 0.45,
      skipNeutral: 0.1,
      skipPositive: 0.2,
      completed: 0.8,
      replayed: 1.0,
      liked: 0.7,
      unliked: 0.2,
      addedToPlaylist: 0.6,
      addedToQueue: 0.3,
      moreLikeThis: 0.9,
      lessLikeThis: 0.6,
      notInterested: 0.7,
    },
    maxSessionEvents: 120,
  },
  queue: {
    minBuffer: 5,
    targetBuffer: 15,
    batchSize: 12,
    maxQueueSize: 40,
    refillThrottleMs: 8000,
  },
  memory: {
    maxTracks: 150,
    maxArtists: 60,
    maxGenres: 40,
    maxSeeds: 8,
    trackTtlMs: 6 * 60 * 60 * 1000, // 6h
    artistTtlMs: 2 * 60 * 60 * 1000, // 2h
    genreTtlMs: 90 * 60 * 1000, // 1.5h
    seedTtlMs: 24 * 60 * 60 * 1000, // 24h
  },
  channels: {
    similarTrack: { enabled: true, limit: 20 },
    similarArtist: { enabled: true, limit: 15 },
    taste: { enabled: true, limit: 15, maxArtists: 3 },
    recentFavorites: { enabled: true, limit: 10, maxLikedSeeds: 2 },
    recentListening: { enabled: true, limit: 10, maxHistorySeeds: 2 },
    exploration: { enabled: true, limit: 8, maxGenreQueries: 2 },
    maxCandidates: 120,
  },
  coldStart: {
    minSignalsForConfidence: 12,
    fallbackGenres: ["indie", "electronic", "chill"],
    bridgeGenres: {
      "hip hop": ["r&b", "trap", "soul"],
      "rap": ["hip hop", "trap"],
      "trap": ["hip hop", "drill", "phonk"],
      "pop": ["indie pop", "dance pop", "r&b"],
      "rock": ["indie rock", "alternative rock", "classic rock"],
      "electronic": ["house", "techno", "downtempo"],
      "house": ["deep house", "electronic", "tech house"],
      "techno": ["electronic", "minimal techno", "house"],
      "lofi": ["chillhop", "jazz hop", "downtempo"],
      "chill": ["lofi", "downtempo", "ambient"],
      "r&b": ["soul", "hip hop", "contemporary r&b"],
      "jazz": ["smooth jazz", "soul jazz", "blues"],
      "ambient": ["downtempo", "chill", "drone"],
      "dnb": ["liquid dnb", "jungle", "electronic"],
      "drum and bass": ["liquid dnb", "jungle", "electronic"],
      "phonk": ["trap", "drift phonk", "hip hop"],
      "metal": ["heavy metal", "rock", "metalcore"],
      "indie": ["indie rock", "indie pop", "dream pop"],
    },
  },
  cache: {
    ttlMs: 3 * 60 * 1000,
    maxEntries: 200,
  },
  output: {
    batchSize: 12,
    maxOutput: 20,
    minDuration: 45,
    maxDuration: 900,
  },
  relevance: {
    minArtistAffinity: 0.15,
    minGenreAffinity: 0.2,
    minTrackAffinity: 0.25,
    minSessionAffinity: 0.2,
    minAnchorGenreAffinity: 0.3,
    clusterMinSignals: 2,
    coldProfileRichness: 3,
    degeneratePoolFallback: true,
    dislikedArtistThreshold: -0.4,
  },
};

/**
 * Shallow-per-section config merge for tests and experiments.
 * `mergeWaveConfig({ scoring: { maxJitter: 0 } })` → full config with one
 * value overridden. Unknown keys are rejected by the per-section spread.
 */
export function mergeWaveConfig(overrides: {
  [K in keyof WaveConfig]?: Partial<WaveConfig[K]>;
}): WaveConfig {
  const merged = { ...WAVE_CONFIG } as WaveConfig;
  for (const key of Object.keys(overrides) as Array<keyof WaveConfig>) {
    const section = overrides[key];
    if (section) {
      // @ts-expect-error — generic per-section shallow merge
      merged[key] = { ...WAVE_CONFIG[key], ...section };
    }
  }
  return merged;
}
