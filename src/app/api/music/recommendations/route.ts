import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Smart Recommendations API v2 — significantly improved relevance scoring.
 *
 * Algorithm overview (Spotify/Яндекс.Музыка inspired):
 * 1. Generate intelligent search queries from taste profile (genres + artists + modifiers)
 * 2. Fetch results from multiple queries in parallel (cross-query signal)
 * 3. Score each track by multi-factor relevance:
 *    - Cross-query frequency: appearing in multiple searches = strong relevance signal (+100/query)
 *    - Genre match: exact match with user's top genres (+35), partial (+15), related (+10)
 *    - Artist match: exact artist match (+50), partial/contains (+20)
 *    - Quality signals: full track (+40), has artwork (+20), good duration (+15)
 *    - Discovery boost: slight bonus for tracks from adjacent genres (+8)
 *    - Random variance: controlled noise to keep recommendations fresh (-10 to +15)
 * 4. Diversity injection: max 2 tracks per artist in final list
 * 5. Discovery picks: 2-3 tracks from genres adjacent to user's top genres
 * 6. Filter: disliked IDs/artists/genres, short tracks, no-artwork tracks
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
  "disco": ["funk", "house", "dance pop", "soul"],
  "acoustic": ["folk", "indie", "singer-songwriter", "bossa nova"],
  "k-pop": ["pop", "electropop", "dance pop", "k-r&b"],
};

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

function scoreTrack(
  track: SCTrack,
  queryCount: number,
  topGenres: string[],
  topArtists: string[],
  relatedGenres: string[]
): number {
  let score = 0;

  // ── Cross-query frequency (strongest signal) ──
  // Track appearing in multiple independent searches = high relevance
  score += queryCount * 100;

  // ── Genre matching ──
  const trackGenre = normalizeGenre(track.genre || "");
  if (trackGenre) {
    for (const g of topGenres) {
      const normalized = normalizeGenre(g);
      if (trackGenre === normalized) {
        score += 35; // Exact genre match
      } else if (trackGenre.includes(normalized) || normalized.includes(trackGenre)) {
        score += 15; // Partial genre match
      }
    }

    // Related genre bonus — user's adjacent genres
    for (const rg of relatedGenres) {
      const rgNorm = normalizeGenre(rg);
      if (trackGenre === rgNorm) {
        score += 10;
        break;
      }
    }
  }

  // ── Artist matching ──
  const trackArtist = (track.artist || "").toLowerCase().trim();
  if (trackArtist) {
    for (const a of topArtists) {
      const aLower = a.toLowerCase().trim();
      if (trackArtist === aLower) {
        score += 50; // Exact artist match
      } else if (trackArtist.includes(aLower) || aLower.includes(trackArtist)) {
        score += 20; // Partial artist match
      }
    }
  }

  // ── Quality signals ──
  if (track.scIsFull) {
    score += 40; // Full track dramatically preferred
  }
  if (track.cover) {
    score += 20; // Has artwork = real release
  }

  // Duration quality
  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 360) {
    score += 15; // Standard song length
    if (dur >= 180 && dur <= 240) score += 5; // Optimal ~3-4 min
  } else if (dur >= 60 && dur < 120) {
    score += 5; // Acceptable short
  }

  // ── Controlled randomness for freshness ──
  score += Math.random() * 25 - 10; // -10 to +15

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

      // Discovery: related genres
      const allRelated = new Set<string>();
      for (const g of genres.slice(0, 3)) {
        for (const rg of getRelatedGenres(g)) {
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
      const fallbacks = [
        "new music", "trending", "popular", "chill", "lofi",
        "electronic", "indie", "hip hop", "rock", "jazz",
        "ambient", "deep house", "synthwave", "r&b soul",
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
        if (!track.cover) continue;
        if (track.duration && track.duration < 30) continue;
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
      const baseScore = scoreTrack(track, queryCount, genres, artists, relatedArr);
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
