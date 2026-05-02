import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

/* ------------------------------------------------------------------ */
/*  Interface                                                          */
/* ------------------------------------------------------------------ */

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: {
    id: string;
    title: string;
    artist: string;
    album: string;
    cover: string;
    duration: number;
    genre: string;
    audioUrl: string;
    previewUrl: string;
    source: "soundcloud";
    scTrackId: number | null;
    scStreamPolicy: string;
    scIsFull: boolean;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Genre relationship graph (for bridge genre discovery)              */
/* ------------------------------------------------------------------ */

const genreRelations: Record<string, string[]> = {
  "hip-hop": ["rap", "trap", "r&b", "soul", "funk", "boom bap", "lo-fi hip hop", "drill", "afrobeats"],
  "rap": ["hip-hop", "trap", "r&b", "boom bap", "conscious hip-hop", "drill"],
  "trap": ["hip-hop", "rap", "drill", "electronic", "dark trap", "edm"],
  "r&b": ["soul", "funk", "hip-hop", "pop", "neo soul", "afrobeats"],
  "rnb": ["soul", "funk", "hip-hop", "pop", "neo soul", "afrobeats"],
  "soul": ["r&b", "funk", "jazz", "neo soul", "gospel", "rnb"],
  "funk": ["soul", "r&b", "disco", "jazz", "boogie", "afrobeats"],
  "rock": ["alternative", "indie", "metal", "punk", "garage rock", "psych rock", "blues"],
  "alternative": ["rock", "indie", "dream pop", "shoegaze", "post-punk"],
  "indie": ["alternative", "rock", "lo-fi", "dream pop", "bedroom pop", "indie folk", "folk"],
  "metal": ["rock", "hard rock", "punk", "alternative", "doom metal"],
  "electronic": ["house", "techno", "edm", "synthwave", "ambient", "trance", "idm", "downtempo", "drum and bass"],
  "house": ["electronic", "tech house", "deep house", "progressive house", "disco", "afro house"],
  "techno": ["electronic", "house", "industrial", "minimal", "acid techno"],
  "edm": ["electronic", "house", "dubstep", "trap", "future bass", "electro house"],
  "synthwave": ["electronic", "retrowave", "vaporwave", "darksynth", "outrun"],
  "ambient": ["electronic", "chill", "downtempo", "drone", "space ambient", "new age", "classical"],
  "drum and bass": ["electronic", "jungle", "breakbeat", "uk garage", "liquid drum and bass"],
  "jazz": ["bossa nova", "blues", "soul", "lo-fi jazz", "jazz fusion", "classical"],
  "classical": ["orchestral", "piano", "chamber", "neo-classical", "cinematic", "ambient"],
  "pop": ["dance pop", "indie pop", "electropop", "k-pop", "hyperpop", "art pop", "dream pop", "r&b"],
  "lo-fi": ["chillhop", "ambient", "indie", "jazz", "lo-fi hip hop", "lo-fi beats", "chill"],
  "chill": ["lo-fi", "ambient", "downtempo", "acoustic", "chillhop", "jazz"],
  "country": ["folk", "americana", "bluegrass", "indie country", "alt country", "rock"],
  "folk": ["acoustic", "country", "indie folk", "neofolk", "dark folk", "indie"],
  "latin": ["reggaeton", "salsa", "bachata", "bossa nova", "latin trap", "afrobeats"],
  "reggae": ["dub", "ska", "dancehall", "roots reggae", "lovers rock"],
  "blues": ["jazz", "rock", "soul", "rhythm and blues", "folk"],
  "punk": ["rock", "alternative", "hardcore", "post-punk", "skate punk"],
  "dubstep": ["electronic", "edm", "drum and bass", "riddim", "deep dubstep"],
  "trance": ["electronic", "edm", "progressive", "techno", "psytrance", "house"],
  "drill": ["hip-hop", "trap", "rap", "uk drill", "dark trap"],
  "afrobeats": ["afro pop", "amapiano", "afro fusion", "latin", "r&b", "soul", "funk"],
  "k-pop": ["pop", "edm", "electronic", "r&b", "hip-hop", "dance pop"],
};

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ").replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb").replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass").replace(/d 'n' b/gi, "drum and bass");
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

/** Bridge genres: 1 hop away from user's top genres — smooth exploration */
function getBridgeGenres(userGenres: string[]): string[] {
  const userSet = new Set(userGenres.map(g => normalizeGenre(g)));
  const firstHop = new Set<string>();

  for (const ug of userGenres) {
    for (const rg of getRelatedGenres(ug)) {
      const rgNorm = normalizeGenre(rg);
      if (!userSet.has(rgNorm)) {
        firstHop.add(rgNorm);
      }
    }
  }

  return [...firstHop].sort(() => Math.random() - 0.5).slice(0, 6);
}

/* ------------------------------------------------------------------ */
/*  Genre-specific search queries                                      */
/* ------------------------------------------------------------------ */

const GENRE_QUERIES: Record<string, string[]> = {
  "hip-hop": ["hip-hop new release", "underground hip-hop", "hip-hop 2025", "boom bap 2025", "hip-hop instrumental", "conscious hip-hop", "hip-hop hits"],
  "rap": ["rap new 2025", "underground rap", "rap freestyle", "real rap", "lyrical rap", "rap hits"],
  "trap": ["trap new 2025", "dark trap", "melodic trap", "trap instrumental", "underground trap", "trap hits"],
  "r&b": ["rnb new 2025", "alternative rnb", "neo soul 2025", "rnb slow jam", "indie rnb"],
  "rnb": ["rnb new 2025", "alternative rnb", "neo soul 2025", "rnb slow jam", "indie rnb"],
  "soul": ["neo soul", "soul 2025", "modern soul", "soulful", "soul cover"],
  "funk": ["modern funk", "funk 2025", "boogie funk", "synth funk", "deep funk"],
  "rock": ["indie rock 2025", "alternative rock new", "rock 2025", "garage rock", "psych rock", "rock hits"],
  "alternative": ["alternative new 2025", "indie alternative", "dream pop", "shoegaze", "post punk"],
  "indie": ["indie 2025", "indie pop new", "indie folk", "indie rock", "bedroom pop"],
  "metal": ["metal new 2025", "progressive metal", "doom metal", "death metal", "metalcore"],
  "electronic": ["electronic new 2025", "indie electronic", "ambient electronic", "idm", "glitch"],
  "house": ["house 2025", "deep house 2025", "tech house new", "melodic house", "afro house", "house hits"],
  "techno": ["techno 2025", "deep techno", "minimal techno", "detroit techno", "acid techno"],
  "edm": ["edm 2025", "bass music", "future bass", "melodic dubstep", "electro house"],
  "synthwave": ["synthwave 2025", "retrowave", "darksynth", "outrun", "chillsynth"],
  "ambient": ["ambient 2025", "drone ambient", "space ambient", "ambient electronic", "dark ambient"],
  "drum and bass": ["dnb 2025", "liquid drum and bass", "neurofunk", "jungle 2025", "footwork"],
  "jazz": ["jazz 2025", "lo-fi jazz", "modern jazz", "jazz fusion", "jazz hip hop"],
  "classical": ["modern classical", "neo classical piano", "cinematic orchestral", "chamber music", "piano classical"],
  "pop": ["indie pop 2025", "dream pop", "art pop", "hyperpop", "bedroom pop", "pop hits 2025"],
  "lo-fi": ["lofi hip hop", "lo-fi chill", "lofi instrumental", "lofi ambient", "lofi study"],
  "chill": ["chill electronic", "chillhop", "downtempo 2025", "chill vibes", "chill bass"],
  "country": ["indie country", "alt country", "country folk", "americana 2025", "outlaw country"],
  "folk": ["indie folk 2025", "folk acoustic", "dark folk", "neofolk", "folk pop"],
  "latin": ["reggaeton 2025", "latin pop", "bachata new", "salsa", "latin trap"],
  "reggae": ["reggae 2025", "dub reggae", "roots reggae", "dancehall new", "lovers rock"],
  "blues": ["modern blues", "blues rock", "delta blues", "chicago blues", "blues 2025"],
  "punk": ["punk 2025", "post punk", "hardcore punk", "skate punk", "anarcho punk"],
  "dubstep": ["dubstep 2025", "riddim", "deep dubstep", "melodic dubstep", "brostep"],
  "trance": ["trance 2025", "progressive trance", "psytrance", "uplifting trance", "tech trance"],
  "drill": ["drill 2025", "uk drill", "brooklyn drill", "drill beats", "dark drill"],
  "afrobeats": ["afrobeats 2025", "afro pop", "amapiano", "afro fusion", "naija"],
  "k-pop": ["k-pop 2025", "kpop new", "korean pop", "kpop ballad", "kpop dance"],
};

/* ------------------------------------------------------------------ */
/*  Genre display name & gradient mapping                              */
/* ------------------------------------------------------------------ */

const GENRE_DISPLAY: Record<string, { name: string; gradient: string }> = {
  "hip-hop": { name: "Hip-Hop", gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
  "rap": { name: "Rap", gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
  "trap": { name: "Trap", gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  "r&b": { name: "R&B / Соул", gradient: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)" },
  "rnb": { name: "R&B / Соул", gradient: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)" },
  "soul": { name: "Soul", gradient: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)" },
  "funk": { name: "Funk", gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  "rock": { name: "Рок", gradient: "linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)" },
  "alternative": { name: "Альтернатива", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  "indie": { name: "Инди", gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  "metal": { name: "Метал", gradient: "linear-gradient(135deg, #434343 0%, #000000 100%)" },
  "electronic": { name: "Электроника", gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  "house": { name: "House", gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  "techno": { name: "Техно", gradient: "linear-gradient(135deg, #434343 0%, #1cb5e0 100%)" },
  "edm": { name: "EDM", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  "synthwave": { name: "Synthwave", gradient: "linear-gradient(135deg, #ff0844 0%, #ffb199 100%)" },
  "ambient": { name: "Ambient", gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)" },
  "drum and bass": { name: "Drum & Bass", gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  "jazz": { name: "Джаз", gradient: "linear-gradient(135deg, #ffd89b 0%, #19547b 100%)" },
  "classical": { name: "Классика", gradient: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)" },
  "pop": { name: "Поп", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  "lo-fi": { name: "Lo-Fi", gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)" },
  "chill": { name: "Chill", gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)" },
  "country": { name: "Кантри", gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  "folk": { name: "Фолк", gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  "latin": { name: "Латин", gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  "reggae": { name: "Регги", gradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" },
  "blues": { name: "Блюз", gradient: "linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)" },
  "punk": { name: "Панк", gradient: "linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)" },
  "dubstep": { name: "Дабстеп", gradient: "linear-gradient(135deg, #434343 0%, #f5576c 100%)" },
  "trance": { name: "Транс", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  "drill": { name: "Drill", gradient: "linear-gradient(135deg, #434343 0%, #a18cd1 100%)" },
  "afrobeats": { name: "Афробитс", gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  "k-pop": { name: "K-Pop", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
};

/* ------------------------------------------------------------------ */
/*  Spam / noise filter                                                */
/* ------------------------------------------------------------------ */

const NON_MUSIC_KEYWORDS = [
  "dj set", "dj mix", "live set", "club mix", "radio show", "radio mix",
  "podcast", "audiobook", "audio book", "bible", "biblia", "quran", "koran",
  "sermon", "preaching", "prayer", "church service", "mass ",
  "meditation guide", "sleep sounds", "white noise", "rain sounds", "asmr",
  "sound effect", "sfx ", "notification sound", "ringtone",
  "interview", "talk show", "news broadcast", "news update",
  "audio drama", "audio play", "radio drama", "storytime",
  "language lesson", "learn ", "course ", "lecture", "tutorial audio",
  "standup", "stand-up", "comedy special",
];

const NON_MUSIC_GENRES = [
  "podcast", "audiobook", "spoken word", "speech", "talk", "news",
  "comedy", "education", "religion", "spiritual", "meditation",
];

function isNonMusicContent(title: string, genre: string, durationSec: number): boolean {
  const titleLower = title.toLowerCase();
  const genreLower = (genre || "").toLowerCase();

  for (const kw of NON_MUSIC_KEYWORDS) {
    if (titleLower.includes(kw)) return true;
  }
  for (const ng of NON_MUSIC_GENRES) {
    if (genreLower === ng || genreLower.includes(ng)) return true;
  }
  // Extremely long tracks are likely DJ sets, podcasts, or mixes
  if (durationSec > 1800) return true;

  return false;
}

/** Apply quality filters to a track result */
function passesQualityFilter(track: {
  title: string;
  cover: string;
  duration: number;
  genre: string;
}): boolean {
  // Must have cover art
  if (!track.cover) return false;
  // Duration must be > 30 seconds
  if (track.duration < 30) return false;
  // No non-music content
  if (isNonMusicContent(track.title, track.genre, track.duration)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  SoundCloud related tracks API                                      */
/* ------------------------------------------------------------------ */

async function fetchSCTrackRelated(scTrackId: number): Promise<CuratedPlaylist["tracks"]> {
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
    const raw = Array.isArray(data) ? data : (data.collection || []);
    return raw
      .filter((t: Record<string, unknown>) => (t.kind as string) === "track")
      .map((t: Record<string, unknown>) => {
        const user = t.user as Record<string, unknown> | undefined;
        const artwork = (t.artwork_url as string) || "";
        const rawCover = artwork
          ? artwork.replace("-large.", "-t500x500.")
          : (user?.avatar_url as string || "").replace("-large.", "-t500x500.") || "";
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

/* ------------------------------------------------------------------ */
/*  Artist diversity enforcement                                       */
/* ------------------------------------------------------------------ */

const MAX_TRACKS_PER_ARTIST = 2;

/** Normalize artist name for grouping: lowercase, strip suffixes like "official", "music", "feat." etc. */
function normalizeArtistName(raw: string): string {
  let name = raw.toLowerCase().trim();
  // Remove parenthetical suffixes: "(official)", "(music)", etc.
  name = name.replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, " ").trim();
  // Strip common SoundCloud suffixes
  name = name.replace(/\b(official|music|records|entertainment|prod\.?|beats|sound|audio|studio|publishing|label)\b/gi, "").trim();
  // Strip "feat.", "ft.", "vs.", "&" and everything after
  name = name.split(/\s+(?:feat\.?|ft\.?|vs\.?|&|×|x)\s+/i)[0];
  // Collapse whitespace and trim
  name = name.replace(/\s+/g, " ").trim();
  // Remove trailing dots, dashes, underscores
  name = name.replace(/[\.\-_]+$/, "").trim();
  return name || raw.toLowerCase().trim();
}

/** Post-process: keep at most MAX_TRACKS_PER_ARTIST tracks per artist (fuzzy match) */
function enforceArtistDiversity(tracks: CuratedPlaylist["tracks"]): CuratedPlaylist["tracks"] {
  const artistCounts = new Map<string, number>();
  return tracks.filter(t => {
    const artist = normalizeArtistName(t.artist || "");
    if (!artist) return true;
    const count = artistCounts.get(artist) || 0;
    if (count >= MAX_TRACKS_PER_ARTIST) return false;
    artistCounts.set(artist, count + 1);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Track deduplication & search helpers                               */
/* ------------------------------------------------------------------ */

function mapSCTrack(t: Awaited<ReturnType<typeof searchSCTracks>>[0]): CuratedPlaylist["tracks"][0] {
  return {
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
  };
}

/**
 * Search SoundCloud, filter for quality, deduplicate, up to `limit` tracks.
 * Optionally exclude disliked genres from results.
 */
async function searchAndCollect(
  queries: string[],
  limit: number,
  dislikedGenres?: string[],
): Promise<CuratedPlaylist["tracks"]> {
  const allTracks: CuratedPlaylist["tracks"] = [];
  const seen = new Set<string>();
  const dislikedSet = new Set(
    (dislikedGenres || []).map(g => normalizeGenre(g))
  );

  const addTrack = (t: CuratedPlaylist["tracks"][0]) => {
    const key = String(t.scTrackId);
    if (seen.has(key)) return false;
    seen.add(key);

    // Quality filters
    if (!passesQualityFilter(t)) return false;

    // Exclude disliked genres
    const trackGenre = normalizeGenre(t.genre || "");
    if (dislikedSet.size > 0) {
      const matchesDisliked = [...dislikedSet].some(
        dg => trackGenre === dg || trackGenre.includes(dg) || dg.includes(trackGenre)
      );
      if (matchesDisliked) return false;
    }

    allTracks.push(t);
    return true;
  };

  for (const query of queries) {
    if (allTracks.length >= limit) break;
    try {
      const remaining = limit - allTracks.length;
      const fetchLimit = Math.min(50, Math.max(15, remaining));
      const results = await searchSCTracks(query, fetchLimit);
      for (const t of results) {
        if (allTracks.length >= limit) break;
        addTrack(mapSCTrack(t));
      }
    } catch {}
  }

  return allTracks;
}

/**
 * Sort tracks: prefer scIsFull tracks first (fully playable), then by relevance.
 */
function sortTracksByPlayability(tracks: CuratedPlaylist["tracks"]): CuratedPlaylist["tracks"] {
  return [...tracks].sort((a, b) => {
    // Fully playable tracks first
    if (a.scIsFull && !b.scIsFull) return -1;
    if (!a.scIsFull && b.scIsFull) return 1;
    return 0;
  });
}

/* ------------------------------------------------------------------ */
/*  Playlist builder functions                                         */
/* ------------------------------------------------------------------ */

const TRACK_LIMIT = 50;

/** "Для вас" — Search each top artist individually, combine results */
async function buildForYouPlaylist(
  topArtists: string[],
): Promise<CuratedPlaylist["tracks"]> {
  if (topArtists.length === 0) return [];

  const queries = topArtists.slice(0, 6).map(a => a.trim());
  const tracks = await searchAndCollect(queries, TRACK_LIMIT);
  return enforceArtistDiversity(sortTracksByPlayability(tracks));
}

/** "Ваш микс" — Mix of top 2-3 genres combined with top artists */
async function buildYourMixPlaylist(
  topGenres: string[],
  topArtists: string[],
): Promise<CuratedPlaylist["tracks"]> {
  const queries: string[] = [];

  // Combine genre pairs
  if (topGenres.length >= 2) {
    queries.push(`${topGenres[0]} ${topGenres[1]}`);
  }
  if (topGenres.length >= 3) {
    queries.push(`${topGenres[1]} ${topGenres[2]}`);
    queries.push(`${topGenres[0]} ${topGenres[2]}`);
  }

  // Top artist + top genre combos
  if (topArtists.length > 0 && topGenres.length > 0) {
    queries.push(`${topArtists[0]} ${topGenres[0]}`);
    if (topArtists.length > 1) {
      queries.push(`${topArtists[1]} ${topGenres[0]}`);
    }
    if (topGenres.length > 1) {
      queries.push(`${topArtists[0]} ${topGenres[1]}`);
    }
  }

  // Fallback to single genres if no combos possible
  if (queries.length === 0) {
    for (const g of topGenres.slice(0, 3)) {
      queries.push(`${g} mix`);
    }
  }
  if (queries.length === 0) {
    queries.push("popular music mix", "top hits 2025");
  }

  const tracks = await searchAndCollect(queries.slice(0, 5), TRACK_LIMIT);
  return enforceArtistDiversity(sortTracksByPlayability(tracks));
}

/** "Похожее" — Use SoundCloud related API for liked track IDs */
async function buildSimilarPlaylist(
  likedScIds: number[],
): Promise<CuratedPlaylist["tracks"]> {
  if (likedScIds.length === 0) return [];

  // Use up to 3 liked track IDs for related API
  const idsToUse = likedScIds.slice(0, 3);
  const relatedResults = await Promise.allSettled(
    idsToUse.map(id => fetchSCTrackRelated(id))
  );

  const allTracks: CuratedPlaylist["tracks"] = [];
  const seen = new Set<string>();

  for (const result of relatedResults) {
    if (result.status !== "fulfilled") continue;
    for (const t of result.value) {
      const key = String(t.scTrackId);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!passesQualityFilter(t)) continue;
      allTracks.push(t);
      if (allTracks.length >= TRACK_LIMIT) break;
    }
    if (allTracks.length >= TRACK_LIMIT) break;
  }

  // If we got fewer than 10 tracks from related API, pad with search-based similar queries
  if (allTracks.length < 10 && likedScIds.length > 0) {
    // We don't have the track titles here, so we can't search by track name.
    // The related API results are sufficient.
  }

  return enforceArtistDiversity(sortTracksByPlayability(allTracks));
}

/** "Открытия дня" — Bridge genres (1 hop away from user's top genres) */
async function buildDiscoveriesPlaylist(
  topGenres: string[],
): Promise<CuratedPlaylist["tracks"]> {
  if (topGenres.length === 0) {
    // Fallback: generic discovery
    return searchAndCollect(
      ["indie alternative 2025", "emerging artists", "underground new"],
      TRACK_LIMIT
    );
  }

  const bridges = getBridgeGenres(topGenres);
  if (bridges.length === 0) {
    return searchAndCollect(
      ["indie alternative 2025", "emerging artists", "underground new"],
      TRACK_LIMIT
    );
  }

  // Build queries from bridge genres — use their specific queries if available
  const queries: string[] = [];
  for (const bridge of bridges.slice(0, 4)) {
    const genreQueries = GENRE_QUERIES[normalizeGenre(bridge)];
    if (genreQueries && genreQueries.length > 0) {
      // Use 2-3 queries from this bridge genre
      queries.push(...genreQueries.slice(0, 2));
    } else {
      queries.push(`${bridge} 2025`, `best ${bridge}`);
    }
  }

  if (queries.length === 0) {
    queries.push("indie alternative 2025", "emerging artists");
  }

  const tracks = await searchAndCollect(queries.slice(0, 6), TRACK_LIMIT);
  return enforceArtistDiversity(sortTracksByPlayability(tracks));
}

/** Genre-specific playlists — only for user's actual top genres, max 4 */
async function buildGenrePlaylists(
  topGenres: string[],
): Promise<{ config: CuratedPlaylist; buildPromise: Promise<CuratedPlaylist["tracks"]> }[]> {
  const genrePlaylists: { config: CuratedPlaylist; buildPromise: Promise<CuratedPlaylist["tracks"]> }[] = [];

  // Deduplicate normalized genres, take top 4
  const seen = new Set<string>();
  const uniqueGenres: string[] = [];
  for (const g of topGenres) {
    const norm = normalizeGenre(g);
    if (!seen.has(norm)) {
      seen.add(norm);
      uniqueGenres.push(norm);
    }
    if (uniqueGenres.length >= 4) break;
  }

  for (const genre of uniqueGenres) {
    const display = GENRE_DISPLAY[genre] || { name: genre.charAt(0).toUpperCase() + genre.slice(1), gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" };
    const genreQueries = GENRE_QUERIES[genre];

    const queries: string[] = [];
    if (genreQueries) {
      // Pick 2-3 targeted queries per genre
      queries.push(...genreQueries.slice(0, 3));
    } else {
      queries.push(`${genre} 2025`, `${genre} new`, `best ${genre}`);
    }

    const config: CuratedPlaylist = {
      id: `genre-${genre.replace(/[^a-z0-9]/g, "-")}`,
      name: display.name,
      subtitle: `${display.name} — на основе ваших предпочтений`,
      gradient: display.gradient,
      tracks: [], // filled after search
    };

    genrePlaylists.push({
      config,
      buildPromise: searchAndCollect(queries, TRACK_LIMIT).then(t => enforceArtistDiversity(sortTracksByPlayability(t))),
    });
  }

  return genrePlaylists;
}

/** "Популярное" — General popular playlist filtered by language preference */
async function buildPopularPlaylist(
  lang: string | null,
  dislikedGenres: string[],
): Promise<CuratedPlaylist["tracks"]> {
  let queries: string[] = [];

  if (lang === "russian") {
    queries = [
      "русская музыка 2025",
      "русский рэп новый",
      "популярная русская музыка",
      "русские хиты 2025",
      "российская музыка новый",
    ];
  } else if (lang === "english") {
    queries = [
      "popular music 2025",
      "top hits 2025",
      "chart music",
      "viral hits",
      "mainstream hits",
    ];
  } else {
    // Mixed / no preference
    queries = [
      "popular music 2025",
      "top hits this week",
      "viral hits",
      "chart toppers",
      "best songs 2025",
    ];
  }

  const tracks = await searchAndCollect(queries, TRACK_LIMIT, dislikedGenres);
  return enforceArtistDiversity(sortTracksByPlayability(tracks));
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { playlists: CuratedPlaylist[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (force fresh diversity)

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId || "";

    // Parse query parameters
    const topGenres = req.nextUrl.searchParams.get("genres")?.split(",").filter(Boolean) || [];
    const topArtists = req.nextUrl.searchParams.get("artists")?.split(",").filter(Boolean) || [];
    const likedScIdsParam = req.nextUrl.searchParams.get("likedScIds") || "";
    const likedScIds = likedScIdsParam.split(",").filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
    const lang = req.nextUrl.searchParams.get("lang") || null;

    // Compute cache key from all inputs
    const cacheKey = `${userId}_${topGenres.join(",")}_${topArtists.join(",")}_${likedScIdsParam}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ playlists: cached.playlists });
    }

    const playlists: CuratedPlaylist[] = [];

    // ── 1. "Для вас" — top artist searches ──
    if (topArtists.length > 0) {
      const forYouTracks = await buildForYouPlaylist(topArtists);
      if (forYouTracks.length >= 3) {
        playlists.push({
          id: "for-you",
          name: "Для вас",
          subtitle: `на основе ваших любимых артистов`,
          gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          tracks: forYouTracks,
        });
      }
    }

    // ── 2. "Ваш микс" — genre + artist combos ──
    if (topGenres.length > 0 || topArtists.length > 0) {
      const mixTracks = await buildYourMixPlaylist(topGenres, topArtists);
      if (mixTracks.length >= 3) {
        playlists.push({
          id: "your-mix",
          name: "Ваш микс",
          subtitle: `смесь ваших любимых жанров`,
          gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
          tracks: mixTracks,
        });
      }
    }

    // ── 3. "Похожее" — SoundCloud related API for liked tracks ──
    if (likedScIds.length > 0) {
      const similarTracks = await buildSimilarPlaylist(likedScIds);
      if (similarTracks.length >= 3) {
        playlists.push({
          id: "similar",
          name: "Похожее",
          subtitle: "похоже на то, что вам нравится",
          gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
          tracks: similarTracks,
        });
      }
    }

    // ── 4. "Открытия дня" — bridge genres ──
    const discoveryTracks = await buildDiscoveriesPlaylist(topGenres);
    if (discoveryTracks.length >= 3) {
      playlists.push({
        id: "discoveries",
        name: "Открытия дня",
        subtitle: "новые жанры рядом с вашими",
        gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
        tracks: discoveryTracks,
      });
    }

    // ── 5. Genre-specific playlists (max 4, only from user's top genres) ──
    const genrePlaylistBuilds = await buildGenrePlaylists(topGenres);
    const genreResults = await Promise.allSettled(
      genrePlaylistBuilds.map(g => g.buildPromise)
    );
    for (let i = 0; i < genreResults.length; i++) {
      const result = genreResults[i];
      if (result.status === "fulfilled" && result.value.length >= 3) {
        playlists.push({
          ...genrePlaylistBuilds[i].config,
          tracks: result.value,
        });
      }
    }

    // ── 6. "Популярное" — filtered by language and disliked genres ──
    const popularTracks = await buildPopularPlaylist(lang, []);
    if (popularTracks.length >= 3) {
      playlists.push({
        id: "popular",
        name: "Популярное",
        subtitle: lang === "russian"
          ? "популярная русская музыка"
          : lang === "english"
            ? "popular music"
            : "популярная музыка",
        gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
        tracks: popularTracks,
      });
    }

    // ── Fallback: if no user data at all, show popular playlist ──
    if (playlists.length === 0) {
      const fallbackTracks = enforceArtistDiversity(sortTracksByPlayability(await searchAndCollect(
        ["popular music 2025", "top hits 2025", "best songs", "trending music"],
        TRACK_LIMIT
      )));
      if (fallbackTracks.length > 0) {
        playlists.push({
          id: "popular",
          name: "Популярное",
          subtitle: "популярная музыка",
          gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
          tracks: fallbackTracks,
        });
      }
    }

    cache.set(cacheKey, { playlists, timestamp: Date.now() });
    return NextResponse.json({ playlists });
  } catch (error) {
    console.error("Curated playlists error:", error);
    return NextResponse.json({ playlists: [] });
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
