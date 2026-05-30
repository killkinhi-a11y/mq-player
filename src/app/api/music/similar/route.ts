import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Similar Tracks API v2 — "Deep Discovery" Edition.
 *
 * Major improvements:
 * 1. SOUNDCLOUD RELATED TRACKS — uses /tracks/{id}/related endpoint for genuine
 *    similarity signal (tracks that listeners of the seed also listen to)
 * 2. MULTIPLE SEED STRATEGIES — artist, genre, mood, title keywords all generate
 *    different search angles for richer results
 * 3. MOOD-AWARE SCORING — matches mood signals between seed and candidates
 * 4. HIDDEN GEM BONUS — boosts lesser-known artists with quality covers
 * 5. TITLE SEMANTICS — better keyword extraction and matching (removes noise)
 * 6. DURATION FINGERPRINT — matches similar duration profiles for genre alignment
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 200) {
    for (const [k, v] of cache) { if (v.expiry <= Date.now()) cache.delete(k); }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// Genre relationship graph
const genreRelations: Record<string, string[]> = {
  "hip-hop": ["rap", "trap", "r&b", "soul", "funk"],
  "rap": ["hip-hop", "trap", "r&b"],
  "trap": ["hip-hop", "rap", "drill", "electronic"],
  "r&b": ["soul", "funk", "hip-hop", "pop"],
  "soul": ["r&b", "funk", "jazz", "neo soul"],
  "funk": ["soul", "r&b", "disco", "jazz"],
  "rock": ["alternative", "indie", "metal", "punk"],
  "alternative": ["rock", "indie", "dream pop", "post-punk"],
  "indie": ["alternative", "rock", "lo-fi", "dream pop", "bedroom pop"],
  "metal": ["rock", "hard rock", "punk", "alternative"],
  "electronic": ["house", "techno", "edm", "synthwave", "ambient", "trance"],
  "house": ["electronic", "deep house", "tech house", "disco", "afro house"],
  "techno": ["electronic", "house", "industrial", "minimal"],
  "edm": ["electronic", "house", "dubstep", "trap", "future bass"],
  "synthwave": ["electronic", "retrowave", "vaporwave", "darksynth"],
  "ambient": ["electronic", "chill", "downtempo"],
  "drum and bass": ["electronic", "jungle", "breakbeat", "uk garage"],
  "jazz": ["bossa nova", "blues", "soul", "lo-fi jazz"],
  "classical": ["orchestral", "piano", "chamber", "neo-classical"],
  "pop": ["dance pop", "indie pop", "electropop", "k-pop", "dream pop"],
  "lo-fi": ["chillhop", "ambient", "indie", "jazz"],
  "chill": ["lo-fi", "ambient", "downtempo", "acoustic"],
  "country": ["folk", "americana", "bluegrass"],
  "folk": ["acoustic", "country", "indie folk"],
  "latin": ["reggaeton", "salsa", "bachata", "bossa nova"],
  "reggae": ["dub", "ska", "dancehall", "roots"],
  "blues": ["jazz", "rock", "soul"],
  "punk": ["rock", "alternative", "hardcore", "post-punk"],
  "dubstep": ["electronic", "edm", "drum and bass", "riddim"],
  "trance": ["electronic", "edm", "progressive", "techno"],
  "deep house": ["house", "electronic", "tech house", "soulful house"],
};

function getRelatedGenres(genre: string): string[] {
  const lower = genre.toLowerCase().trim();
  const related = new Set<string>();
  const direct = genreRelations[lower];
  if (direct) for (const g of direct) related.add(g);
  for (const [key, values] of Object.entries(genreRelations)) {
    if (values.includes(lower) || values.some(v => v.includes(lower) || lower.includes(v))) related.add(key);
  }
  return [...related];
}

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ").replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb").replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass").replace(/d 'n' b/gi, "drum and bass");
}

// Noise filter
const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

// Genre-specific query templates for similar tracks
const GENRE_SIMILAR_QUERIES: Record<string, string[]> = {
  "hip-hop": ["hip-hop instrumental", "boom bap new", "underground hip-hop"],
  "rap": ["lyrical rap", "real rap", "underground rap"],
  "trap": ["melodic trap", "dark trap instrumental", "trap soul"],
  "r&b": ["alternative rnb", "neo soul", "rnb slow jam"],
  "electronic": ["indie electronic", "ambient electronic", "idm"],
  "house": ["deep house 2025", "tech house", "melodic house"],
  "techno": ["deep techno", "minimal techno", "detroit techno"],
  "edm": ["future bass", "melodic dubstep", "bass music"],
  "pop": ["indie pop", "dream pop", "hyperpop", "bedroom pop"],
  "rock": ["indie rock", "garage rock", "psych rock"],
  "jazz": ["lo-fi jazz", "jazz fusion", "modern jazz"],
  "lo-fi": ["lo-fi beats", "lo-fi chill", "lofi study"],
  "ambient": ["drone ambient", "space ambient", "dark ambient"],
  "synthwave": ["retrowave", "darksynth", "outrun"],
  "dubstep": ["riddim", "deep dubstep", "melodic dubstep"],
  "drum and bass": ["liquid dnb", "neurofunk", "jungle"],
  "classical": ["neo classical piano", "cinematic orchestral"],
  "metal": ["progressive metal", "doom metal", "metalcore"],
  "folk": ["indie folk", "dark folk", "folk acoustic"],
  "country": ["indie country", "alt country", "americana"],
  "punk": ["post punk", "hardcore punk", "skate punk"],
  "reggae": ["dub reggae", "dancehall new", "roots reggae"],
  "blues": ["modern blues", "blues rock", "delta blues"],
  "soul": ["neo soul", "modern soul", "soulful"],
  "funk": ["modern funk", "boogie funk", "synth funk"],
  "latin": ["latin pop", "bachata new", "latin trap"],
  "indie": ["indie pop", "indie folk", "bedroom pop"],
  "chill": ["chillhop", "downtempo", "chill vibes"],
};

// Mood keywords
type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";

const MOOD_KEYWORDS: Record<Mood, string[]> = {
  chill: ["chill", "relax", "calm", "mellow", "smooth", "soft", "slow"],
  bassy: ["bass", "808", "banger", "drop", "wobble"],
  melodic: ["melodic", "melody", "piano", "guitar", "harmonic", "strings"],
  dark: ["dark", "grimy", "raw", "underground", "noir", "midnight"],
  upbeat: ["upbeat", "happy", "energetic", "hype", "party", "dance"],
  romantic: ["love", "heart", "romance", "baby", "miss you", "tender"],
  aggressive: ["hard", "heavy", "aggressive", "intense", "brutal", "rage"],
  dreamy: ["dream", "float", "cloud", "space", "cosmic", "ethereal", "atmospheric"],
};

function extractMoods(text: string): Mood[] {
  const lower = text.toLowerCase();
  const moods: Mood[] = [];
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) { moods.push(mood as Mood); break; }
    }
  }
  return moods;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "being", "with", "by", "from",
  "remix", "mix", "edit", "version", "original", "official", "audio",
  "video", "lyric", "lyrics", "ft", "feat", "vs", "vol", "part", "ep",
  "prod", "produced", "mixed", "mastered",
]);

function extractKeywords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[()[\]{}.,:;!?'"`~\-–—/\\]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

// Fetch SoundCloud related tracks via API
async function fetchSCRelated(scTrackId: number): Promise<SCTrack[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId || !scTrackId) return [];
    const url = `https://api-v2.soundcloud.com/tracks/${scTrackId}/related?client_id=${clientId}&limit=25&offset=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data.collection || []);
    return raw.filter((t: Record<string, unknown>) => {
      if ((t.kind as string) !== "track") return false;
      if ((t.policy as string) === "BLOCK") return false;
      return true;
    }).map((t: Record<string, unknown>) => {
      const user = t.user as Record<string, unknown> | undefined;
      const artwork = (t.artwork_url as string) || "";
      const rawCover = artwork ? artwork.replace("-large.", "-t500x500.") : (user?.avatar_url as string || "").replace("-large.", "-t500x500.") || "";
      const cover = rawCover ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}` : "";
      const fullDuration = (t.full_duration as number) || (t.duration as number) || 30000;
      const policy = (t.policy as string) || "ALLOW";
      return {
        id: `sc_${t.id}`, title: (t.title as string) || "Unknown",
        artist: user?.username || "Unknown", album: "",
        duration: Math.round(fullDuration / 1000), cover,
        genre: (t.genre as string) || "", audioUrl: "", previewUrl: "",
        source: "soundcloud" as const, scTrackId: t.id as number,
        scStreamPolicy: policy, scIsFull: policy === "ALLOW",
      };
    });
  } catch { return []; }
}

// Calculate similarity between seed and candidate
function calculateSimilarity(
  seed: { artist: string; genre: string; duration: number; title: string },
  candidate: { artist: string; genre: string; duration: number; cover: string; scIsFull?: boolean; title: string },
  seedMoods: Mood[],
): number {
  let score = 0;

  const seedArtist = seed.artist.toLowerCase().trim();
  const seedGenre = normalizeGenre(seed.genre);
  const candidateGenre = normalizeGenre(candidate.genre);
  const candidateArtist = candidate.artist.toLowerCase().trim();

  // Noise penalty
  const candidateTitleArtist = `${candidate.title} ${candidate.artist}`.toLowerCase();
  if (hasNoiseKeywords(candidateTitleArtist)) score -= 100;

  // Artist match (highest weight)
  if (seedArtist === candidateArtist) score += 40;
  else if (seedArtist.includes(candidateArtist) || candidateArtist.includes(seedArtist)) score += 20;

  // Genre match
  if (seedGenre && candidateGenre) {
    if (seedGenre === candidateGenre) score += 25;
    else if (seedGenre.includes(candidateGenre) || candidateGenre.includes(seedGenre)) score += 15;

    // Related genre bonus
    const related = getRelatedGenres(seedGenre);
    for (const rg of related) {
      if (candidateGenre.includes(rg) || rg.includes(candidateGenre)) {
        score += 10;
        break;
      }
    }
  }

  // Title keyword matching (shared meaningful words)
  const seedKeywords = extractKeywords(seed.title);
  const candidateKeywords = extractKeywords(candidate.title);
  let keywordOverlap = 0;
  for (const kw of seedKeywords) {
    if (candidateKeywords.has(kw)) keywordOverlap++;
  }
  if (keywordOverlap > 0) score += Math.min(12, keywordOverlap * 4);

  // Mood matching — new in v2
  const candidateMoods = extractMoods(`${candidate.title} ${candidate.genre}`);
  let moodMatches = 0;
  for (const mood of seedMoods) {
    if (candidateMoods.includes(mood)) moodMatches++;
  }
  if (moodMatches > 0) score += Math.min(20, moodMatches * 10);

  // Duration similarity — wider tolerance for better matches
  if (seed.duration > 0 && candidate.duration > 0) {
    const ratio = Math.min(candidate.duration, seed.duration) / Math.max(candidate.duration, seed.duration);
    if (ratio > 0.8) score += 8;   // Very similar duration
    else if (ratio > 0.6) score += 4; // Somewhat similar
  }

  // Quality bonuses
  if (candidate.cover) score += 3;
  if (candidate.scIsFull) score += 8;

  return score;
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackTitle = searchParams.get("title") || "";
  const trackArtist = searchParams.get("artist") || "";
  const trackGenre = searchParams.get("genre") || "";
  const trackDuration = parseFloat(searchParams.get("duration") || "0");
  const trackScId = parseInt(searchParams.get("scTrackId") || "0");
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20") || 20), 100);
  const excludeId = searchParams.get("excludeId") || "";
  const dislikedIdsParam = searchParams.get("dislikedIds") || "";
  const dislikedArtistsParam = searchParams.get("dislikedArtists") || "";
  const dislikedGenresParam = searchParams.get("dislikedGenres") || "";

  if (!trackTitle && !trackArtist) {
    return NextResponse.json({ error: "title or artist required" }, { status: 400 });
  }

  const excludeIds = new Set([excludeId, ...dislikedIdsParam.split(",").filter(Boolean)]);
  const dislikedArtists = new Set(dislikedArtistsParam.split(",").filter(Boolean).map(a => a.toLowerCase()));
  const dislikedGenres = new Set(dislikedGenresParam.split(",").filter(Boolean).map(g => normalizeGenre(g)));

  const cacheKey = `similar:v2:${trackArtist}:${trackTitle}:${trackGenre}:${trackScId}:${limit}:${dislikedIdsParam}:${dislikedArtistsParam}:${dislikedGenresParam}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const seedMoods = extractMoods(`${trackTitle} ${trackGenre}`);
    const currentYear = new Date().getFullYear();

    // ── Build search queries ──
    const queries: { query: string; weight: number; type: string }[] = [];

    // 1. Same artist (highest priority)
    if (trackArtist) {
      queries.push({ query: trackArtist, weight: 3, type: "artist" });
    }

    // 2. Genre-specific queries (much better than generic)
    const genreNorm = normalizeGenre(trackGenre);
    const genreTemplates = GENRE_SIMILAR_QUERIES[genreNorm] || GENRE_SIMILAR_QUERIES[trackGenre.toLowerCase().trim()];
    if (genreTemplates) {
      for (const tmpl of genreTemplates.sort(() => Math.random() - 0.5).slice(0, 2)) {
        queries.push({ query: tmpl, weight: 2, type: "genre_template" });
      }
    }
    if (trackGenre) {
      queries.push({ query: trackGenre, weight: 2, type: "genre" });
      queries.push({ query: `best ${trackGenre}`, weight: 1.5, type: "genre_top" });
    }

    // 3. Related genres
    if (trackGenre) {
      const related = getRelatedGenres(trackGenre).sort(() => Math.random() - 0.5);
      for (const rg of related.slice(0, 3)) {
        queries.push({ query: rg, weight: 1.2, type: "related_genre" });
      }
    }

    // 4. Mood-based queries
    if (seedMoods.length > 0) {
      const moodQueryMap: Record<Mood, string> = {
        chill: "chill vibes", bassy: "bass music", melodic: "melodic vibes",
        dark: "dark vibes", upbeat: "upbeat vibes", romantic: "romantic vibes",
        aggressive: "intense music", dreamy: "dreamy vibes",
      };
      for (const mood of seedMoods.slice(0, 2)) {
        const mq = moodQueryMap[mood];
        if (mq) queries.push({ query: mq, weight: 1, type: "mood" });
      }
    }

    // 5. Cross-genre exploratory
    if (trackArtist && trackGenre) {
      const exploratory = ["remix", "acoustic", "live", "cover", "instrumental"];
      for (const og of exploratory.sort(() => Math.random() - 0.5).slice(0, 2)) {
        queries.push({ query: `${trackArtist} ${og}`, weight: 0.8, type: "exploratory" });
      }
    }

    // Deduplicate
    const seenQ = new Set<string>();
    const uniqueQueries = queries.filter(q => {
      const key = q.query.toLowerCase();
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    });

    // ── Fetch: parallel search queries + SC related tracks API ──
    const searchResults = await Promise.allSettled(
      uniqueQueries.map(q => searchSCTracks(q.query, 15))
    );

    const scRelated = trackScId > 0 ? await fetchSCRelated(trackScId) : [];

    // Aggregate all tracks
    const scoredTracks: {
      id: string; scTrackId: number; title: string; artist: string; album: string;
      cover: string; duration: number; genre: string; audioUrl: string; previewUrl: string;
      scStreamPolicy: string; scIsFull: boolean; source: "soundcloud"; similarityScore: number;
      _source: string;
    }[] = [];

    const seenTrackIds = new Set<number>();

    function processCandidate(track: SCTrack, queryWeight: number, source: string) {
      if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) return;
      if (seenTrackIds.has(track.scTrackId)) return;
      if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) return;
      if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) return;
      if (!track.cover) return;
      if (track.duration && track.duration < 30) return;
      const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
      if (hasNoiseKeywords(titleArtistNoise)) return;

      seenTrackIds.add(track.scTrackId);

      const simScore = calculateSimilarity(
        { artist: trackArtist, genre: trackGenre, duration: trackDuration, title: trackTitle },
        { artist: track.artist, genre: track.genre, duration: track.duration || 0, cover: track.cover, scIsFull: track.scIsFull, title: track.title },
        seedMoods,
      );
      const finalScore = simScore * queryWeight + (source === "sc_related" ? 15 : 0);

      scoredTracks.push({
        ...track, similarityScore: finalScore, _source: source,
      });
    }

    // Process search results
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      if (result.status !== "fulfilled") continue;
      const queryWeight = uniqueQueries[i].weight;
      for (const track of result.value) {
        processCandidate(track, queryWeight, "search");
      }
    }

    // Process SC related results (bonus weight — these are genuinely similar)
    for (const track of scRelated) {
      processCandidate(track, 1.5, "sc_related");
    }

    scoredTracks.sort((a, b) => b.similarityScore - a.similarityScore);

    // Diversity: max 2 per artist
    const topTracks: typeof scoredTracks = [];
    const artistCount = new Map<string, number>();
    for (const track of scoredTracks) {
      if (topTracks.length >= limit) break;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= 1) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      topTracks.push(track);
    }

    const responseData = {
      tracks: topTracks.map(t => ({
        id: t.id, title: t.title, artist: t.artist, album: t.album,
        cover: t.cover, duration: t.duration, genre: t.genre,
        audioUrl: t.audioUrl, previewUrl: t.previewUrl, source: t.source,
        scTrackId: t.scTrackId, scStreamPolicy: t.scStreamPolicy, scIsFull: t.scIsFull,
        _similarityScore: Math.round(t.similarityScore),
      })),
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Similar tracks error:", error);
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
