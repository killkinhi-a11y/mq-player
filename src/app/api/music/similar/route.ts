import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Similar Tracks API — finds tracks similar to a given track.
 * Algorithm inspired by Spotify/Яндекс.Музыка "Fans Also Like" feature:
 *
 * 1. Extract features from the seed track (artist, genre, title keywords)
 * 2. Generate weighted search queries based on these features:
 *    - Primary: same artist (highest weight)
 *    - Secondary: same genre (high weight)
 *    - Tertiary: related genres (medium weight)
 *    - Exploratory: genre + year/quality keywords (medium-low weight)
 * 3. Score results by multi-factor relevance:
 *    - Artist match: +40 points
 *    - Genre match: +25 points
 *    - Related genre: +10 points
 *    - Duration similarity: +5 points
 *    - Has artwork: +3 points
 *    - Full track availability: +5 points
 * 4. Filter out: the seed track, disliked IDs/artists/genres, short tracks
 * 5. Return top N sorted by score
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// Genre similarity map — how genres relate to each other
const genreRelations: Record<string, string[]> = {
  "hip-hop": ["rap", "trap", "r&b", "soul", "funk"],
  "rap": ["hip-hop", "trap", "r&b"],
  "trap": ["hip-hop", "rap", "drill", "electronic"],
  "r&b": ["soul", "funk", "hip-hop", "pop"],
  "soul": ["r&b", "funk", "jazz", "gospel"],
  "funk": ["soul", "r&b", "disco", "jazz"],
  "rock": ["alternative", "indie", "metal", "punk", "classic rock"],
  "alternative": ["rock", "indie", "grunge", "post-punk"],
  "indie": ["alternative", "rock", "lo-fi", "dream pop"],
  "metal": ["rock", "hard rock", "punk", "alternative"],
  "electronic": ["house", "techno", "edm", "synthwave", "ambient", "trance"],
  "house": ["electronic", "deep house", "tech house", "disco"],
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
  "deep house": ["house", "electronic", "tech house", "soulful house"],
  "bossa nova": ["jazz", "latin", "acoustic", "samba"],
};

// Get related genres for a given genre
function getRelatedGenres(genre: string): string[] {
  const lower = genre.toLowerCase().trim();
  const related = new Set<string>();

  const direct = genreRelations[lower];
  if (direct) {
    for (const g of direct) related.add(g);
  }

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

// ── Noise content keywords ──
// Tracks whose titles/artists contain these keywords are considered noise content
// when they don't match the user's (seed track's) genre context.
const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

// Religious genre keywords — used to check if context actually involves religious content
const RELIGIOUS_GENRE_KEYWORDS = [
  "gospel", "christian", "worship", "religious", "spiritual",
  "church", "hymn", "ccm", "contemporary christian",
];

function isReligiousContext(genre: string): boolean {
  const lower = genre.toLowerCase();
  return RELIGIOUS_GENRE_KEYWORDS.some(rg => lower.includes(rg) || rg.includes(lower));
}

// ── Hashtag genre extraction ──
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

function titleHashtagGenreMismatch(title: string, contextGenre: string): boolean {
  const hashtagGenres = extractTitleHashtagGenres(title);
  if (hashtagGenres.length === 0) return false;
  const contextLower = contextGenre.toLowerCase().trim();
  for (const hg of hashtagGenres) {
    const hgNorm = hg.replace(/\s+/g, " ").trim();
    const matches = contextLower.includes(hgNorm) || hgNorm.includes(contextLower);
    if (!matches) return true;
  }
  return false;
}

// Extract meaningful keywords from a title (remove common noise words)
const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "being", "with", "by", "from",
  " remix", " mix", " edit", " version", " original", " official", " audio",
  "video", "lyric", "lyrics", "ft", "feat", "vs", "vol", "part", "ep",
]);

function extractKeywords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[()[\]{}.,:;!?'"`~\-–—/\\]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

// Calculate similarity score between two tracks
function calculateSimilarity(
  seed: { artist: string; genre: string; duration: number; title: string },
  candidate: { artist: string; genre: string; duration: number; cover: string; scIsFull?: boolean; title: string }
): number {
  let score = 0;

  const seedArtist = seed.artist.toLowerCase().trim();
  const seedGenre = normalizeGenre(seed.genre);
  const candidateGenre = normalizeGenre(candidate.genre);
  const candidateArtist = candidate.artist.toLowerCase().trim();

  // ── Noise content penalty ──
  // If track title/artist has religious keywords but seed context is NOT religious → penalize
  const candidateTitleArtist = `${candidate.title} ${candidate.artist}`.toLowerCase();
  if (hasNoiseKeywords(candidateTitleArtist) && !isReligiousContext(seed.genre)) {
    score -= 100; // Strong penalty for irrelevant religious content in non-religious context
  }

  // Artist match — highest weight
  if (seedArtist === candidateArtist) {
    score += 40;
  } else if (seedArtist.includes(candidateArtist) || candidateArtist.includes(seedArtist)) {
    score += 20;
  }

  // Exact genre match
  if (seedGenre && candidateGenre && seedGenre === candidateGenre) {
    score += 25;
  } else if (seedGenre && candidateGenre) {
    if (seedGenre.includes(candidateGenre) || candidateGenre.includes(seedGenre)) {
      score += 15;
    }
  }

  // Related genre bonus
  if (seedGenre && candidateGenre) {
    const related = getRelatedGenres(seedGenre);
    for (const rg of related) {
      if (candidateGenre.includes(rg) || rg.includes(candidateGenre)) {
        score += 10;
        break;
      }
    }
  }

  // Title keyword matching — shared meaningful words indicate similar content
  const seedKeywords = extractKeywords(seed.title);
  const candidateKeywords = extractKeywords(candidate.title);
  let keywordOverlap = 0;
  for (const kw of seedKeywords) {
    if (candidateKeywords.has(kw)) keywordOverlap++;
  }
  // Award up to 12 points for keyword overlap (capped)
  if (keywordOverlap > 0) {
    score += Math.min(12, keywordOverlap * 4);
  }

  // Duration similarity
  if (seed.duration > 0 && candidate.duration > 0) {
    const ratio = Math.min(candidate.duration, seed.duration) / Math.max(candidate.duration, seed.duration);
    if (ratio > 0.7) {
      score += 5;
    }
  }

  // Quality bonuses
  if (candidate.cover) score += 3;
  if (candidate.scIsFull) score += 5;

  return score;
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackTitle = searchParams.get("title") || "";
  const trackArtist = searchParams.get("artist") || "";
  const trackGenre = searchParams.get("genre") || "";
  const trackDuration = parseFloat(searchParams.get("duration") || "0");
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20") || 20), 100);
  const excludeId = searchParams.get("excludeId") || "";
  const dislikedIdsParam = searchParams.get("dislikedIds") || "";
  const dislikedArtistsParam = searchParams.get("dislikedArtists") || "";
  const dislikedGenresParam = searchParams.get("dislikedGenres") || "";

  if (!trackTitle && !trackArtist) {
    return NextResponse.json({ error: "title or artist required" }, { status: 400 });
  }

  const excludeIds = new Set(
    [excludeId, ...dislikedIdsParam.split(",").filter(Boolean)]
  );
  const dislikedArtists = new Set(
    dislikedArtistsParam.split(",").filter(Boolean).map(a => a.toLowerCase())
  );
  const dislikedGenres = new Set(
    dislikedGenresParam.split(",").filter(Boolean).map(g => normalizeGenre(g))
  );

  const cacheKey = `similar:${trackArtist}:${trackTitle}:${trackGenre}:${limit}:${dislikedIdsParam}:${dislikedArtistsParam}:${dislikedGenresParam}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const queries: { query: string; weight: number; type: string }[] = [];

    // 1. Same artist searches (highest priority)
    if (trackArtist) {
      queries.push({ query: trackArtist, weight: 3, type: "artist" });
      queries.push({ query: `${trackArtist} ${new Date().getFullYear()}`, weight: 2, type: "artist_new" });
    }

    // 2. Genre-based searches
    if (trackGenre) {
      queries.push({ query: trackGenre, weight: 2.5, type: "genre" });
      queries.push({ query: `best ${trackGenre}`, weight: 1.5, type: "genre_top" });
      queries.push({ query: `${trackGenre} ${new Date().getFullYear()}`, weight: 1.5, type: "genre_new" });
    }

    // 3. Related genre searches
    if (trackGenre) {
      const related = getRelatedGenres(trackGenre);
      for (const rg of related.slice(0, 3)) {
        queries.push({ query: rg, weight: 1, type: "related_genre" });
      }
    }

    // 4. Cross-genre exploratory
    if (trackArtist && trackGenre) {
      const otherGenres = ["chill", "remix", "acoustic", "live", "cover"];
      for (const og of otherGenres.slice(0, 2)) {
        queries.push({ query: `${trackArtist} ${og}`, weight: 0.8, type: "exploratory" });
      }
    }

    const seenQueries = new Set<string>();
    const uniqueQueries = queries.filter(q => {
      const key = q.query.toLowerCase();
      if (seenQueries.has(key)) return false;
      seenQueries.add(key);
      return true;
    });

    const results = await Promise.allSettled(
      uniqueQueries.map(q => searchSCTracks(q.query, 15))
    );

    const scoredTracks: {
      id: string;
      scTrackId: number;
      title: string;
      artist: string;
      album: string;
      cover: string;
      duration: number;
      genre: string;
      audioUrl: string;
      previewUrl: string;
      scStreamPolicy: string;
      scIsFull: boolean;
      source: "soundcloud";
      similarityScore: number;
    }[] = [];

    const seenTrackIds = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;

      const queryWeight = uniqueQueries[i].weight;

      for (const track of result.value) {
        if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) continue;
        if (seenTrackIds.has(track.scTrackId)) continue;

        if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
        if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) continue;

        if (!track.cover) continue;
        if (track.duration && track.duration < 30) continue;
        // Hard filter: skip noise content (e.g. Bible Deep House) unless context is religious
        const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
        if (hasNoiseKeywords(titleArtistNoise) && !isReligiousContext(trackGenre)) continue;
        // Hard filter: skip tracks with hashtag genres that don't match seed track genre
        if (titleHashtagGenreMismatch(track.title || "", trackGenre)) continue;

        seenTrackIds.add(track.scTrackId);

        const seedInfo = { artist: trackArtist, genre: trackGenre, duration: trackDuration, title: trackTitle };
        const candidateInfo = {
          artist: track.artist,
          genre: track.genre,
          duration: track.duration || 0,
          cover: track.cover,
          scIsFull: track.scIsFull || false,
          title: track.title,
        };
        const simScore = calculateSimilarity(seedInfo, candidateInfo);
        const finalScore = simScore * queryWeight;

        scoredTracks.push({
          ...track,
          similarityScore: finalScore,
        });
      }
    }

    scoredTracks.sort((a, b) => b.similarityScore - a.similarityScore);

    // ── Diversity injection ──
    // Max 2 tracks per artist in final result
    const topTracks: typeof scoredTracks = [];
    const artistCount = new Map<string, number>();
    for (const track of scoredTracks) {
      if (topTracks.length >= limit) break;
      const artist = (track.artist || "").toLowerCase().trim();
      const count = artistCount.get(artist) || 0;
      if (count >= 2) continue;
      artistCount.set(artist, count + 1);
      topTracks.push(track);
    }

    const resultTracks = topTracks.map(t => ({
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
      _similarityScore: Math.round(t.similarityScore),
    }));

    const responseData = { tracks: resultTracks };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Similar tracks error:", error);
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
