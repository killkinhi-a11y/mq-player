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
  /** Guaranteed exploration picks injected into every batch. */
  explorationSlots: number;
  /** Position range in the batch where exploration picks may land (start index). */
  explorationInsertFrom: number;
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
    recentTrackPenalty: 100,
    artistFatigue: 35,
    genreFatigue: 12,
    repeatedArtistPenalty: 25,
    recentSkipPenalty: 45,
    strongSkipPenalty: 80,
    suppressedPenalty: 60,
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
    explorationSlots: 2,
    explorationInsertFrom: 2,
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
