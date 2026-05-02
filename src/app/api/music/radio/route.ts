import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { RECOMMENDATIONS_CONFIG as CFG } from "@/config/recommendations";

/**
 * "Моя волна" (My Wave) Radio API — YouTube Music / Yandex Music style.
 *
 * Generates the next batch of tracks for an infinite radio stream based on
 * the currently playing track and session context. Uses a two-stage system:
 *
 *   Stage 1 — Candidate Generation (50–100 tracks via related APIs + search)
 *   Stage 2 — Ranking with energy-aware diversity selection (top 10–12)
 *
 * GET /api/music/radio
 *   ?scTrackId=12345               (required) current SoundCloud track ID
 *   &historyScIds=111,222,333      (optional) recently played SC IDs
 *   &skippedGenres=pop,edm         (optional) genres user keeps skipping
 *   &skippedArtists=DJ Foo,Bar Baz (optional) artists user keeps skipping
 *   &lang=russian                  (optional) language preference
 *   &energy=medium                 (optional) desired energy level
 *   &recentSkipCount=3             (optional) number of consecutive recent skips
 */

// ── In-memory cache (4 min TTL) ────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  // Evict expired entries when map grows large
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ── Genre normalization ────────────────────────────────────────────────────────
function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .trim()
    .replace(/ & /g, " and ")
    .replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb")
    .replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass")
    .replace(/d 'n' b/gi, "drum and bass");
}

// ── Language detection ──────────────────────────────────────────────────────────
function detectLanguage(text: string): "russian" | "english" | "latin" | "other" {
  if (!text) return "other";
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cyrillic + latin;
  if (total === 0) return "other";
  if (cyrillic / total > 0.4) return "russian";
  if (latin / total > 0.6) return "english";
  return "latin";
}

// ── Energy estimation ──────────────────────────────────────────────────────────
function estimateEnergy(track: SCTrack): number {
  const title = (track.title || "").toLowerCase();
  const genre = normalizeGenre(track.genre || "");
  const dur = track.duration || 0;

  const highKeywords = [
    "remix", "edit", "mix", "club", "bass boosted", "radio edit", "extended",
    "hard", "rush", "hype", "banger", "drop", "festival", "rave", "workout",
    "gym", "bootleg", "vip", "original mix",
  ];
  const lowKeywords = [
    "acoustic", "live", "unplugged", "piano", "lullaby", "reprise",
    "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi",
    "slow", "ballad",
  ];

  let s = 0;
  for (const kw of highKeywords) {
    if (title.includes(kw)) { s += 1; break; }
  }
  for (const kw of lowKeywords) {
    if (title.includes(kw)) { s -= 1; break; }
  }

  const highG = [
    "edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap",
    "reggaeton", "dance pop", "hardcore", "trance", "psytrance", "garage",
    "grime", "drill",
  ];
  const midG = [
    "house", "pop", "hip hop", "rap", "indie", "rock", "alternative",
    "synthwave", "afrobeats",
  ];
  const lowG = [
    "ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova",
    "downtempo", "jazz", "blues", "new age",
  ];

  if (highG.some((g) => genre.includes(g))) s += 2;
  else if (midG.some((g) => genre.includes(g))) s += 1;
  if (lowG.some((g) => genre.includes(g))) s -= 2;

  if (dur > 0) {
    if (dur < 150) s += 1;
    else if (dur > 360) s -= 1;
  }

  if (s >= 2) return 1;
  if (s <= -2) return 0;
  if (s >= 1) return 0.75;
  if (s <= -1) return 0.25;
  return 0.5;
}

// ── Noise / spam keyword filter ────────────────────────────────────────────────
const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Hashtag genre mismatch detection ───────────────────────────────────────────
const HASHTAG_GENRE_PATTERN = /#(\w+(\s+\w+)*)/g;
const KNOWN_GENRE_HASHTAGS = [
  "deephouse", "deep house", "tech house", "techhouse",
  "soulful house", "club house", "progressive house",
  "tropical house", "future house", "afro house",
  "melodic house", "jackin house", "acid house",
];

function titleHashtagGenreMismatch(title: string, referenceGenres: string[]): boolean {
  const hashtags: string[] = [];
  const matches = title.matchAll(HASHTAG_GENRE_PATTERN);
  for (const match of matches) {
    const tag = match[1].toLowerCase().trim();
    if (KNOWN_GENRE_HASHTAGS.includes(tag)) hashtags.push(tag);
  }
  if (hashtags.length === 0) return false;
  const refLower = referenceGenres.map((g) => normalizeGenre(g));
  for (const hg of hashtags) {
    const hgNorm = normalizeGenre(hg);
    if (!refLower.some((tg) => tg === hgNorm || tg.includes(hgNorm) || hgNorm.includes(tg))) {
      return true;
    }
  }
  return false;
}

// ── SoundCloud related tracks fetcher ──────────────────────────────────────────
async function fetchSCTrackRelated(scTrackId: number): Promise<SCTrack[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return [];
    const url = `https://api-v2.soundcloud.com/tracks/${scTrackId}/related?client_id=${clientId}&limit=20&offset=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data) ? data : data.collection || [];
    return raw
      .filter((t: Record<string, unknown>) => (t.kind as string) === "track")
      .map((t: Record<string, unknown>) => {
        const user = t.user as Record<string, unknown> | undefined;
        const artwork = (t.artwork_url as string) || "";
        const rawCover = artwork
          ? artwork.replace("-large.", "-t500x500.")
          : ((user?.avatar_url as string) || "").replace("-large.", "-t500x500.") || "";
        const cover = rawCover
          ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}`
          : "";
        const fullDuration = (t.full_duration as number) || (t.duration as number) || 30000;
        const policy = (t.policy as string) || "ALLOW";
        return {
          id: `sc_${t.id}`,
          title: (t.title as string) || "Unknown",
          artist: user?.username || "Unknown",
          album: "",
          duration: Math.round(fullDuration / 1000),
          cover,
          genre: (t.genre as string) || "",
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud" as const,
          scTrackId: t.id as number,
          scStreamPolicy: policy,
          scIsFull: policy === "ALLOW",
        };
      });
  } catch {
    return [];
  }
}

// ── Internal candidate with provenance ─────────────────────────────────────────
type CandidateSource =
  | "current_related"    // From SC Related for the currently playing track
  | "history_related"    // From SC Related for a history track
  | "artist_search"      // Found via artist name search
  | "genre_year_search"  // Found via "{genre} {year}" search
  | "artist_genre_search" // Found via "{artist} {genre}" search
  | "genre_search";       // Generic genre search fallback

interface Candidate {
  track: SCTrack;
  source: CandidateSource;
  /** Energy distance from the seed track (0 = identical) */
  energyDistance: number;
}

// ── Track output format ────────────────────────────────────────────────────────
interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  genre: string;
  audioUrl: string;
  previewUrl: string;
  source: "soundcloud";
  scTrackId: number;
  scStreamPolicy: string;
  scIsFull: boolean;
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function scoreCandidate(
  candidate: Candidate,
  ctx: {
    currentArtist: string;
    currentGenre: string;
    currentEnergy: number;
    currentDuration: number;
    recentSkipCount: number;
    historyArtists: Set<string>;
    skippedArtists: Set<string>;
    skippedGenres: Set<string>;
    langPref: string | null;
  },
): number {
  let score = 0;
  const { track, source } = candidate;
  const trackGenre = normalizeGenre(track.genre || "");
  const trackArtist = (track.artist || "").toLowerCase().trim();

  // ── PRIMARY SIGNALS (actual similarity) ──
  // +CFG.radio.relatedCurrent: From SC Related API for the CURRENT track
  if (source === "current_related") score += CFG.radio.relatedCurrent;
  // +CFG.radio.relatedHistory: From SC Related API for a HISTORY track
  else if (source === "history_related") score += CFG.radio.relatedHistory;
  // +CFG.radio.sameArtist: Same artist as current track (different track)
  if (trackArtist && trackArtist === ctx.currentArtist.toLowerCase().trim()) {
    score += CFG.radio.sameArtist;
  }
  // +CFG.radio.historyArtist: Same artist as a recently played track
  if (trackArtist && ctx.historyArtists.has(trackArtist)) {
    score += CFG.radio.historyArtist;
  }
  // +CFG.radio.genreMatch: Genre match with current track's genre
  if (trackGenre && ctx.currentGenre) {
    const curNorm = normalizeGenre(ctx.currentGenre);
    if (trackGenre === curNorm || trackGenre.includes(curNorm) || curNorm.includes(trackGenre)) {
      score += CFG.radio.genreMatch;
    }
  }

  // ── ENERGY FLOW ──
  // Rewards gradual energy transitions (smooth DJ-like mixing)
  const energyDiff = estimateEnergy(track) - ctx.currentEnergy;
  if (energyDiff > 0 && energyDiff <= 0.3) {
    score += CFG.radio.energyFlowUp;  // smooth upward transition
  } else if (energyDiff < 0 && energyDiff >= -0.3) {
    score += CFG.radio.energyFlowDown;  // smooth downward transition
  } else if (Math.abs(energyDiff) <= 0.15) {
    score += CFG.radio.energyStable;  // stable energy level
  }

  // ── LANGUAGE (user preference) ──
  if (ctx.langPref) {
    const trackText = `${track.title || ""} ${track.artist || ""}`;
    const trackLang = detectLanguage(trackText);
    if (trackLang === ctx.langPref) score += CFG.radio.languageMatch;
  }

  // ── QUALITY GATES ──
  if (track.scIsFull) score += CFG.radio.playability;
  if (track.cover) score += CFG.radio.coverArt;
  if (track.duration >= 120 && track.duration <= 360) score += 10;

  // ── DURATION SIMILARITY ──
  // Tracks of similar length tend to flow better in radio
  if (ctx.currentDuration > 0) {
    const durDiff = Math.abs((track.duration || 200) - ctx.currentDuration);
    if (durDiff <= 60) score += 10;       // very similar length
    else if (durDiff <= 120) score += 5;  // somewhat similar
  }

  // ── FEEDBACK (Apple Music / Yandex style skip signals) ──
  if (ctx.skippedArtists.has(trackArtist)) score -= CFG.radio.skippedArtistPenalty;
  if (ctx.skippedGenres.has(trackGenre)) score -= CFG.radio.skippedGenrePenalty;
  // ── ANTI-SPAM ──
  const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleArtistNoise)) score -= CFG.radio.noisePenalty;
  if (titleHashtagGenreMismatch(track.title || "", [ctx.currentGenre])) score -= CFG.radio.noisePenalty / 2;

  // ── MOMENTUM PENALTY ──
  // If user is skipping a lot, avoid same artist to break the pattern
  if (ctx.recentSkipCount >= CFG.radio.momentumSkipThreshold) {
    if (trackArtist && trackArtist === ctx.currentArtist.toLowerCase().trim()) {
      score -= CFG.radio.momentumPenalty;
    }
  }

  // ── FRESHNESS ──
  score += Math.random() * 16 - 8; // ±8 jitter

  return score;
}

// ── Hard exclusion filter ──────────────────────────────────────────────────────
function shouldExclude(
  track: SCTrack,
  ctx: {
    excludedScIds: Set<number>;
    skippedArtists: Set<string>;
    skippedGenres: Set<string>;
    currentGenre: string;
  },
): boolean {
  // Already in the session's played history
  if (ctx.excludedScIds.has(track.scTrackId)) return true;

  // Skipped artist
  const artist = (track.artist || "").toLowerCase().trim();
  if (artist && ctx.skippedArtists.has(artist)) return true;

  // Skipped genre
  const genre = normalizeGenre(track.genre || "");
  if (genre && ctx.skippedGenres.has(genre)) return true;

  // Noise / spam
  const titleArtist = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleArtist)) return true;
  if (titleHashtagGenreMismatch(track.title || "", [ctx.currentGenre])) return true;

  // No cover art
  if (!track.cover) return true;

  // Too short to be a real track
  if (track.duration && track.duration < 30) return true;

  return false;
}

// ── Energy-aware diversity selection ───────────────────────────────────────────
/**
 * After scoring, picks targetMin–targetMax tracks with controlled energy diversity:
 *   - closeBucketMax tracks with energy CLOSE to the current track  (smooth transition)
 *   - shiftBucketMax tracks with SLIGHTLY different energy           (gradual shift)
 *   - wildcardBucketMax tracks                                       (variety)
 */
function selectWithEnergyDiversity(
  scored: { candidate: Candidate; score: number }[],
  currentEnergy: number,
  targetCount: { min: number; max: number },
): Candidate[] {
  const result: Candidate[] = [];
  const used = new Set<number>();
  const artistCount = new Map<string, number>();
  const MAX_PER_ARTIST = 2; // Artist diversity: max 2 tracks per artist per radio batch
  const totalTarget = targetCount.min + Math.floor(Math.random() * (targetCount.max - targetCount.min + 1));

  const pick = (
    filterFn: (c: { candidate: Candidate; score: number }) => boolean,
    maxFromBucket: number,
  ) => {
    let picked = 0;
    for (const item of scored) {
      if (result.length >= totalTarget || picked >= maxFromBucket) return;
      if (used.has(item.candidate.track.scTrackId)) continue;
      if (!filterFn(item)) continue;
      // Artist diversity check
      const artist = (item.candidate.track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= MAX_PER_ARTIST) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      result.push(item.candidate);
      used.add(item.candidate.track.scTrackId);
      picked++;
    }
  };

  // Bucket definitions
  const closeRange = CFG.radio.energyCloseRange;
  const shiftRange = CFG.radio.energyShiftRange;

  // 1. Close energy tracks
  pick(
    (c) => c.candidate.energyDistance <= closeRange,
    CFG.radio.closeBucketMax,
  );

  // 2. Slight shift tracks
  pick(
    (c) => c.candidate.energyDistance > closeRange && c.candidate.energyDistance <= shiftRange,
    CFG.radio.shiftBucketMax,
  );

  // 3. Wildcard tracks — higher energy difference for variety
  pick(
    (c) => c.candidate.energyDistance > shiftRange,
    CFG.radio.wildcardBucketMax,
  );

  // 4. Fill remaining slots with highest-scored unused tracks
  for (const item of scored) {
    if (result.length >= totalTarget) break;
    if (used.has(item.candidate.track.scTrackId)) continue;
    const artist = (item.candidate.track.artist || "").toLowerCase().trim();
    if ((artistCount.get(artist) || 0) >= MAX_PER_ARTIST) continue;
    artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
    result.push(item.candidate);
    used.add(item.candidate.track.scTrackId);
  }

  return result.slice(0, totalTarget);
}

// ── Artist-aware interleaving for radio tracks ──
function interleaveRadioTracks(tracks: Candidate[]): Candidate[] {
  if (tracks.length <= 2) return tracks;
  const result: Candidate[] = [];
  const remaining = [...tracks];
  let lastArtist: string | null = null;

  while (remaining.length > 0) {
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const artist = (remaining[i].track.artist || "").toLowerCase().trim();
      if (artist !== lastArtist) {
        pickedIdx = i;
        break;
      }
    }
    // Fallback: all remaining are same artist, take the first
    if (pickedIdx === -1) pickedIdx = 0;
    const picked = remaining.splice(pickedIdx, 1)[0];
    lastArtist = (picked.track.artist || "").toLowerCase().trim();
    result.push(picked);
  }
  return result;
}

// ── Map candidate to output track ──────────────────────────────────────────────
function mapToRadioTrack(candidate: Candidate): RadioTrack {
  const { track } = candidate;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    cover: track.cover,
    genre: track.genre,
    audioUrl: track.audioUrl,
    previewUrl: track.previewUrl,
    source: "soundcloud",
    scTrackId: track.scTrackId,
    scStreamPolicy: track.scStreamPolicy,
    scIsFull: track.scIsFull,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ── Parse parameters ──────────────────────────────────────────────────────
  const scTrackIdParam = searchParams.get("scTrackId");
  const historyScIdsParam = searchParams.get("historyScIds") || "";
  const skippedGenresParam = searchParams.get("skippedGenres") || "";
  const skippedArtistsParam = searchParams.get("skippedArtists") || "";
  const langParam = searchParams.get("lang") || "";
  const energyParam = searchParams.get("energy") || "";
  const recentSkipCount = parseInt(searchParams.get("recentSkipCount") || "0", 10);

  // Validate required parameter
  if (!scTrackIdParam) {
    return NextResponse.json(
      { error: "Missing required parameter: scTrackId" },
      { status: 400 },
    );
  }

  const scTrackId = Number(scTrackIdParam);
  if (isNaN(scTrackId) || scTrackId <= 0) {
    return NextResponse.json(
      { error: "Invalid scTrackId: must be a positive integer" },
      { status: 400 },
    );
  }

  // Parse optional parameters
  const historyScIds: number[] = historyScIdsParam
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);

  // All IDs that should be excluded from results (current + history)
  const excludedScIds = new Set<number>([scTrackId, ...historyScIds]);

  const skippedGenres = new Set(
    skippedGenresParam
      .split(",")
      .filter(Boolean)
      .map((g) => normalizeGenre(g)),
  );

  const skippedArtists = new Set(
    skippedArtistsParam
      .split(",")
      .filter(Boolean)
      .map((a) => a.toLowerCase().trim()),
  );

  // Language preference: only accept known values
  const langPref: "russian" | "english" | "latin" | null =
    langParam === "russian" || langParam === "english" || langParam === "latin"
      ? langParam
      : null;

  // Energy preference
  let energyPref: number | null = null;
  if (energyParam === "high") energyPref = 0.8;
  else if (energyParam === "medium") energyPref = 0.5;
  else if (energyParam === "low") energyPref = 0.2;

  // ── Cache check ───────────────────────────────────────────────────────────
  const cacheKey = `radio:${scTrackId}:${historyScIdsParam}:${skippedGenresParam}:${skippedArtistsParam}:${langParam}:${energyParam}:${recentSkipCount}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // STEP 0: Fetch seed track metadata + history track metadata (parallel)
    // ══════════════════════════════════════════════════════════════════════════

    // Search for the current track to get its artist, genre, duration
    const currentTrackPromise = searchSCTracks(String(scTrackId), 1);

    // Search for history tracks (last 2) to extract their artists for scoring
    const last2History = historyScIds.slice(0, 2);
    const historyMetadataPromises = last2History.map(
      (hid) => searchSCTracks(String(hid), 1),
    );

    const [currentTrackResult, ...historyMetadataResults] = await Promise.allSettled([
      currentTrackPromise,
      ...historyMetadataPromises,
    ]);

    // Extract current track metadata
    let currentArtist = "";
    let currentGenre = "";
    let currentEnergy = 0.5;
    let currentDuration = 200;

    if (currentTrackResult.status === "fulfilled" && currentTrackResult.value.length > 0) {
      const ct = currentTrackResult.value[0];
      currentArtist = ct.artist || "";
      currentGenre = ct.genre || "";
      currentEnergy = estimateEnergy(ct);
      currentDuration = ct.duration || 200;
    }

    // If energy preference is provided, blend it with the detected energy
    if (energyPref !== null) {
      currentEnergy = currentEnergy * 0.6 + energyPref * 0.4;
    }

    // Extract history artists (for +CFG.radio.historyArtist scoring bonus)
    const historyArtists = new Set<string>();
    for (const result of historyMetadataResults) {
      if (result.status === "fulfilled" && result.value.length > 0) {
        const artist = (result.value[0].artist || "").toLowerCase().trim();
        if (artist) historyArtists.add(artist);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STAGE 1: CANDIDATE GENERATION (target 50–100 candidates)
    // All sources fetched in parallel.
    // ══════════════════════════════════════════════════════════════════════════

    // Build all fetch promises upfront
    const allFetchPromises: Promise<SCTrack[]>[] = [];
    // Keep track of which promise index maps to which source
    const sourceMap: CandidateSource[] = [];

    // ── Source 1: SC Related for CURRENT track (~20 tracks, HIGHEST quality)
    sourceMap.push("current_related");
    allFetchPromises.push(fetchSCTrackRelated(scTrackId));

    // ── Source 2: Current artist name search (~10 tracks)
    if (currentArtist) {
      sourceMap.push("artist_search");
      allFetchPromises.push(searchSCTracks(`"${currentArtist}"`, 10));
    }

    // ── Source 3: SC Related for last 2 history tracks (~20 each, up to 40)
    for (const hid of last2History) {
      sourceMap.push("history_related");
      allFetchPromises.push(fetchSCTrackRelated(hid));
    }

    // ── Source 4: "{genre} {year}" search (~10 tracks)
    const year = new Date().getFullYear();
    const genreYearQuery = currentGenre ? `${currentGenre} ${year}` : `new music ${year}`;
    sourceMap.push("genre_year_search");
    allFetchPromises.push(searchSCTracks(genreYearQuery, 10));

    // ── Source 5: "{artist} {genre}" search (~10 tracks)
    if (currentArtist && currentGenre) {
      sourceMap.push("artist_genre_search");
      allFetchPromises.push(searchSCTracks(`${currentArtist} ${currentGenre}`, 10));
    }

    // Execute ALL fetches in parallel
    const fetchResults = await Promise.allSettled(allFetchPromises);

    // ── Aggregate candidates ────────────────────────────────────────────────
    const candidateMap = new Map<number, Candidate>();

    // Source priority for deduplication upgrades
    const sourcePriority: Record<CandidateSource, number> = {
      current_related: 5,
      history_related: 4,
      artist_search: 3,
      artist_genre_search: 2,
      genre_year_search: 1,
      genre_search: 0,
    };

    const addCandidate = (track: SCTrack, source: CandidateSource) => {
      // Skip the current track itself
      if (track.scTrackId === scTrackId) return;

      // Hard exclusion filter
      if (shouldExclude(track, {
        excludedScIds,
        skippedArtists,
        skippedGenres,
        currentGenre,
      })) return;

      // If we already have this candidate, only upgrade source if higher priority
      const existing = candidateMap.get(track.scTrackId);
      if (existing) {
        if ((sourcePriority[source] ?? 0) > (sourcePriority[existing.source] ?? 0)) {
          existing.source = source;
        }
        return;
      }

      const trackEnergy = estimateEnergy(track);
      candidateMap.set(track.scTrackId, {
        track,
        source,
        energyDistance: Math.abs(trackEnergy - currentEnergy),
      });
    };

    // Process all fetch results
    for (let i = 0; i < fetchResults.length; i++) {
      const result = fetchResults[i];
      const source = sourceMap[i];
      if (result.status === "fulfilled") {
        for (const track of result.value) {
          addCandidate(track, source);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STAGE 2: RANKING & ENERGY-AWARE SELECTION
    // ══════════════════════════════════════════════════════════════════════════

    // Score each candidate
    const scoredCandidates: { candidate: Candidate; score: number }[] = [];

    for (const [, candidate] of candidateMap) {
      const score = scoreCandidate(candidate, {
        currentArtist,
        currentGenre,
        currentEnergy,
        currentDuration,
        recentSkipCount,
        historyArtists,
        skippedArtists,
        skippedGenres,
        langPref,
      });

      scoredCandidates.push({ candidate, score });
    }

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Energy-aware selection: targetMin–targetMax tracks with diversity
    const selected = selectWithEnergyDiversity(scoredCandidates, currentEnergy, {
      min: CFG.radio.targetMin,
      max: CFG.radio.targetMax,
    });

    // Interleave to prevent consecutive same-artist tracks
    const interleaved = interleaveRadioTracks(selected);

    // Map to output format
    const tracks = interleaved.map(mapToRadioTrack);

    // ── Build response ──────────────────────────────────────────────────────
    const responseData = {
      tracks,
      seedInfo: {
        artist: currentArtist || "Unknown",
        genre: currentGenre || "Unknown",
        energy: Math.round(currentEnergy * 100) / 100,
      },
      sessionHints: {
        recommendedEnergyDirection: currentEnergy < 0.4 ? "up" : currentEnergy > 0.7 ? "down" : "stable",
        diversityDebt: selected.filter(c => {
          const e = estimateEnergy(c.track);
          return Math.abs(e - currentEnergy) <= CFG.radio.energyCloseRange;
        }).length > selected.length * 0.6 ? "high" : "normal",
      },
      _meta: {
        candidatesGenerated: candidateMap.size,
        candidatesAfterScoring: scoredCandidates.length,
        selected: tracks.length,
      },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error("[radio] Unexpected error:", err);
    return NextResponse.json(
      { tracks: [], seedInfo: { artist: "Unknown", genre: "Unknown", energy: 0 } },
      { status: 200 },
    );
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
