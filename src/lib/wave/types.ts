/**
 * MQ Wave — shared type contracts for the personalized radio engine.
 *
 * The engine is PURE and structural: it never imports React, the app store,
 * or server-only modules, and it operates on the minimal `WaveTrackMinimal`
 * shape so the same code runs on the server (SCTrack), the client (Track)
 * and in tests (fixtures).
 */

import type { Track } from "@/lib/musicApi";

/* ────────────────────────────────────────────────────────────────────────
 * Seeds
 * ──────────────────────────────────────────────────────────────────────── */

export type WaveSeedKind = "track" | "artist" | "album" | "playlist" | "genre" | "taste";

/**
 * What the Wave was started from. `label` is a display string
 * ("Похоже на X", "Волна по артисту Y").
 */
export interface WaveSeed {
  kind: WaveSeedKind;
  /** Track id (client id, not scTrackId). */
  trackId?: string;
  /** SoundCloud track id — used for /related candidate generation. */
  scTrackId?: number;
  artist?: string;
  album?: string;
  playlistId?: string;
  genre?: string;
  /** Human-readable seed name for reason texts. */
  label: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * Honest recommendation reasons (§15)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The reason MUST map to a real signal that lifted the candidate's score.
 * `seedRef` carries the honest attribution target (seed track title /
 * artist name) when one exists.
 */
export type WaveReason =
  | "similar_track"
  | "similar_artist"
  | "favorite_artist"
  | "favorite_genre"
  | "recent_listening"
  | "taste_profile"
  | "exploration";

/* ────────────────────────────────────────────────────────────────────────
 * Listening events (§4)
 * ──────────────────────────────────────────────────────────────────────── */

export type WaveEventType =
  | "play_started"
  | "play_progress"
  | "play_completed"
  | "track_replayed"
  | "track_skipped"
  | "track_liked"
  | "track_unliked"
  | "track_added_to_playlist"
  | "track_added_to_queue"
  | "wave_started"
  | "wave_seed_changed"
  | "more_like_this"
  | "less_like_this"
  | "not_interested";

/**
 * A normalized listening event. `position`/`duration` are seconds —
 * they drive the skip-strength classification.
 */
export interface WaveEvent {
  type: WaveEventType;
  trackId: string;
  scTrackId?: number;
  title?: string;
  artist?: string;
  genre?: string;
  album?: string;
  position?: number;
  duration?: number;
  at: number;
}

/** Classified skip strength by percent of track listened (§4). */
export type SkipStrength =
  | "strong_negative" // < 10%
  | "negative"        // 10–30%
  | "neutral"         // 30–70% (slightly positive)
  | "positive"        // 70–95%
  | "strong_positive"; // 95%+ (not a real skip — completion)

/* ────────────────────────────────────────────────────────────────────────
 * Taste profile (§3, §19, §20, §28)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * One recency layer of the taste profile. Values are normalized to
 * −1..1 (positive = affinity, negative = aversion).
 */
export interface TasteLayer {
  artists: Record<string, number>;
  genres: Record<string, number>;
  tracks: Record<string, number>;
}

/**
 * Four-layer taste profile. Session/recent weigh MORE than long-term
 * (weighting happens in `mergedAffinity`), but the long-term profile is
 * never discarded.
 *
 * V2 additions:
 *   • clusters — personalized cultural-cluster affinity counts (PART 8):
 *     a cluster with ≥ CLUSTER_MIN_SIGNALS is "user's own" and never
 *     treated as foreign. NOT a blacklist — it certifies, not bans.
 *   • skipStreak — trailing consecutive negative skips in the session
 *     (PART 10): ≥2 throttles exploration and steers back to safe picks.
 */
export interface WaveProfile {
  longTerm: TasteLayer;
  mediumTerm: TasteLayer;
  recent: TasteLayer;
  session: TasteLayer;
  recentArtists: string[];
  recentTracks: string[];
  language: "russian" | "english" | "mixed";
  /** 0..1 — how much listening signal we have; drives explorationRate. */
  confidence: number;
  /** Cultural cluster → positive signal count (likes/history). */
  clusters: Record<string, number>;
  /** Trailing consecutive negative skips in this session. */
  skipStreak: number;
  /** `more_like_this` targets (session-scoped boosts). */
  boost: { artists: string[]; genres: string[] };
  /** `less_like_this` / `not_interested` targets (session-scoped suppressions). */
  suppress: {
    artists: string[];
    genres: string[];
    albums: string[];
    clusters: string[];
  };
}

export interface WaveProfileInput {
  /** Listening history (most recent first), store shape. */
  history?: Array<{ track: Track; playedAt: number; playCount: number }>;
  likedTracksData?: Track[];
  dislikedTracksData?: Track[];
  /** Taste sliders (TasteProfileView). */
  tasteGenres?: Record<string, number>;
  tasteArtists?: Record<string, number>;
  tasteMoods?: Record<string, number>;
  /** Store trackFeedback (skips/completes per track). */
  trackFeedback?: Record<string, { skips: number; completes: number; listenTime: number; totalListenTime: number; lastPlayedAt: number; skipPositions: number[] }>;
  /** Wave session events (built by applySessionEvent / client store). */
  sessionEvents?: WaveEvent[];
  favoriteArtists?: Array<{ username: string }>;
  now?: number;
  /** Compact "title artist" texts (server path) — cluster affinity source. */
  likedTexts?: string[];
  historyTexts?: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Candidates (§5)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Candidate generation channels. A single track may arrive through several
 * channels; the engine keeps the highest-priority one and records the merge.
 */
export type CandidateChannel =
  | "similar_track"     // related to the seed / current track
  | "similar_artist"    // from the seed artist
  | "taste"             // matches long-term taste (liked artists / sliders)
  | "recent_favorites"  // related to recently liked tracks
  | "recent_listening"  // continues the current listening context
  | "exploration";      // deliberate novelty (new artists / adjacent genres)

/**
 * Minimal structural track shape the engine needs. Both `Track` (client)
 * and `SCTrack` (server) satisfy it structurally — engine generics keep
 * whatever extra fields exist on T untouched.
 */
export interface WaveTrackMinimal {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  genre: string;
  cover?: string;
  scTrackId?: number;
  scIsFull?: boolean;
  playbackCount?: number;
}

export interface WaveCandidate<T extends WaveTrackMinimal = WaveTrackMinimal> {
  track: T;
  channel: CandidateChannel;
  /** Honest attribution: which concrete seed produced this candidate. */
  seedRef?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * Scoring / output
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * FINAL RELEVANCE GATE debug metadata (V2 PART 11) — shipped per track
 * when the request asks for `debug`. Explains WHY a track passed or was
 * rejected: every sub-score, the verdict and a human-readable reason.
 */
export interface WaveRelevanceDebug {
  score: number;
  artistScore: number;
  genreScore: number;
  trackScore: number;
  seedSimilarity: number;
  sessionScore: number;
  languageScore: number;
  explorationScore: number;
  negativeScore: number;
  finalScore: number;
  relevancePassed: boolean;
  relevanceReason: string;
  /** Which anchor held the candidate up ("genre_affinity", "seed_channel", …). */
  anchor?: string;
}

export interface ScoredCandidate<T extends WaveTrackMinimal = WaveTrackMinimal> {
  track: T;
  score: number;
  reason: WaveReason;
  channel: CandidateChannel;
  seedRef?: string;
  exploration: boolean;
  /** Per-signal contributions — testability + honest reason selection. */
  breakdown: Record<string, number>;
  /** Final relevance gate verdict + sub-scores (V2). Always computed; only
   *  shipped to the client when the request is in debug mode. */
  relevance?: WaveRelevanceDebug;
}

export interface WaveEngineMeta {
  candidate_count: number;
  filtered_count: number;
  ranked_count: number;
  exploration_count: number;
  duplicate_count: number;
  artist_fatigue_count: number;
  generation_ms: number;
  deterministic: boolean;
  /** V2 relevance gate observability. */
  relevance_rejected_count: number;
  gate_rung: number;
  gate_relaxed: boolean;
}

export interface WaveEngineResult<T extends WaveTrackMinimal = WaveTrackMinimal> {
  tracks: ScoredCandidate<T>[];
  meta: WaveEngineMeta;
  /** V2 (PART 11): gate-rejected candidates with verdicts — observability. */
  gate?: Array<{ candidate: ScoredCandidate<T>; verdict: import("./relevance").GateVerdict }>;
}

/* ────────────────────────────────────────────────────────────────────────
 * Recommendation memory (§21)
 * ──────────────────────────────────────────────────────────────────────── */

export interface WaveMemoryEntry {
  value: string;
  at: number;
}

/**
 * Bounded, TTL-pruned memory of what the Wave already played.
 * Lives in the app store (not persisted — a Wave session is ephemeral
 * by design, matching the existing radioMode reset policy).
 */
export interface WaveMemory {
  tracks: WaveMemoryEntry[];
  artists: WaveMemoryEntry[];
  genres: WaveMemoryEntry[];
  seeds: WaveMemoryEntry[];
  playedCount: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Wave queue (client-side logical queue, §12)
 * ──────────────────────────────────────────────────────────────────────── */

export interface WaveQueueItem<T extends WaveTrackMinimal = WaveTrackMinimal> {
  track: T;
  reason: WaveReason;
  seedRef?: string;
  enqueuedAt: number;
  /** V2 (PART 11): relevance debug metadata (dev mode only). */
  debug?: WaveRelevanceDebug;
}

export interface WaveSessionState {
  id: string;
  seed: WaveSeed;
  startedAt: number;
  stats: {
    started: number;
    skipped: number;
    completed: number;
    liked: number;
    refills: number;
    moreLikeThis: number;
    lessLikeThis: number;
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Server API contracts
 * ──────────────────────────────────────────────────────────────────────── */

/** Signals the client ships to /api/wave for scoring + candidate generation. */
export interface WaveSignals {
  likedArtists?: string[];
  likedGenres?: string[];
  dislikedArtists?: string[];
  likedScIds?: number[];
  historyScIds?: number[];
  historyArtists?: string[];
  historyGenres?: string[];
  tasteGenres?: string[];
  tasteArtists?: string[];
  language?: "russian" | "english" | "mixed";
  /** Events of the current wave session (session-taste layer). */
  sessionEvents?: WaveEvent[];
  /** ids/sc ids already enqueued or played — hard exclusions. */
  excludeIds?: string[];
  excludeScIds?: number[];
  /** Wave memory (played artists/genres, for fatigue) — compact form. */
  recentWaveArtists?: string[];
  recentWaveGenres?: string[];
  recentWaveTrackIds?: string[];
  seed?: WaveSeed;
  /** "title artist" texts of liked tracks (≤12) — cultural cluster affinity. */
  likedTexts?: string[];
  /** "title artist" texts of recent history (≤16) — cultural cluster affinity. */
  historyTexts?: string[];
  /** Explicit deterministic test seed (never sent by the real client). */
  randomSeed?: number;
  /** Dev/debug mode — per-track relevance metadata in the response. */
  debug?: boolean;
}
