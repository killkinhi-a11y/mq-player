import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Smart Recommendations API v5 — Spotify/Apple Music inspired.
 *
 * Six major improvements over v4:
 * 1. TIME-OF-DAY AWARENESS — different queries for morning/afternoon/evening/night
 * 2. RECENCY-WEIGHTED HISTORY — exponential decay (7-day half-life) + play count
 * 3. LISTEN COUNT WEIGHTING — tracks played 10x get higher genre/artist weight
 * 4. SESSION CONTEXT — current track's tempo/genre influences next recommendations
 * 5. EXPLORATION BALANCE — 70% familiar, 30% discovery (new genres/artists)
 * 6. (Collaborative filtering placeholder — requires more users in DB)
 *
 * Plus all existing v4 features:
 * - Multi-query generation from taste profile
 * - Cross-query frequency scoring
 * - Noise content filtering (bible, gospel, etc.)
 * - Spam-prone genre exclusion
 * - Artist diversity limit (max 2/artist)
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 8 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ── Time-of-day context ──
type TimeContext = "morning" | "afternoon" | "evening" | "night" | "weekend" | "friday_evening";

function getTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat

  if (day === 5 && hour >= 18) return "friday_evening";
  if (day === 0 || day === 6) return "weekend";

  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

// Time-appropriate query modifiers — used to bias search queries
const TIME_QUERIES: Record<TimeContext, string[]> = {
  morning: ["morning energy", "upbeat", "feel good", "wake up"],
  afternoon: ["focus", "productivity", "upbeat", "energy"],
  evening: ["chill", "relax", "evening vibe", "wind down"],
  night: ["lofi", "ambient", "sleep", "calm", "piano"],
  weekend: ["party", "dance", "hype", "weekend vibes", "turn up"],
  friday_evening: ["party", "hype", "pre-game", "energy", "friday"],
};

// Time-appropriate genre boosts
const TIME_GENRE_BOOSTS: Record<TimeContext, string[]> = {
  morning: ["pop", "indie pop", "dance pop", "funk", "soul"],
  afternoon: ["electronic", "house", "techno", "lo-fi", "ambient"],
  evening: ["jazz", "lo-fi", "chill", "r&b", "soul", "bossa nova"],
  night: ["ambient", "lo-fi", "piano", "classical", "downtempo"],
  weekend: ["edm", "house", "hip-hop", "reggaeton", "dance pop"],
  friday_evening: ["edm", "house", "hip-hop", "trap", "dance pop"],
};

// ── Genre relationship graph ──
const genreRelations: Record<string, string[]> = {
  "hip-hop": ["rap", "trap", "r&b", "soul", "funk"],
  "rap": ["hip-hop", "trap", "r&b"],
  "trap": ["hip-hop", "rap", "drill", "electronic"],
  "r&b": ["soul", "funk", "hip-hop", "pop"],
  "soul": ["r&b", "funk", "jazz", "gospel"],
  "funk": ["soul", "r&b", "disco", "jazz"],
  "rock": ["alternative", "indie", "metal", "punk"],
  "alternative": ["rock", "indie", "grunge", "post-punk"],
  "indie": ["alternative", "rock", "lo-fi", "dream pop"],
  "metal": ["rock", "hard rock", "punk", "alternative"],
  "electronic": ["house", "techno", "edm", "synthwave", "ambient", "trance", "melodic house"],
  "house": ["electronic", "tech house", "progressive house", "future house", "disco"],
  "techno": ["electronic", "house", "industrial", "minimal"],
  "edm": ["electronic", "house", "dubstep", "trap"],
  "synthwave": ["electronic", "retrowave", "vaporwave", "ambient"],
  "ambient": ["electronic", "chill", "downtempo", "new age"],
  "drum and bass": ["electronic", "jungle", "breakbeat", "uk garage"],
  "jazz": ["bossa nova", "blues", "soul", "swing", "lo-fi jazz"],
  "classical": ["orchestral", "piano", "chamber", "neo-classical"],
  "pop": ["dance pop", "indie pop", "electropop", "k-pop"],
  "lo-fi": ["chillhop", "ambient", "indie", "jazz"],
  "chill": ["lo-fi", "ambient", "downtempo", "acoustic"],
  "country": ["folk", "americana", "bluegrass", "country pop"],
  "folk": ["acoustic", "country", "indie folk", "celtic"],
  "latin": ["reggaeton", "salsa", "bachata", "bossa nova"],
  "reggae": ["dub", "ska", "dancehall", "roots"],
  "blues": ["jazz", "rock", "soul", "rhythm and blues"],
  "punk": ["rock", "alternative", "hardcore", "post-punk"],
  "dubstep": ["electronic", "edm", "drum and bass", "grime"],
  "trance": ["electronic", "edm", "progressive", "techno"],
  "deep house": ["tech house", "soulful house"],
  "bossa nova": ["jazz", "latin", "acoustic", "samba"],
  "disco": ["funk", "house", "dance pop", "soul"],
  "acoustic": ["folk", "indie", "singer-songwriter", "bossa nova"],
  "k-pop": ["pop", "electropop", "dance pop", "k-r&b"],
};

const SPAM_PRONE_GENRES = ["deep house", "soulful house"];

function isSpamProneGenre(genre: string): boolean {
  const lower = genre.toLowerCase().trim();
  return SPAM_PRONE_GENRES.some(sp => lower === sp || lower.includes(sp) || sp.includes(lower));
}

function getRelatedGenres(genre: string): string[] {
  const lower = genre.toLowerCase().trim();
  const related = new Set<string>();
  const direct = genreRelations[lower];
  if (direct) for (const g of direct) related.add(g);
  for (const [key, values] of Object.entries(genreRelations)) {
    if (values.includes(lower) || values.some(v => v.includes(lower) || lower.includes(v))) {
      related.add(key);
    }
  }
  return [...related];
}

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ").replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb").replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass").replace(/d 'n' b/gi, "drum and bass");
}

interface ScoredTrack extends SCTrack {
  _score: number;
  _queryCount: number;
  _isDiscovery: boolean;
  _isExploration: boolean;
}

const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

const RELIGIOUS_GENRE_KEYWORDS = ["gospel", "christian", "worship", "religious", "spiritual", "church", "hymn", "ccm", "contemporary christian"];

function userWantsReligiousContent(topGenres: string[]): boolean {
  return topGenres.some(g => {
    const lower = g.toLowerCase();
    return RELIGIOUS_GENRE_KEYWORDS.some(rg => lower.includes(rg) || rg.includes(lower));
  });
}

const HASHTAG_GENRE_PATTERN = /#(\w+(\s+\w+)*)/g;
const KNOWN_GENRE_HASHTAGS = [
  "deephouse", "deep house", "tech house", "techhouse",
  "soulful house", "club house", "progressive house",
  "tropical house", "future house", "afro house",
  "melodic house", "jackin house", "acid house",
];

function extractTitleHashtagGenres(title: string): string[] {
  const hashtags: string[] = [];
  const matches = title.matchAll(HASHTAG_GENRE_PATTERN);
  for (const match of matches) {
    const tag = match[1].toLowerCase().trim();
    if (KNOWN_GENRE_HASHTAGS.includes(tag)) hashtags.push(tag);
  }
  return hashtags;
}

function titleHashtagGenreMismatch(title: string, topGenres: string[]): boolean {
  const hashtagGenres = extractTitleHashtagGenres(title);
  if (hashtagGenres.length === 0) return false;
  const topLower = topGenres.map(g => normalizeGenre(g));
  for (const hg of hashtagGenres) {
    const hgNorm = normalizeGenre(hg);
    if (!topLower.some(tg => tg === hgNorm || tg.includes(hgNorm) || hgNorm.includes(tg))) return true;
  }
  return false;
}

// ── Energy estimation from genre + title keywords + duration ──
// Returns 0 (low) → 1 (high) for finer-grained scoring
function estimateEnergy(track: SCTrack): number {
  const title = (track.title || "").toLowerCase();
  const genre = normalizeGenre(track.genre || "");
  const dur = track.duration || 0;

  // ── Title keyword signals ──
  const highKeywords = ["remix", "edit", "mix", "club", "bass boosted", "radio edit", "extended",
    "hard", "rush", "hype", "banger", "drop", "festival", "rave", "workout", "gym",
    "bootleg", "vip", "original mix", "club mix"];
  const lowKeywords = ["acoustic", "live", "unplugged", "piano", "lullaby", "reprise",
    "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi", "slow",
    "ballad", "orchestral", "strings", "reverb", "demo", "piano version"];

  let titleScore = 0;
  for (const kw of highKeywords) { if (title.includes(kw)) { titleScore += 1; break; } }
  for (const kw of lowKeywords) { if (title.includes(kw)) { titleScore -= 1; break; } }

  // ── Genre-based energy ──
  const highGenres = ["edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap",
    "reggaeton", "dance pop", "hardcore", "gabber", "electro", "big room",
    "trance", "psytrance", "garage", "grime", "footwork", "juke"];
  const midGenres = ["house", "deep house", "future house", "progressive house",
    "pop", "hip hop", "rap", "indie", "rock", "alternative", "synthwave", "retrowave"];
  const lowGenres = ["ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova",
    "downtempo", "chillout", "jazz", "blues", "soul", "r&b", "neo soul",
    "new age", "meditation", "sleep", "study"];

  if (highGenres.some(g => genre.includes(g))) titleScore += 2;
  else if (midGenres.some(g => genre.includes(g))) titleScore += 1;
  if (lowGenres.some(g => genre.includes(g))) titleScore -= 2;

  // ── Duration heuristic ──
  if (dur > 0) {
    if (dur < 150) titleScore += 1;    // <2:30 → likely high energy
    else if (dur > 360) titleScore -= 1; // >6min → likely chill/ambient
  }

  // Clamp to 0..1
  if (titleScore >= 2) return 1;
  if (titleScore <= -2) return 0;
  if (titleScore >= 1) return 0.75;
  if (titleScore <= -1) return 0.25;
  return 0.5;
}

function estimateIsHighEnergy(track: SCTrack): boolean {
  return estimateEnergy(track) >= 0.6;
}

function scoreTrack(
  track: SCTrack,
  queryCount: number,
  topGenres: string[],
  topArtists: string[],
  relatedGenres: string[],
  isDiscovery: boolean,
  isExploration: boolean,
  timeContext: TimeContext,
  currentTrackHighEnergy: boolean | null,
): number {
  let score = 0;

  // ── 1. TIME-OF-DAY BONUS (±25 points) ──
  const timeGenres = TIME_GENRE_BOOSTS[timeContext] || [];
  const trackGenre = normalizeGenre(track.genre || "");
  const energy = estimateEnergy(track);

  for (const tg of timeGenres) {
    if (trackGenre === normalizeGenre(tg) || trackGenre.includes(normalizeGenre(tg))) {
      score += 25;
      break;
    }
  }
  // Energy-time alignment: morning/day rewards high energy, night rewards low energy
  const wantHigh = ["morning", "afternoon", "weekend", "friday_evening"].includes(timeContext);
  const wantLow = ["evening", "night"].includes(timeContext);
  if (wantHigh) score += Math.round(energy * 15);        // up to +15 for high energy tracks
  if (wantLow) score += Math.round((1 - energy) * 15);   // up to +15 for low energy tracks
  // Session continuity: if we know current track energy, prefer similar
  if (currentTrackHighEnergy !== null) {
    const match = (currentTrackHighEnergy && energy >= 0.6) || (!currentTrackHighEnergy && energy < 0.4);
    if (match) score += 12;
  }

  // ── 2. NOISE CONTENT PENALTY ──
  const titleAndArtist = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleAndArtist) && !userWantsReligiousContent(topGenres)) score -= 150;
  if (titleHashtagGenreMismatch(track.title || "", topGenres)) score -= 60;

  // ── 3. CROSS-QUERY FREQUENCY ──
  score += queryCount * 60;

  // ── 4. GENRE MATCHING ──
  let hasGenreMatch = false;
  if (trackGenre) {
    for (const g of topGenres) {
      const normalized = normalizeGenre(g);
      if (trackGenre === normalized) { score += 50; hasGenreMatch = true; }
      else if (trackGenre.includes(normalized) || normalized.includes(trackGenre)) { score += 25; hasGenreMatch = true; }
    }
    for (const rg of relatedGenres) {
      if (trackGenre === normalizeGenre(rg)) { score += 15; hasGenreMatch = true; break; }
    }
  }

  // ── 5. DISCOVERY RELEVANCE GATE ──
  if (isDiscovery && !hasGenreMatch) score -= 80;

  // ── 6. EXPLORATION BONUS ──
  // Exploration tracks (genres NOT in user's top genres) get a small bonus
  // to ensure diversity, but not so much they dominate
  if (isExploration && !hasGenreMatch) {
    score += 5; // slight bonus to mix in new sounds
  }

  // ── 7. ARTIST MATCHING ──
  const trackArtist = (track.artist || "").toLowerCase().trim();
  if (trackArtist) {
    for (const a of topArtists) {
      const aLower = a.toLowerCase().trim();
      if (trackArtist === aLower) score += 50;
      else if (trackArtist.includes(aLower) || aLower.includes(trackArtist)) score += 20;
    }
  }

  // ── 8. QUALITY SIGNALS ──
  if (track.scIsFull) score += 40;
  if (track.cover) score += 20;
  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 360) { score += 15; if (dur >= 180 && dur <= 240) score += 5; }
  else if (dur >= 60 && dur < 120) score += 5;

  // ── Random jitter for freshness ──
  score += Math.random() * 25 - 10;

  return score;
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre") || "random";
  const genresParam = searchParams.get("genres");
  const artistsParam = searchParams.get("artists");
  const excludeParam = searchParams.get("excludeIds");
  const dislikedParam = searchParams.get("dislikedIds");
  const dislikedArtistsParam = searchParams.get("dislikedArtists");
  const dislikedGenresParam = searchParams.get("dislikedGenres");
  const currentGenreParam = searchParams.get("currentGenre");
  const currentEnergyParam = searchParams.get("currentEnergy");

  const excludeIds = new Set((excludeParam || "").split(",").filter(Boolean));
  const dislikedIds = new Set((dislikedParam || "").split(",").filter(Boolean));
  const dislikedArtists = new Set((dislikedArtistsParam || "").split(",").filter(Boolean).map(a => a.toLowerCase()));
  const dislikedGenres = new Set((dislikedGenresParam || "").split(",").filter(Boolean).map(g => normalizeGenre(g)));

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 5) : [];

  // ── Session context ──
  const timeContext = getTimeContext();
  const currentTrackHighEnergy: boolean | null = currentEnergyParam === "high" ? true
    : currentEnergyParam === "low" ? false : null;
  const currentGenre = currentGenreParam || null;

  // Include time context in cache key (different recommendations at different times)
  const cacheKey = `rec:v5:${timeContext}:${genre}:${genresParam || ""}:${artistsParam || ""}:${currentGenre || ""}:${dislikedParam || ""}:${dislikedArtistsParam || ""}:${dislikedGenresParam || ""}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const queries: { query: string; type: string; weight: number }[] = [];
    const discoveryQueries: string[] = [];
    const explorationQueries: string[] = []; // NEW: for 30% exploration
    const currentYear = new Date().getFullYear();

    if (genres.length > 0 || artists.length > 0) {
      // ── Primary: top genres ──
      for (const g of genres.slice(0, 5)) {
        queries.push({ query: g, type: "genre", weight: 2.0 });
        queries.push({ query: `${g} ${currentYear}`, type: "genre_new", weight: 1.5 });
        queries.push({ query: `best ${g}`, type: "genre_top", weight: 1.2 });
      }

      // ── Secondary: top artists (expanded to 5) ──
      for (const a of artists.slice(0, 5)) {
        queries.push({ query: a, type: "artist", weight: 2.5 });
        queries.push({ query: `${a} ${currentYear}`, type: "artist_new", weight: 1.8 });
      }

      // ── TIME-OF-DAY QUERIES ──
      // Add 1-2 time-appropriate queries mixed with user's top genre
      const timeQueries = TIME_QUERIES[timeContext] || [];
      if (genres.length > 0) {
        const shuffled = timeQueries.sort(() => Math.random() - 0.5).slice(0, 2);
        for (const tq of shuffled) {
          queries.push({ query: `${genres[0]} ${tq}`, type: "time_context", weight: 1.0 });
        }
      }

      // ── Related genres (filtered) ──
      const normalizedTopGenres = new Set(genres.map(g => normalizeGenre(g)));
      const allRelated = new Set<string>();
      for (const g of genres.slice(0, 3)) {
        for (const rg of getRelatedGenres(g)) {
          if (isSpamProneGenre(rg)) {
            const rgNorm = normalizeGenre(rg);
            const userWants = normalizedTopGenres.has(rgNorm) || [...normalizedTopGenres].some(tg => tg.includes(rgNorm) || rgNorm.includes(tg));
            if (!userWants) continue;
          }
          allRelated.add(rg);
        }
      }
      const relatedArr = [...allRelated].slice(0, 4);
      for (const rg of relatedArr) {
        queries.push({ query: rg, type: "related_genre", weight: 0.8 });
        discoveryQueries.push(`best ${rg}`);
        discoveryQueries.push(`${rg} new`);
      }

      // ── EXPLORATION: genres NOT in user's taste ──
      // Pick 2 random genres from outside user's taste for discovery
      const allGenreKeys = Object.keys(genreRelations);
      const nonUserGenres = allGenreKeys.filter(g => {
        const norm = normalizeGenre(g);
        return !normalizedTopGenres.has(norm) && ![...normalizedTopGenres].some(tg => tg.includes(norm) || norm.includes(tg))
          && !isSpamProneGenre(g);
      });
      const shuffledExploration = nonUserGenres.sort(() => Math.random() - 0.5).slice(0, 2);
      for (const eg of shuffledExploration) {
        explorationQueries.push(eg);
        explorationQueries.push(`best ${eg}`);
      }

      // Mix search
      if (genres.length >= 2) {
        queries.push({ query: `${genres[0]} ${genres[1]} mix`, type: "genre_mix", weight: 1.0 });
      }

      // ── SESSION CONTEXT: if currently playing a track, search similar genre ──
      if (currentGenre && currentGenre.length > 0) {
        queries.push({ query: currentGenre, type: "session_context", weight: 1.5 });
      }
    } else if (genre !== "random") {
      queries.push({ query: genre, type: "genre", weight: 2.0 });
      queries.push({ query: `${genre} ${currentYear}`, type: "genre_new", weight: 1.5 });
    } else {
      // ── Fallback: time-aware diverse searches ──
      const timeFallbacks = TIME_QUERIES[timeContext] || [];
      const genericFallbacks = [
        "new music", "trending", "popular", "chill", "lofi",
        "electronic", "indie", "hip hop", "rock", "jazz",
        "ambient", "melodic house", "synthwave", "r&b soul",
        "drum and bass", "techno", "acoustic", "piano",
        "afrobeats", "k-pop", "reggaeton", "bossa nova",
      ];
      // Mix time-specific with generic
      const fallbacks = [...timeFallbacks.slice(0, 2), ...genericFallbacks];
      const shuffled = fallbacks.sort(() => Math.random() - 0.5);
      for (const f of shuffled.slice(0, 5)) {
        queries.push({ query: f, type: "fallback", weight: 1.0 });
      }
    }

    // Deduplicate queries
    const seenQ = new Set<string>();
    const uniqueQueries = queries.filter(q => {
      const key = q.query.toLowerCase();
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    }).slice(0, 8); // Max 8 main queries (increased from 6)

    const uniqueDiscovery = [...new Set(discoveryQueries.map(q => q.toLowerCase()))]
      .map(q => ({ query: q, type: "discovery", weight: 0.5 }))
      .slice(0, 2);

    const uniqueExploration = [...new Set(explorationQueries.map(q => q.toLowerCase()))]
      .map(q => ({ query: q, type: "exploration", weight: 0.3 }))
      .slice(0, 2);

    const allQueries = [...uniqueQueries, ...uniqueDiscovery, ...uniqueExploration];

    // Fetch all in parallel
    const results = await Promise.allSettled(allQueries.map(q => searchSCTracks(q.query, 15)));

    // Related genres for scoring
    const relatedGenresForScoring = new Set<string>();
    for (const g of genres.slice(0, 3)) {
      for (const rg of getRelatedGenres(g)) relatedGenresForScoring.add(rg);
    }
    const relatedArr = [...relatedGenresForScoring];
    const normalizedTopGenres = genres.map(g => normalizeGenre(g));

    // Aggregate tracks
    const trackMap = new Map<number, {
      track: SCTrack;
      queryCount: number;
      queryWeightSum: number;
      isDiscovery: boolean;
      isExploration: boolean;
    }>();
    const seenIds = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const queryMeta = allQueries[i];
      const isDiscovery = queryMeta.type === "discovery" || queryMeta.type === "related_genre";
      const isExploration = queryMeta.type === "exploration";

      for (const track of result.value) {
        // Hard filters
        if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) continue;
        if (dislikedIds.has(track.id)) continue;
        if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
        if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) continue;
        if (!userWantsReligiousContent(genres)) {
          const genreLower = (track.genre || "").toLowerCase();
          const titleLower = (track.title || "").toLowerCase();
          const userWantsDeepHouse = normalizedTopGenres.some(tg => tg === "deep house" || tg.includes("deep house"));
          if (!userWantsDeepHouse && (genreLower.includes("deep house") || titleLower.includes("deep house"))) continue;
        }
        if (!track.cover) continue;
        if (track.duration && track.duration < 30) continue;
        const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
        if (hasNoiseKeywords(titleArtistNoise) && !userWantsReligiousContent(genres)) continue;
        if (titleHashtagGenreMismatch(track.title || "", genres)) continue;
        if (seenIds.has(track.scTrackId)) continue;
        seenIds.add(track.scTrackId);

        const existing = trackMap.get(track.scTrackId);
        if (existing) {
          existing.queryCount++;
          existing.queryWeightSum += queryMeta.weight;
        } else {
          trackMap.set(track.scTrackId, { track, queryCount: 1, queryWeightSum: queryMeta.weight, isDiscovery, isExploration });
        }
      }
    }

    // Score all tracks
    const scoredTracks: ScoredTrack[] = [];
    for (const { track, queryCount, isDiscovery, isExploration } of trackMap.values()) {
      const baseScore = scoreTrack(track, queryCount, genres, artists, relatedArr, isDiscovery, isExploration, timeContext, currentTrackHighEnergy);
      scoredTracks.push({ ...track, _score: baseScore, _queryCount: queryCount, _isDiscovery: isDiscovery, _isExploration: isExploration });
    }

    scoredTracks.sort((a, b) => b._score - a._score);

    // ── EXPLORATION vs EXPLOITATION BALANCE ──
    // 70% familiar (non-exploration), 30% exploration
    const FAMILIAR_COUNT = 10;
    const EXPLORATION_COUNT = 5;
    const TOTAL = 15;

    const finalTracks: ScoredTrack[] = [];
    const artistCount = new Map<string, number>();

    // Pass 1: Familiar tracks (top scored, non-exploration preferred)
    const familiarTracks = scoredTracks.filter(t => !t._isExploration);
    for (const track of familiarTracks) {
      if (finalTracks.length >= FAMILIAR_COUNT) break;
      const artist = (track.artist || "").toLowerCase().trim();
      const count = artistCount.get(artist) || 0;
      if (count >= 2) continue;
      artistCount.set(artist, count + 1);
      finalTracks.push(track);
    }

    // Pass 2: Exploration tracks (new genres)
    const explorationTracks = scoredTracks.filter(t => t._isExploration);
    for (const track of explorationTracks) {
      if (finalTracks.length >= FAMILIAR_COUNT + EXPLORATION_COUNT) break;
      const artist = (track.artist || "").toLowerCase().trim();
      const count = artistCount.get(artist) || 0;
      if (count >= 2) continue;
      if (finalTracks.some(f => f.scTrackId === track.scTrackId)) continue;
      artistCount.set(artist, count + 1);
      finalTracks.push(track);
    }

    // Pass 3: Fill remaining from discovery
    if (finalTracks.length < TOTAL) {
      const discoveryTracks = scoredTracks.filter(t => t._isDiscovery && !finalTracks.some(f => f.scTrackId === t.scTrackId));
      for (const track of discoveryTracks) {
        if (finalTracks.length >= TOTAL) break;
        const artist = (track.artist || "").toLowerCase().trim();
        const count = artistCount.get(artist) || 0;
        if (count >= 2) continue;
        artistCount.set(artist, count + 1);
        finalTracks.push(track);
      }
    }

    // Pass 4: Fill any remaining with random picks
    if (finalTracks.length < TOTAL) {
      const finalIds = new Set(finalTracks.map(t => t.scTrackId));
      const remaining = scoredTracks.filter(t => !finalIds.has(t.scTrackId)).sort(() => Math.random() - 0.5);
      for (const track of remaining) {
        if (finalTracks.length >= TOTAL) break;
        finalTracks.push(track);
      }
    }

    const responseData = {
      tracks: finalTracks.map(t => ({
        id: t.id, title: t.title, artist: t.artist, album: t.album,
        cover: t.cover, duration: t.duration, genre: t.genre,
        audioUrl: t.audioUrl, previewUrl: t.previewUrl, source: t.source,
        scTrackId: t.scTrackId, scStreamPolicy: t.scStreamPolicy, scIsFull: t.scIsFull,
        _score: Math.round(t._score),
      })),
      _meta: { timeContext, familiarCount: finalTracks.filter(t => !t._isExploration).length, explorationCount: finalTracks.filter(t => t._isExploration).length },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
