/**
 * Central configuration for all recommendation algorithm weights and parameters.
 *
 * Source files these values were extracted from:
 *   - /app/api/music/recommendations/route.ts   (phases, scoring, diversity, coldStart)
 *   - /app/api/music/trending/route.ts           (trending)
 *   - /app/api/music/radio/route.ts              (radio)
 *   - /app/api/playlists/curated/route.ts        (curated)
 *   - /app/api/music/recommendations/feedback/route.ts (feedback)
 *
 * Do NOT change values here without coordinating A/B tests.
 * For runtime overrides without redeployment, use recommendations.dev.json.
 */

// ── Interface ──────────────────────────────────────────────────────────────────

export interface RecommendationsConfig {
  phases: {
    relatedApi: { weight: number; maxLikedTracks: number; maxHistoryTracks: number; cacheTtl: number };
    artistSearch: { weight: number; maxArtists: number; maxQueriesPerArtist: number };
    genreFallback: { weight: number; minLikedForSkip: number; minHistoryForSkip: number };
    bridgeGenres: { maxFirstHop: number; maxSecondHop: number };
  };
  scoring: {
    relatedLiked: number;
    relatedHistory: number;
    artistExact: number;
    artistPartial: number;
    genreExact: number;
    genrePartial: number;
    languageMatch: number;
    playability: number;
    coverArt: number;
    noisePenalty: number;
    hashtagMismatchPenalty: number;
    skipGenrePenalty: number;
    completedGenreBonus: number;
    serendipityBonus: number;
    serendipityThreshold: number;
    maxJitter: number;
    highConfidenceJitter: number;
  };
  feedback: {
    timeDecayHalfLife: number; // hours
    minSignalsForBoost: number;
    laplaceSmoothing: boolean;
  };
  radio: {
    relatedCurrent: number;
    relatedHistory: number;
    sameArtist: number;
    historyArtist: number;
    genreMatch: number;
    energyClose: number;
    energyCloseRange: number;
    energyShiftRange: number;
    energyFarPenalty: number;
    energyFarThreshold: number;
    energyFlowUp: number;
    energyFlowDown: number;
    energyStable: number;
    languageMatch: number;
    playability: number;
    coverArt: number;
    skippedArtistPenalty: number;
    skippedGenrePenalty: number;
    noisePenalty: number;
    momentumSkipThreshold: number;
    momentumPenalty: number;
    targetMin: number;
    targetMax: number;
    closeBucketMax: number;
    shiftBucketMax: number;
    wildcardBucketMax: number;
  };
  trending: {
    categoryWeights: { charts: number; rising: number; social: number; genres: number };
    crossQueryBonus: number;
    fullPlayableBonus: number;
    previewPenalty: number;
    optimalDurationMin: number;
    optimalDurationMax: number;
    optimalDurationBonus: number;
    sweetSpotBonus: number;
    sweetSpotMin: number;
    sweetSpotMax: number;
    coverBonus: number;
    shortClipPenalty: number;
    shortClipThreshold: number;
    freshnessBonus7d: number;
    freshnessBonus30d: number;
    maxArtistDefault: number;
    maxArtistTop: number;
    topScoredLimit: number;
    uniqueArtistsLimit: number;
    targetTracks: number;
  };
  curated: {
    trackLimit: number;
    maxArtistsPerPlaylist: number;
    artistDiversityRelaxation: number[];
    cacheTtl: number;
    minTracksForPlaylist: number;
    qualityMinDuration: number;
  };
  diversity: {
    maxPerArtist: number;
    explorationRate: number; // epsilon for epsilon-greedy
  };
  quality: {
    minimumScore: number;
    fillMinimumScore: number;
    exploreMinimumScore: number;
  };
  coldStart: {
    minLikedForFullMode: number;
    minHistoryForFullMode: number;
    explorationBoost: number;
  };
}

// ── Default configuration (matches current hardcoded values) ───────────────────

export const RECOMMENDATIONS_CONFIG: RecommendationsConfig = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASES — Recommendation pipeline stages with their relative priority
  // Source: /app/api/music/recommendations/route.ts
  // ═══════════════════════════════════════════════════════════════════════════
  phases: {
    // Phase 1: SoundCloud Related API (primary, ~60% of results)
    // Calls /tracks/{scTrackId}/related for liked & history tracks
    relatedApi: {
      weight: 0.6,                // ~60% priority weight (implied by comment + scoring)
      maxLikedTracks: 5,          // likedScIds.slice(0, 5) — max liked track IDs to use
      maxHistoryTracks: 3,        // historyScIds.slice(0, 3) — max history track IDs to use
      cacheTtl: 6 * 60 * 1000,    // 6 minutes — CACHE_TTL in recommendations route
    },

    // Phase 2: Artist search (secondary, ~25% of results)
    // Searches for user's top artists with smart queries
    artistSearch: {
      weight: 0.25,               // ~25% priority weight (implied by comment)
      maxArtists: 3,              // artists.slice(0, 3) — max artists to search for
      maxQueriesPerArtist: 2,     // One exact quoted search + one with top genre combined
    },

    // Phase 3: Genre fallback (tertiary, ~15% of results)
    // Only used when we lack sufficient liked/history data
    genreFallback: {
      weight: 0.15,               // ~15% priority weight (implied by comment)
      minLikedForSkip: 3,         // likedScIds.length < 3 triggers fallback
      minHistoryForSkip: 5,       // historyScIds.length < 5 triggers fallback
    },

    // Bridge genre exploration for discovery
    // Explores genres 1-2 hops away from user's top genres
    bridgeGenres: {
      maxFirstHop: 4,             // firstArr.slice(0, 4) — max first-hop genres in output
      maxSecondHop: 2,            // secondArr.slice(0, 2) — max second-hop genres in output
      // Note: Internally, up to 5 first-hop genres are explored as seeds for second hop
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCORING — Point-based scoring for recommendation ranking
  // Source: /app/api/music/recommendations/route.ts — scoreTrackV8()
  // ═══════════════════════════════════════════════════════════════════════════
  scoring: {
    // Phase origin bonuses (strongest signals)
    relatedLiked: 100,            // +100: Track related to a liked track (highest confidence)
    relatedHistory: 70,           // +70: Track related to a recently played history track

    // Artist matching
    artistExact: 50,              // +50: Exact artist name match from user's top artists
    artistPartial: 40,            // +40: Partial/fuzzy artist name match (substring match)

    // Genre matching
    genreExact: 30,               // +30: Exact genre match with user's top genre
    genrePartial: 20,             // +20: Partial genre match (one contains the other)

    // Language preference
    languageMatch: 25,            // +25: Track language matches user's language preference

    // Quality signals
    playability: 20,              // +20: Full playable track (scIsFull === true)
    coverArt: 15,                 // +15: Track has cover art

    // Hard penalties
    noisePenalty: 100,            // -100: Noise/spam keywords (bible, sermon, etc.)
    hashtagMismatchPenalty: 50,   // -50: Title hashtags mismatch user's genres (e.g. #deephouse)

    // Adaptive feedback scoring (v9 self-learning)
    skipGenrePenalty: 60,         // -60: Genre with high skip rate from user feedback
    completedGenreBonus: 15,      // +15: Genre with completions from user feedback

    // Serendipity — reward novel genres/artists outside user's bubble
    serendipityBonus: 25,          // +25: Bonus for tracks from genres/artists not in user's profile
    serendipityThreshold: 15,      // Min score distance from top to count as "serendipitous"

    // Random jitter for freshness (prevents identical results each request)
    maxJitter: 8,                 // ±8 random points (applied as Math.random() * 16 - 8)
    highConfidenceJitter: 0,      // Reserved: reduced jitter for high-confidence matches
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEEDBACK — Self-learning signal processing
  // Source: /app/api/music/recommendations/feedback/route.ts
  // ═══════════════════════════════════════════════════════════════════════════
  feedback: {
    // Time decay for feedback signals — currently no explicit decay is applied;
    // data is retained for STORE_TTL (30 days) with equal weight.
    // Set to 720 hours (30 days) to match the storage retention window.
    timeDecayHalfLife: 720,        // hours — no effective decay within storage window

    // Minimum interaction count before a genre/artist signal is used for boosting
    minSignalsForBoost: 2,         // total >= 2 required to compute affinity score

    // Laplace smoothing for sparse feedback data (currently unused)
    laplaceSmoothing: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RADIO — "My Wave" infinite radio stream scoring
  // Source: /app/api/music/radio/route.ts — scoreCandidate()
  // ═══════════════════════════════════════════════════════════════════════════
  radio: {
    // Primary similarity signals
    relatedCurrent: 150,           // +150: From SC Related API for the CURRENT track
    relatedHistory: 80,            // +80: From SC Related API for a HISTORY track
    sameArtist: -40,               // -40: Same artist as currently playing (penalty to prevent repetition)
    historyArtist: 40,             // +40: Same artist as a recently played history track
    genreMatch: 30,                // +30: Genre match with current track's genre

    // Energy transition quality (Smart Shuffle style)
    energyClose: 25,               // +25: Energy close to current (within energyCloseRange)
    energyCloseRange: 0.2,         // Max energy distance for "close" classification
    energyShiftRange: 0.4,         // Max energy distance for "shift" classification
    energyFarPenalty: 15,          // -15: Energy very different from current
    energyFarThreshold: 0.5,       // Energy distance threshold for far penalty

    // Energy flow direction bonuses — smooth DJ-like transitions
    energyFlowUp: 8,               // +8: Smooth upward energy transition
    energyFlowDown: 8,             // +8: Smooth downward energy transition
    energyStable: 5,               // +5: Stable energy level (comfortable listening)

    // Language & quality
    languageMatch: 20,             // +20: Track language matches user preference
    playability: 30,               // +30: Full playable track (scIsFull)
    coverArt: 15,                  // +15: Track has cover art

    // User feedback signals (Apple Music / Yandex style)
    skippedArtistPenalty: 80,      // -80: Artist user keeps skipping
    skippedGenrePenalty: 50,       // -50: Genre user keeps skipping

    // Anti-spam
    noisePenalty: 200,             // -200: Noise/spam keywords in title/artist

    // Momentum detection — penalize same artist after user skips repeatedly
    momentumSkipThreshold: 2,      // After 2 consecutive skips, apply penalty
    momentumPenalty: 120,          // -120: Strong penalty for same artist when user is skipping

    // Target track count per radio batch
    targetMin: 10,                 // Minimum tracks in response
    targetMax: 12,                 // Maximum tracks in response

    // Energy diversity bucket sizes (for selectWithEnergyDiversity)
    closeBucketMax: 4,             // Max tracks with energy close to current (3 + random 0-1)
    shiftBucketMax: 3,             // Max tracks with slight energy shift (2 + random 0-1)
    wildcardBucketMax: 3,          // Max wildcard tracks for variety (2 + random 0-1)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRENDING — Popular tracks ranking algorithm
  // Source: /app/api/music/trending/route.ts — scoreTrack()
  // ═══════════════════════════════════════════════════════════════════════════
  trending: {
    // Category weights for query authority
    // Chart queries carry more authority than random genre queries
    categoryWeights: {
      charts: 1.3,                 // Chart queries (top 50, viral 50, etc.) — highest authority
      rising: 1.1,                 // Rising/trending queries — high authority
      social: 1.0,                 // Social viral queries (TikTok, Reels) — baseline
      genres: 0.8,                 // Genre diversity queries — lower authority
    },

    // Core scoring signals
    crossQueryBonus: 120,          // Per-query frequency bonus (queryCount * 120)
    fullPlayableBonus: 400,        // +400: Full playable track (vastly preferred)
    previewPenalty: 100,           // -100: Preview-only track (demoted significantly)

    // Duration quality scoring
    optimalDurationMin: 120,       // 2 min — start of standard song length range
    optimalDurationMax: 360,       // 6 min — end of standard song length range
    optimalDurationBonus: 80,      // +80: Within optimal 2-6 min range
    sweetSpotBonus: 30,            // +30: Within 3-4 min sweet spot (most popular length)
    sweetSpotMin: 180,             // 3 min — sweet spot start
    sweetSpotMax: 240,             // 4 min — sweet spot end

    // Content quality
    coverBonus: 50,                // +50: Track has cover art (likely real release)
    shortClipPenalty: 200,         // -200: Very short clips (< shortClipThreshold) are noise
    shortClipThreshold: 30,        // 30 seconds — minimum to be considered a real track

    // Freshness bonuses — query-time heuristic for likely new releases
    freshnessBonus7d: 25,          // +25: Track sourced from fresh/new query categories
    freshnessBonus30d: 0,          // Reserved: bonus for tracks < 30 days old

    // Artist diversity limits
    maxArtistDefault: 2,           // Max tracks per artist (standard)
    maxArtistTop: 3,               // Max tracks per artist (high-scoring artists, artistScore > 500)

    // Output composition
    topScoredLimit: 20,            // First pass: top scored tracks (max 20)
    uniqueArtistsLimit: 40,        // Second pass: unique artist picks (fill to 40)
    targetTracks: 50,              // Total target track count
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CURATED — Curated playlist generation
  // Source: /app/api/playlists/curated/route.ts
  // ═══════════════════════════════════════════════════════════════════════════
  curated: {
    trackLimit: 50,                // TRACK_LIMIT — max tracks per curated playlist
    maxArtistsPerPlaylist: 1,      // MAX_TRACKS_PER_ARTIST — strict artist diversity (max 1 per artist)
    artistDiversityRelaxation: [2, 3, 4, 6],
    // If strict diversity drops us below minTarget, relax to 3, then 4, 5, 10 per artist
    cacheTtl: 5 * 60 * 1000,      // 5 minutes — force fresh diversity on each load
    minTracksForPlaylist: 3,       // Minimum tracks required to include a playlist in response
    qualityMinDuration: 30,        // Seconds — minimum duration for quality filter
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVERSITY — Result set diversity controls
  // Source: /app/api/music/recommendations/route.ts
  // ═══════════════════════════════════════════════════════════════════════════
  diversity: {
    maxPerArtist: 1,               // Max tracks per artist in the flat recommendation list (strict for variety)
    explorationRate: 0.1,          // 10% epsilon for epsilon-greedy exploration (discovery)
  },
  // v14: Content quality minimum threshold (0-100)
  // Tracks below this score are hard-filtered BEFORE scoring
  quality: {
    minimumScore: 45,              // Raised from 30 — significantly stricter filtering
    // Supplementary fill tracks also use this threshold
    fillMinimumScore: 45,          // Quality gate for supplementary fill tracks
    // Exploration injection tracks also use this threshold
    exploreMinimumScore: 45,       // Quality gate for discovery/exploration tracks
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COLD START — Behavior when user has minimal listening history
  // Source: /app/api/music/recommendations/route.ts — genreFallback thresholds
  // ═══════════════════════════════════════════════════════════════════════════
  coldStart: {
    minLikedForFullMode: 3,        // Below this liked count → genre fallback kicks in
    minHistoryForFullMode: 5,      // Below this history count → genre fallback kicks in
    explorationBoost: 0,           // Reserved: score boost for exploration in cold-start mode
  },
};
