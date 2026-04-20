import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Smart Recommendations API v4 — aggressive noise filtering + discovery gating.
 *
 * Algorithm overview (Spotify/Яндекс.Музыка inspired):
 * 1. Generate intelligent search queries from taste profile (genres + artists + modifiers)
 * 2. SPAM-PRONE GENRES FILTER: genres like "deep house" that SoundCloud returns
 *    mostly spam/low-quality results for are excluded from discovery queries
 *    UNLESS the user explicitly has them in their top genres
 * 3. Fetch results from multiple queries in parallel (cross-query signal)
 * 4. Score each track by multi-factor relevance:
 *    - Cross-query frequency: +60/query (reduced to prevent discovery noise)
 *    - Genre match: exact (+50), partial (+25), related (+15)
 *    - Artist match: exact (+50), partial (+20)
 *    - Quality signals: full track (+40), has artwork (+20), good duration (+15)
 *    - NOISE PENALTY: religious keywords (-150) if not matching user taste
 *    - HASHTAG GENRE PENALTY: genre hashtags in title (#DeepHouse) that don't
 *      match user taste profile get -60 penalty
 *    - Discovery gate: discovery tracks with no genre match get -80 penalty
 * 5. Hard filter: noise content, tracks with mismatched hashtag genres
 * 6. Diversity injection: max 2 tracks per artist in final list
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

// ── Genre relationship graph ──
// Used to find "adjacent" genres for discovery component
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

// ── Spam-prone genres ──
// These genres return mostly low-quality/spammy results on SoundCloud.
// They are EXCLUDED from discovery queries unless the user explicitly has them
// in their top genres. E.g. searching "deep house" on SC returns tons of
// "Bible Deep House" and other irrelevant content.
const SPAM_PRONE_GENRES = [
  "deep house", "soulful house",
];

function isSpamProneGenre(genre: string): boolean {
  const lower = genre.toLowerCase().trim();
  return SPAM_PRONE_GENRES.some(sp =>
    lower === sp || lower.includes(sp) || sp.includes(lower)
  );
}

function getRelatedGenres(genre: string): string[] {
  const lower = genre.toLowerCase().trim();
  const related = new Set<string>();

  const direct = genreRelations[lower];
  if (direct) {
    for (const g of direct) related.add(g);
  }
  // Also check reverse mappings
  for (const [key, values] of Object.entries(genreRelations)) {
    if (values.includes(lower) || values.some(v => v.includes(lower) || lower.includes(v))) {
      related.add(key);
    }
  }
  return [...related];
}

// Normalize genre for matching
function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ")
    .replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb")
    .replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass")
    .replace(/d 'n' b/gi, "drum and bass");
}

interface ScoredTrack extends SCTrack {
  _score: number;
  _queryCount: number;
  _isDiscovery: boolean;
}

// ── Noise content keywords ──
// Tracks whose titles/artists contain these keywords but don't match user's
// taste profile are considered noise content (e.g. "Bible Deep House" appearing
// in generic electronic recommendations).
const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

// Religious genre keywords — used to check if user actually wants this content
const RELIGIOUS_GENRE_KEYWORDS = [
  "gospel", "christian", "worship", "religious", "spiritual",
  "church", "hymn", "ccm", "contemporary christian",
];

function userWantsReligiousContent(topGenres: string[]): boolean {
  return topGenres.some(g => {
    const lower = g.toLowerCase();
    return RELIGIOUS_GENRE_KEYWORDS.some(rg => lower.includes(rg) || rg.includes(lower));
  });
}

// ── Hashtag genre extraction ──
// Detect genre hashtags in track titles (e.g. "#DeepHouse", "#TechHouse")
// Many SoundCloud tracks spam genre hashtags in titles.
// If the hashtagged genre doesn't match user's taste, penalize the track.
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
    if (KNOWN_GENRE_HASHTAGS.includes(tag)) {
      hashtags.push(tag);
    }
  }
  return hashtags;
}

function titleHashtagGenreMismatch(title: string, topGenres: string[]): boolean {
  const hashtagGenres = extractTitleHashtagGenres(title);
  if (hashtagGenres.length === 0) return false;
  const topLower = topGenres.map(g => normalizeGenre(g));
  // Check if ANY hashtag genre matches user's taste
  for (const hg of hashtagGenres) {
    const hgNorm = normalizeGenre(hg);
    const matches = topLower.some(tg =>
      tg === hgNorm || tg.includes(hgNorm) || hgNorm.includes(tg)
    );
    if (!matches) return true; // Mismatch found
  }
  return false;
}

function scoreTrack(
  track: SCTrack,
  queryCount: number,
  topGenres: string[],
  topArtists: string[],
  relatedGenres: string[],
  isDiscovery: boolean
): number {
  let score = 0;

  // ── Noise content penalty ──
  const titleAndArtist = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  const trackHasNoise = hasNoiseKeywords(titleAndArtist);
  const wantsReligious = userWantsReligiousContent(topGenres);
  if (trackHasNoise && !wantsReligious) {
    score -= 150;
  }

  // ── Hashtag genre mismatch penalty ──
  // If track title has genre hashtags (#DeepHouse, #TechHouse) that don't
  // match user's taste profile → penalize (likely spam/irrelevant content)
  if (titleHashtagGenreMismatch(track.title || "", topGenres)) {
    score -= 60;
  }

  // ── Cross-query frequency (strong signal, but not overpowering) ──
  score += queryCount * 60;

  // ── Genre matching (strengthened) ──
  let hasGenreMatch = false;
  const trackGenre = normalizeGenre(track.genre || "");
  if (trackGenre) {
    for (const g of topGenres) {
      const normalized = normalizeGenre(g);
      if (trackGenre === normalized) {
        score += 50;
        hasGenreMatch = true;
      } else if (trackGenre.includes(normalized) || normalized.includes(trackGenre)) {
        score += 25;
        hasGenreMatch = true;
      }
    }

    for (const rg of relatedGenres) {
      const rgNorm = normalizeGenre(rg);
      if (trackGenre === rgNorm) {
        score += 15;
        hasGenreMatch = true;
        break;
      }
    }
  }

  // ── Discovery relevance gate ──
  if (isDiscovery && !hasGenreMatch) {
    score -= 80;
  }

  // ── Artist matching ──
  const trackArtist = (track.artist || "").toLowerCase().trim();
  if (trackArtist) {
    for (const a of topArtists) {
      const aLower = a.toLowerCase().trim();
      if (trackArtist === aLower) {
        score += 50;
      } else if (trackArtist.includes(aLower) || aLower.includes(trackArtist)) {
        score += 20;
      }
    }
  }

  // ── Quality signals ──
  if (track.scIsFull) {
    score += 40;
  }
  if (track.cover) {
    score += 20;
  }

  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 360) {
    score += 15;
    if (dur >= 180 && dur <= 240) score += 5;
  } else if (dur >= 60 && dur < 120) {
    score += 5;
  }

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

  const excludeIds = new Set(
    (excludeParam || "").split(",").filter(Boolean)
  );
  const dislikedIds = new Set(
    (dislikedParam || "").split(",").filter(Boolean)
  );
  const dislikedArtists = new Set(
    (dislikedArtistsParam || "").split(",").filter(Boolean).map(a => a.toLowerCase())
  );
  const dislikedGenres = new Set(
    (dislikedGenresParam || "").split(",").filter(Boolean).map(g => normalizeGenre(g))
  );

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 3) : [];

  const cacheKey = `rec:smart-v2:${genre}:${genresParam || ""}:${artistsParam || ""}:${dislikedParam || ""}:${dislikedArtistsParam || ""}:${dislikedGenresParam || ""}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const queries: { query: string; type: string; weight: number }[] = [];
    const discoveryQueries: string[] = [];
    const currentYear = new Date().getFullYear();

    if (genres.length > 0 || artists.length > 0) {
      // ── Taste-based query generation ──

      // Primary: top genres (high weight)
      for (const g of genres.slice(0, 5)) {
        queries.push({ query: g, type: "genre", weight: 2.0 });
        queries.push({ query: `${g} ${currentYear}`, type: "genre_new", weight: 1.5 });
        queries.push({ query: `best ${g}`, type: "genre_top", weight: 1.2 });
      }

      // Secondary: top artists (medium-high weight)
      for (const a of artists.slice(0, 3)) {
        queries.push({ query: a, type: "artist", weight: 2.5 });
        queries.push({ query: `${a} ${currentYear}`, type: "artist_new", weight: 1.8 });
      }

      // Discovery: related genres (FILTERED)
      // Exclude spam-prone genres unless user explicitly likes them
      const normalizedTopGenres = new Set(genres.map(g => normalizeGenre(g)));
      const allRelated = new Set<string>();
      for (const g of genres.slice(0, 3)) {
        for (const rg of getRelatedGenres(g)) {
          // Skip spam-prone genres unless user explicitly has them in top genres
          if (isSpamProneGenre(rg)) {
            const rgNorm = normalizeGenre(rg);
            const userWants = normalizedTopGenres.has(rgNorm) ||
              [...normalizedTopGenres].some(tg => tg.includes(rgNorm) || rgNorm.includes(tg));
            if (!userWants) continue;
          }
          allRelated.add(rg);
        }
      }
      const relatedArr = [...allRelated].slice(0, 4);
      for (const rg of relatedArr) {
        queries.push({ query: rg, type: "related_genre", weight: 0.8 });
      }

      // Mix searches for variety
      if (genres.length >= 2) {
        queries.push({
          query: `${genres[0]} ${genres[1]} mix`,
          type: "genre_mix",
          weight: 1.0,
        });
      }

      // Discovery component: search for adjacent genres separately
      for (const rg of relatedArr.slice(0, 2)) {
        discoveryQueries.push(`best ${rg}`);
        discoveryQueries.push(`${rg} new`);
      }
    } else if (genre !== "random") {
      queries.push({ query: genre, type: "genre", weight: 2.0 });
      queries.push({ query: `${genre} ${currentYear}`, type: "genre_new", weight: 1.5 });
      queries.push({ query: `top ${genre}`, type: "genre_top", weight: 1.2 });
    } else {
      // Fallback: diverse popular searches
      // Note: "deep house" removed — SoundCloud returns low-quality religious
      // "Bible Deep House" content for this generic query.
      // "melodic house" and "tech house" are better alternatives.
      const fallbacks = [
        "new music", "trending", "popular", "chill", "lofi",
        "electronic", "indie", "hip hop", "rock", "jazz",
        "ambient", "melodic house", "synthwave", "r&b soul",
        "drum and bass", "techno", "acoustic", "piano",
        "afrobeats", "k-pop", "reggaeton", "bossa nova"
      ];
      const shuffled = fallbacks.sort(() => Math.random() - 0.5);
      for (const f of shuffled.slice(0, 4)) {
        queries.push({ query: f, type: "fallback", weight: 1.0 });
      }
    }

    // Deduplicate queries (case-insensitive)
    const seenQ = new Set<string>();
    const uniqueQueries = queries.filter(q => {
      const key = q.query.toLowerCase();
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    }).slice(0, 6); // Max 6 main queries

    // Deduplicate discovery queries
    const uniqueDiscovery = [...new Set(discoveryQueries.map(q => q.toLowerCase()))]
      .map(q => ({ query: q, type: "discovery", weight: 0.5 }))
      .slice(0, 2);

    // Fetch all queries in parallel
    const allQueries = [...uniqueQueries, ...uniqueDiscovery];
    const results = await Promise.allSettled(
      allQueries.map(q => searchSCTracks(q.query, 15))
    );

    // Compute related genres set for scoring
    const relatedGenresForScoring = new Set<string>();
    for (const g of genres.slice(0, 3)) {
      for (const rg of getRelatedGenres(g)) {
        relatedGenresForScoring.add(rg);
      }
    }
    const relatedArr = [...relatedGenresForScoring];

    // Aggregate and score tracks
    const trackMap = new Map<number, {
      track: SCTrack;
      queryCount: number;
      queryWeightSum: number;
      isDiscovery: boolean;
    }>();
    const seenIds = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;

      const queryMeta = allQueries[i];
      const isDiscovery = queryMeta.type === "discovery" || queryMeta.type === "related_genre";

      for (const track of result.value) {
        // ── Hard filters ──
        if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) continue;
        if (dislikedIds.has(track.id)) continue;
        if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
        if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) continue;
        // Hard filter: skip deep house tracks unless user explicitly listens to deep house
        if (!userWantsReligiousContent(genres)) {
          const genreLower = (track.genre || "").toLowerCase();
          const titleLower = (track.title || "").toLowerCase();
          const normalizedTopGenres = genres.map(g => normalizeGenre(g));
          const userWantsDeepHouse = normalizedTopGenres.some(tg =>
            tg === "deep house" || tg.includes("deep house")
          );
          if (!userWantsDeepHouse && (genreLower.includes("deep house") || titleLower.includes("deep house"))) continue;
        }
        if (!track.cover) continue;
        if (track.duration && track.duration < 30) continue;
        // Hard filter: skip noise content (e.g. Bible Deep House) unless user wants it
        const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
        if (hasNoiseKeywords(titleArtistNoise) && !userWantsReligiousContent(genres)) continue;
        // Hard filter: skip tracks with hashtag genres that don't match user taste
        // (e.g. "One Life #DeepHouse #club house" when user doesn't like deep house)
        if (titleHashtagGenreMismatch(track.title || "", genres)) continue;
        if (seenIds.has(track.scTrackId)) continue;

        seenIds.add(track.scTrackId);

        const existing = trackMap.get(track.scTrackId);
        if (existing) {
          existing.queryCount++;
          existing.queryWeightSum += queryMeta.weight;
        } else {
          trackMap.set(track.scTrackId, {
            track,
            queryCount: 1,
            queryWeightSum: queryMeta.weight,
            isDiscovery,
          });
        }
      }
    }

    // Score all collected tracks
    const scoredTracks: ScoredTrack[] = [];
    for (const { track, queryCount, isDiscovery } of trackMap.values()) {
      const baseScore = scoreTrack(track, queryCount, genres, artists, relatedArr, isDiscovery);
      scoredTracks.push({
        ...track,
        _score: baseScore,
        _queryCount: queryCount,
        _isDiscovery: isDiscovery,
      });
    }

    // Sort by score descending
    scoredTracks.sort((a, b) => b._score - a._score);

    // ── Diversity injection (Spotify-style) ──
    // Ensure no more than 2 tracks per artist in final list
    const finalTracks: ScoredTrack[] = [];
    const artistCount = new Map<string, number>();

    // First pass: take top scored tracks with artist limit
    for (const track of scoredTracks) {
      if (finalTracks.length >= 15) break;
      const artist = (track.artist || "").toLowerCase().trim();
      const count = artistCount.get(artist) || 0;
      if (count >= 2) continue; // Max 2 per artist
      artistCount.set(artist, count + 1);
      finalTracks.push(track);
    }

    // Second pass: fill with discovery picks if needed
    if (finalTracks.length < 15) {
      const discoveryTracks = scoredTracks.filter(t => t._isDiscovery);
      for (const track of discoveryTracks) {
        if (finalTracks.length >= 15) break;
        const artist = (track.artist || "").toLowerCase().trim();
        const count = artistCount.get(artist) || 0;
        if (count >= 2) continue;
        if (finalTracks.some(f => f.scTrackId === track.scTrackId)) continue;
        artistCount.set(artist, count + 1);
        finalTracks.push(track);
      }
    }

    // Third pass: fill remaining slots with random picks from remaining
    if (finalTracks.length < 15) {
      const finalIds = new Set(finalTracks.map(t => t.scTrackId));
      const remaining = scoredTracks.filter(t => !finalIds.has(t.scTrackId));
      const shuffled = [...remaining].sort(() => Math.random() - 0.5);
      for (const track of shuffled) {
        if (finalTracks.length >= 15) break;
        finalTracks.push(track);
      }
    }

    const responseData = {
      tracks: finalTracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        cover: t.cover,
        duration: t.duration,
        genre: t.genre,
        audioUrl: t.audioUrl,
        previewUrl: t.previewUrl,
        source: t.source,
        scTrackId: t.scTrackId,
        scStreamPolicy: t.scStreamPolicy,
        scIsFull: t.scIsFull,
        _score: Math.round(t._score),
      })),
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
