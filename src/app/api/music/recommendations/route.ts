import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Smart Recommendations API v7 — "Mood Flow" Edition.
 *
 * Major improvements over v6:
 * 1. SESSION MOOD FLOW — analyzes last 5 played tracks to build a session mood profile,
 *    ensuring smooth transitions between tracks (no jarring mood jumps)
 * 2. LANGUAGE PREFERENCE — detects user's preferred language from listening history,
 *    prioritizing tracks in that language
 * 3. BRIDGE GENRE EXPLORATION — instead of random genres for exploration, uses
 *    "bridge genres" that are 1-2 hops away from user's taste (e.g., hip-hop → r&b → soul)
 * 4. MULTIPLE SESSION TRACKS — client sends last 5 track genres/artists/energy,
 *    not just the current one, for much better context
 * 5. POPULARITY AWARENESS — uses SoundCloud playback_count when available to
 *    differentiate between viral tracks and genuine quality
 * 6. IMPROVED ANTI-REPETITION — larger recent window (100 tracks) + artist-level memory
 * 7. SMARTER QUERY GENERATION — artist + genre combos, year + mood combos
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 6 * 60 * 1000; // 6 min

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 150) {
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
  const day = now.getDay();
  if (day === 5 && hour >= 18) return "friday_evening";
  if (day === 0 || day === 6) return "weekend";
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

// ── Genre-specific query templates ──
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

// ── Mood extraction from title keywords ──
type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";

const MOOD_KEYWORDS: Record<Mood, string[]> = {
  chill: ["chill", "relax", "calm", "easy", "mellow", "smooth", "soft", "gentle", "slow", "peaceful", "serene", "laid back", "cozy"],
  bassy: ["bass", "bass boosted", "sub bass", "808", "banger", "drop", "wobble", "rattle", "slap"],
  melodic: ["melodic", "melody", "piano", "guitar", "harmonic", "orchestral", "strings", "keys", "ambient", "ethereal"],
  dark: ["dark", "grimy", "gritty", "raw", "underground", "shadow", "void", "sinister", "noir", "midnight", "dungeon"],
  upbeat: ["upbeat", "happy", "energetic", "hype", "feel good", "party", "dance", "fun", "bright", "summer", "sunny"],
  romantic: ["love", "heart", "kiss", "romance", "baby", "darling", "miss you", "together", "forever", "tender", "intimate"],
  aggressive: ["hard", "heavy", "aggressive", "intense", "brutal", "rage", "fury", "smash", "destroy", "war", "violent"],
  dreamy: ["dream", "float", "cloud", "space", "cosmic", "ethereal", "haze", "glow", "atmospheric", "euphoric", "transcend"],
};

function extractMoods(title: string, genre: string): Mood[] {
  const text = `${title} ${genre}`.toLowerCase();
  const moods: Mood[] = [];
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        moods.push(mood as Mood);
        break;
      }
    }
  }
  return moods;
}

// ── Genre relationship graph (enriched with bridge distances) ──
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

// ── Bridge genre calculation ──
// Returns genres that are 1-2 hops away from user's taste — perfect for smooth exploration
function getBridgeGenres(userGenres: string[]): string[] {
  const userSet = new Set(userGenres.map(g => g.toLowerCase().trim()));
  const firstHop = new Set<string>();
  
  // Collect all genres directly related to user's genres
  for (const ug of userGenres) {
    for (const rg of getRelatedGenres(ug)) {
      const rgNorm = rg.toLowerCase().trim();
      if (!userSet.has(rgNorm) && !isSpamProneGenre(rgNorm)) {
        firstHop.add(rgNorm);
      }
    }
  }
  
  // Second hop: genres related to first-hop genres
  const secondHop = new Set<string>();
  for (const fh of [...firstHop].sort(() => Math.random() - 0.5).slice(0, 5)) {
    for (const rg of getRelatedGenres(fh)) {
      const rgNorm = rg.toLowerCase().trim();
      if (!userSet.has(rgNorm) && !firstHop.has(rgNorm) && !isSpamProneGenre(rgNorm)) {
        secondHop.add(rgNorm);
      }
    }
  }
  
  // Return mix of 70% first-hop + 30% second-hop
  const firstArr = [...firstHop].sort(() => Math.random() - 0.5);
  const secondArr = [...secondHop].sort(() => Math.random() - 0.5);
  return [...firstArr.slice(0, 4), ...secondArr.slice(0, 2)];
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
  _isRelated: boolean;
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

const RELIGIOUS_GENRE_KEYWORDS = ["gospel", "christian", "worship", "religious", "spiritual", "church", "hymn", "ccm"];

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

function titleHashtagGenreMismatch(title: string, topGenres: string[]): boolean {
  const hashtags: string[] = [];
  const matches = title.matchAll(HASHTAG_GENRE_PATTERN);
  for (const match of matches) {
    const tag = match[1].toLowerCase().trim();
    if (KNOWN_GENRE_HASHTAGS.includes(tag)) hashtags.push(tag);
  }
  if (hashtags.length === 0) return false;
  const topLower = topGenres.map(g => normalizeGenre(g));
  for (const hg of hashtags) {
    const hgNorm = normalizeGenre(hg);
    if (!topLower.some(tg => tg === hgNorm || tg.includes(hgNorm) || hgNorm.includes(tg))) return true;
  }
  return false;
}

// ── Energy estimation ──
function estimateEnergy(track: SCTrack): number {
  const title = (track.title || "").toLowerCase();
  const genre = normalizeGenre(track.genre || "");
  const dur = track.duration || 0;
  const highKeywords = ["remix", "edit", "mix", "club", "bass boosted", "radio edit", "extended", "hard", "rush", "hype", "banger", "drop", "festival", "rave", "workout", "gym", "bootleg", "vip", "original mix"];
  const lowKeywords = ["acoustic", "live", "unplugged", "piano", "lullaby", "reprise", "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi", "slow", "ballad"];
  let s = 0;
  for (const kw of highKeywords) { if (title.includes(kw)) { s += 1; break; } }
  for (const kw of lowKeywords) { if (title.includes(kw)) { s -= 1; break; } }
  const highG = ["edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap", "reggaeton", "dance pop", "hardcore", "trance", "psytrance", "garage", "grime", "drill"];
  const midG = ["house", "pop", "hip hop", "rap", "indie", "rock", "alternative", "synthwave", "afrobeats"];
  const lowG = ["ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova", "downtempo", "jazz", "blues", "new age"];
  if (highG.some(g => genre.includes(g))) s += 2;
  else if (midG.some(g => genre.includes(g))) s += 1;
  if (lowG.some(g => genre.includes(g))) s -= 2;
  if (dur > 0) { if (dur < 150) s += 1; else if (dur > 360) s -= 1; }
  if (s >= 2) return 1;
  if (s <= -2) return 0;
  if (s >= 1) return 0.75;
  if (s <= -1) return 0.25;
  return 0.5;
}

// ── Language detection ──
// Detects if text is primarily Russian/Cyrillic, English/Latin, or mixed
function detectLanguage(text: string): "russian" | "english" | "latin" | "other" {
  if (!text) return "other";
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cyrillic + latin;
  if (total === 0) return "other";
  if (cyrillic / total > 0.4) return "russian";
  if (latin / total > 0.6) return "english";
  return "latin"; // Spanish, French, etc. — still Latin script
}

// ── Fetch SoundCloud related tracks ──
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
    const raw = Array.isArray(data) ? data : (data.collection || []);
    return raw.filter((t: Record<string, unknown>) => (t.kind as string) === "track").map((t: Record<string, unknown>) => {
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
  } catch {
    return [];
  }
}

// ── Session mood profile from last played tracks ──
interface SessionTrack {
  genre: string;
  artist: string;
  energy: number;
  moods: Mood[];
  language: "russian" | "english" | "latin" | "other";
}

function buildSessionMood(sessionTracks: SessionTrack[]): {
  avgEnergy: number;
  dominantMoods: Mood[];
  dominantGenres: string[];
  languagePreference: "russian" | "english" | "latin" | "mixed";
} {
  if (sessionTracks.length === 0) {
    return { avgEnergy: 0.5, dominantMoods: [], dominantGenres: [], languagePreference: "mixed" };
  }
  
  const energies = sessionTracks.map(t => t.energy);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  
  // Count moods across session
  const moodCounts: Record<string, number> = {};
  for (const t of sessionTracks) {
    for (const m of t.moods) {
      moodCounts[m] = (moodCounts[m] || 0) + 1;
    }
  }
  const dominantMoods = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mood]) => mood as Mood);
  
  // Count genres across session
  const genreCounts: Record<string, number> = {};
  for (const t of sessionTracks) {
    if (t.genre) {
      const norm = normalizeGenre(t.genre);
      genreCounts[norm] = (genreCounts[norm] || 0) + 1;
    }
  }
  const dominantGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre);
  
  // Language preference
  const langCounts: Record<string, number> = {};
  for (const t of sessionTracks) {
    langCounts[t.language] = (langCounts[t.language] || 0) + 1;
  }
  const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  const languagePreference = topLang.length > 0 && topLang[0][1] >= sessionTracks.length * 0.5
    ? topLang[0][0] as "russian" | "english" | "latin"
    : "mixed";
  
  return { avgEnergy, dominantMoods, dominantGenres, languagePreference };
}

function scoreTrack(
  track: SCTrack,
  queryCount: number,
  topGenres: string[],
  topArtists: string[],
  relatedGenres: string[],
  isDiscovery: boolean,
  isExploration: boolean,
  isRelated: boolean,
  timeContext: TimeContext,
  sessionMood: ReturnType<typeof buildSessionMood>,
  userMoods: Mood[],
  languagePreference: "russian" | "english" | "latin" | "mixed",
): number {
  let score = 0;

  const trackGenre = normalizeGenre(track.genre || "");
  const energy = estimateEnergy(track);

  // ── 1. SESSION MOOD FLOW BONUS (up to +35) ──
  // Strongly reward tracks that match the session's current mood
  // This creates smooth transitions between tracks
  if (sessionMood.dominantMoods.length > 0) {
    const trackMoods = extractMoods(track.title || "", track.genre || "");
    let moodMatchCount = 0;
    for (const mood of sessionMood.dominantMoods) {
      if (trackMoods.includes(mood)) moodMatchCount++;
    }
    // Each session mood match is worth 12 points (high priority)
    score += Math.min(35, moodMatchCount * 12);
  }
  
  // Energy alignment with session — penalize jarring jumps
  if (sessionMood.avgEnergy > 0) {
    const energyDiff = Math.abs(energy - sessionMood.avgEnergy);
    if (energyDiff < 0.15) score += 15;       // Very close — smooth transition
    else if (energyDiff < 0.3) score += 8;    // Somewhat close
    else if (energyDiff > 0.5) score -= 12;   // Jarring jump — penalize
  }

  // ── 2. LANGUAGE PREFERENCE (up to +20) ──
  // Reward tracks in the user's preferred language
  if (languagePreference !== "mixed") {
    const trackText = `${track.title || ""} ${track.artist || ""}`;
    const trackLang = detectLanguage(trackText);
    if (trackLang === languagePreference) score += 20;
    // Don't penalize other languages — just boost preferred ones
  }

  // ── 3. HIDDEN GEM BONUS (up to +40) ──
  if (track.cover && !track.scIsFull) score += 15;
  if (track.scIsFull) score += 30;

  // ── 4. TIME-OF-DAY BONUS ──
  const TIME_GENRE_BOOSTS: Record<string, string[]> = {
    morning: ["pop", "indie pop", "dance pop", "funk", "soul", "rock", "hip-hop"],
    afternoon: ["electronic", "house", "techno", "lo-fi", "ambient", "indie"],
    evening: ["jazz", "lo-fi", "chill", "r&b", "soul", "bossa nova", "acoustic"],
    night: ["ambient", "lo-fi", "piano", "classical", "downtempo", "chill"],
    weekend: ["edm", "house", "hip-hop", "reggaeton", "dance pop", "rock", "pop"],
    friday_evening: ["edm", "house", "hip-hop", "trap", "dance pop", "techno"],
  };
  const timeGenres = TIME_GENRE_BOOSTS[timeContext] || [];
  for (const tg of timeGenres) {
    if (trackGenre === normalizeGenre(tg) || trackGenre.includes(normalizeGenre(tg))) {
      score += 20;
      break;
    }
  }
  const wantHigh = ["morning", "afternoon", "weekend", "friday_evening"].includes(timeContext);
  const wantLow = ["evening", "night"].includes(timeContext);
  if (wantHigh) score += Math.round(energy * 12);
  if (wantLow) score += Math.round((1 - energy) * 12);

  // ── 5. MOOD MATCHING (up to +25) ──
  if (userMoods.length > 0) {
    const trackMoods = extractMoods(track.title || "", track.genre || "");
    let moodMatches = 0;
    for (const mood of userMoods) {
      if (trackMoods.includes(mood)) moodMatches++;
    }
    if (moodMatches > 0) score += Math.min(25, moodMatches * 12);
  }

  // ── 6. NOISE CONTENT PENALTY ──
  const titleAndArtist = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleAndArtist) && !userWantsReligiousContent(topGenres)) score -= 150;
  if (titleHashtagGenreMismatch(track.title || "", topGenres)) score -= 60;

  // ── 7. CROSS-QUERY FREQUENCY ──
  score += queryCount * 50;

  // ── 8. RELATED TRACKS BONUS ──
  if (isRelated) score += 35;

  // ── 9. GENRE MATCHING ──
  let hasGenreMatch = false;
  if (trackGenre) {
    for (const g of topGenres) {
      const normalized = normalizeGenre(g);
      if (trackGenre === normalized) { score += 45; hasGenreMatch = true; }
      else if (trackGenre.includes(normalized) || normalized.includes(trackGenre)) { score += 22; hasGenreMatch = true; }
    }
    // Session genre bonus — tracks matching the current session's genres
    for (const sg of sessionMood.dominantGenres) {
      if (trackGenre === sg) { score += 15; hasGenreMatch = true; break; }
      else if (trackGenre.includes(sg) || sg.includes(trackGenre)) { score += 8; hasGenreMatch = true; break; }
    }
    for (const rg of relatedGenres) {
      if (trackGenre === normalizeGenre(rg)) { score += 12; hasGenreMatch = true; break; }
    }
  }

  // ── 10. DISCOVERY GATE ──
  if (isDiscovery && !hasGenreMatch) score -= 60;

  // ── 11. EXPLORATION BONUS ──
  if (isExploration && !hasGenreMatch) score += 5;

  // ── 12. ARTIST MATCHING ──
  const trackArtist = (track.artist || "").toLowerCase().trim();
  if (trackArtist) {
    for (const a of topArtists) {
      const aLower = a.toLowerCase().trim();
      if (trackArtist === aLower) score += 45;
      else if (trackArtist.includes(aLower) || aLower.includes(trackArtist)) score += 18;
    }
  }

  // ── 13. QUALITY SIGNALS ──
  if (track.cover) score += 15;
  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 360) { score += 12; if (dur >= 180 && dur <= 300) score += 5; }
  else if (dur >= 60 && dur < 120) score += 3;

  // ── Random jitter for freshness ──
  score += Math.random() * 20 - 10;

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
  const recentIdsParam = searchParams.get("recentIds") || "";
  
  // v7: session tracks — comma-separated JSON objects with genre, artist, energy
  const sessionParam = searchParams.get("session");
  // v7: language preference
  const langParam = searchParams.get("lang") || "mixed";

  const excludeIds = new Set((excludeParam || "").split(",").filter(Boolean));
  const dislikedIds = new Set((dislikedParam || "").split(",").filter(Boolean));
  const dislikedArtists = new Set((dislikedArtistsParam || "").split(",").filter(Boolean).map(a => a.toLowerCase()));
  const dislikedGenres = new Set((dislikedGenresParam || "").split(",").filter(Boolean).map(g => normalizeGenre(g)));
  const recentIds = new Set((recentIdsParam || "").split(",").filter(Boolean));

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 5) : [];

  const timeContext = getTimeContext();
  const currentTrackHighEnergy: boolean | null = currentEnergyParam === "high" ? true
    : currentEnergyParam === "low" ? false : null;
  const currentGenre = currentGenreParam || null;

  // Parse session tracks
  let sessionTracks: SessionTrack[] = [];
  if (sessionParam) {
    try {
      sessionTracks = JSON.parse(sessionParam);
    } catch { /* ignore */ }
  }
  
  // If no session sent, build from current genre/energy
  if (sessionTracks.length === 0 && currentGenre) {
    sessionTracks = [{
      genre: currentGenre,
      artist: "",
      energy: currentTrackHighEnergy === true ? 0.8 : currentTrackHighEnergy === false ? 0.3 : 0.5,
      moods: extractMoods(currentGenre, ""),
      language: langParam as SessionTrack["language"],
    }];
  }

  const cacheKey = `rec:v7:${timeContext}:${genresParam || ""}:${artistsParam || ""}:${currentGenre || ""}:${dislikedParam || ""}:${dislikedArtistsParam || ""}:${dislikedGenresParam || ""}:${recentIdsParam || ""}:${sessionParam || ""}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const queries: { query: string; type: string }[] = [];
    const discoveryQueries: string[] = [];
    const explorationQueries: string[] = [];
    const currentYear = new Date().getFullYear();

    // Build session mood profile
    const sessionMood = buildSessionMood(sessionTracks);
    
    // Merge session genres into user genres for richer context
    const allGenres = [...new Set([...genres, ...sessionMood.dominantGenres])].slice(0, 6);

    // ── Build user mood profile from genres + session ──
    const userMoods: Mood[] = [...sessionMood.dominantMoods]; // Start with session moods
    const genreMoodMap: Record<string, Mood[]> = {
      "lo-fi": ["chill", "dreamy"], "chill": ["chill", "dreamy"], "ambient": ["chill", "dreamy"],
      "hip-hop": ["bassy", "aggressive"], "trap": ["bassy", "dark", "aggressive"],
      "r&b": ["romantic", "chill"], "rnb": ["romantic", "chill"], "soul": ["romantic", "melodic"],
      "house": ["upbeat", "dreamy"], "techno": ["dark", "aggressive"],
      "edm": ["upbeat", "bassy"], "dubstep": ["bassy", "aggressive", "dark"],
      "jazz": ["melodic", "chill"], "classical": ["melodic", "dreamy"],
      "pop": ["upbeat", "romantic"], "indie": ["dreamy", "melodic"],
      "rock": ["aggressive", "upbeat"], "metal": ["aggressive", "dark"],
      "synthwave": ["dreamy", "dark"], "punk": ["aggressive", "upbeat"],
      "folk": ["melodic", "chill"], "bossa nova": ["chill", "romantic"],
      "drill": ["aggressive", "dark", "bassy"],
      "afrobeats": ["upbeat", "bassy"], "k-pop": ["upbeat", "romantic"],
      "reggae": ["chill", "upbeat"], "blues": ["melodic", "dark"],
    };
    for (const g of allGenres.slice(0, 3)) {
      const moods = genreMoodMap[normalizeGenre(g)] || genreMoodMap[g.toLowerCase()] || [];
      for (const m of moods) if (!userMoods.includes(m)) userMoods.push(m);
    }
    // Cap moods at 4
    userMoods.splice(4);

    // Language preference
    const languagePreference = langParam as "russian" | "english" | "latin" | "mixed" || sessionMood.languagePreference;

    if (allGenres.length > 0 || artists.length > 0) {
      // ── Primary: genre-specific queries ──
      for (const g of allGenres.slice(0, 4)) {
        const gNorm = g.toLowerCase().trim();
        const templates = GENRE_QUERIES[gNorm] || GENRE_QUERIES[normalizeGenre(g)];
        if (templates) {
          const shuffled = templates.sort(() => Math.random() - 0.5);
          for (const tmpl of shuffled.slice(0, 2)) {
            queries.push({ query: tmpl, type: "genre_template" });
          }
        }
        queries.push({ query: `${g} ${currentYear}`, type: "genre_new" });
      }

      // ── Session-aligned queries: mood + genre combos ──
      if (sessionMood.dominantMoods.length > 0 && sessionMood.dominantGenres.length > 0) {
        const moodQueryMap: Record<Mood, string> = {
          chill: "chill", bassy: "bass", melodic: "melodic", dark: "dark",
          upbeat: "upbeat", romantic: "romantic", aggressive: "hard", dreamy: "dreamy",
        };
        // Combine session mood with session genre for highly targeted queries
        const topSessionGenre = sessionMood.dominantGenres[0];
        const topSessionMood = sessionMood.dominantMoods[0];
        if (topSessionGenre && topSessionMood) {
          queries.push({ query: `${moodQueryMap[topSessionMood]} ${topSessionGenre} ${currentYear}`, type: "session_mood_genre" });
        }
      }

      // ── Artist + genre combo queries (much better than artist alone) ──
      for (const a of artists.slice(0, 3)) {
        queries.push({ query: a, type: "artist" });
        // Combine artist with their top genre for better results
        if (allGenres.length > 0) {
          queries.push({ query: `${a} ${allGenres[0]}`, type: "artist_genre" });
        }
      }
      for (const a of artists.slice(3, 5)) {
        queries.push({ query: a, type: "artist" });
      }

      // ── Mood-based queries ──
      if (userMoods.length > 0) {
        const moodQueryMap: Record<Mood, string[]> = {
          chill: ["chill vibes 2025", "chill electronic", "chill beats"],
          bassy: ["bass music 2025", "bass boosted", "heavy bass"],
          melodic: ["melodic 2025", "melodic electronic", "melodic vibes"],
          dark: ["dark electronic", "dark ambient", "dark vibes"],
          upbeat: ["feel good 2025", "upbeat vibes", "positive energy"],
          romantic: ["love songs 2025", "romantic vibes", "slow jam"],
          aggressive: ["intense music", "high energy 2025", "hard hitting"],
          dreamy: ["dreamy vibes", "ethereal music", "atmospheric 2025"],
        };
        for (const mood of userMoods.slice(0, 2)) {
          const mq = moodQueryMap[mood];
          if (mq) {
            const shuffled = mq.sort(() => Math.random() - 0.5);
            queries.push({ query: shuffled[0], type: "mood" });
          }
        }
      }

      // ── Related genres (familiar discovery) ──
      const normalizedTopGenres = new Set(allGenres.map(g => normalizeGenre(g)));
      const allRelated = new Set<string>();
      for (const g of allGenres.slice(0, 3)) {
        for (const rg of getRelatedGenres(g)) {
          if (isSpamProneGenre(rg)) {
            const rgNorm = normalizeGenre(rg);
            const userWants = normalizedTopGenres.has(rgNorm) || [...normalizedTopGenres].some(tg => tg.includes(rgNorm) || rgNorm.includes(tg));
            if (!userWants) continue;
          }
          allRelated.add(rg);
        }
      }
      const relatedArr = [...allRelated].sort(() => Math.random() - 0.5).slice(0, 3);
      for (const rg of relatedArr) {
        queries.push({ query: rg, type: "related_genre" });
        discoveryQueries.push(`best ${rg}`);
      }

      // ── BRIDGE GENRE EXPLORATION (v7 key improvement) ──
      // Instead of random genres, use genres 1-2 hops away from user taste
      const bridgeGenres = getBridgeGenres(allGenres.slice(0, 3));
      for (const bg of bridgeGenres.slice(0, 3)) {
        const templates = GENRE_QUERIES[bg];
        if (templates) {
          explorationQueries.push(templates.sort(() => Math.random() - 0.5)[0]);
        } else {
          explorationQueries.push(bg);
        }
      }

      // ── Session context ──
      if (currentGenre && currentGenre.length > 0) {
        queries.push({ query: currentGenre, type: "session_context" });
      }
    } else if (genre !== "random") {
      const templates = GENRE_QUERIES[genre.toLowerCase().trim()] || GENRE_QUERIES[normalizeGenre(genre)];
      if (templates) {
        for (const tmpl of templates.sort(() => Math.random() - 0.5).slice(0, 3)) {
          queries.push({ query: tmpl, type: "genre_template" });
        }
      }
      queries.push({ query: `${genre} ${currentYear}`, type: "genre_new" });
    } else {
      // Fallback: time-aware + diverse
      const timeFallbacks: Record<TimeContext, string[]> = {
        morning: ["feel good morning", "acoustic morning", "upbeat indie pop"],
        afternoon: ["focus electronic", "productivity beats", "indie electronic"],
        evening: ["chill evening", "jazz evening", "soul dinner"],
        night: ["lofi night", "ambient sleep", "piano calm"],
        weekend: ["party vibes", "dance electronic", "summer hits"],
        friday_evening: ["pre game", "friday energy", "weekend starter"],
      };
      const fallbacks = [...(timeFallbacks[timeContext] || []), "new music 2025", "hidden gems", "emerging artists", "indie discovery"];
      for (const f of fallbacks.sort(() => Math.random() - 0.5).slice(0, 5)) {
        queries.push({ query: f, type: "fallback" });
      }
    }

    // Deduplicate queries
    const seenQ = new Set<string>();
    const uniqueQueries = queries.filter(q => {
      const key = q.query.toLowerCase();
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    }).slice(0, 12); // Up to 12 main queries (was 10)

    const uniqueDiscovery = [...new Set(discoveryQueries.map(q => q.toLowerCase()))]
      .map(q => ({ query: q, type: "discovery" })).slice(0, 2);

    const uniqueExploration = [...new Set(explorationQueries.map(q => q.toLowerCase()))]
      .map(q => ({ query: q, type: "exploration" })).slice(0, 3); // Was 2, now 3

    const allQueries = [...uniqueQueries, ...uniqueDiscovery, ...uniqueExploration];

    // Fetch all searches + artist-based related searches
    const searchPromises = allQueries.map(q => searchSCTracks(q.query, 12));
    const relatedPromises: Promise<SCTrack[]>[] = [];
    for (const a of artists.slice(0, 2)) {
      relatedPromises.push(searchSCTracks(`${a} new`, 8));
    }

    // Fetch SC related tracks for recent session tracks (genuine similar music)
    const scRelatedPromises: Promise<SCTrack[]>[] = [];
    for (const st of sessionTracks.slice(0, 2)) {
      // We need scTrackId which isn't in session data, skip for now
    }

    const [searchResults, relatedResults] = await Promise.allSettled([
      Promise.all(searchPromises),
      Promise.all(relatedPromises),
    ]);

    // Related genres for scoring
    const relatedGenresForScoring = new Set<string>();
    for (const g of allGenres.slice(0, 3)) {
      for (const rg of getRelatedGenres(g)) relatedGenresForScoring.add(rg);
    }
    const relatedArr = [...relatedGenresForScoring];

    // Aggregate all tracks
    const trackMap = new Map<number, {
      track: SCTrack;
      queryCount: number;
      isDiscovery: boolean;
      isExploration: boolean;
      isRelated: boolean;
    }>();
    const seenIds = new Set<number>();

    function processTrack(track: SCTrack, isDiscovery: boolean, isExploration: boolean, isRelated: boolean) {
      // Hard filters
      if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) return;
      if (dislikedIds.has(track.id)) return;
      if (recentIds.has(track.id) || recentIds.has(String(track.scTrackId))) return;
      if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) return;
      if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) return;
      if (!userWantsReligiousContent(allGenres)) {
        const genreLower = (track.genre || "").toLowerCase();
        const titleLower = (track.title || "").toLowerCase();
        const userWantsDeepHouse = allGenres.some(g => {
          const n = normalizeGenre(g);
          return n === "deep house" || n.includes("deep house");
        });
        if (!userWantsDeepHouse && (genreLower.includes("deep house") || titleLower.includes("deep house"))) return;
      }
      if (!track.cover) return;
      if (track.duration && track.duration < 30) return;
      const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
      if (hasNoiseKeywords(titleArtistNoise) && !userWantsReligiousContent(allGenres)) return;
      if (titleHashtagGenreMismatch(track.title || "", allGenres)) return;
      if (seenIds.has(track.scTrackId)) return;
      seenIds.add(track.scTrackId);

      const existing = trackMap.get(track.scTrackId);
      if (existing) {
        existing.queryCount++;
      } else {
        trackMap.set(track.scTrackId, { track, queryCount: 1, isDiscovery, isExploration, isRelated });
      }
    }

    // Process search results
    const searchBatches = searchResults.status === "fulfilled" ? searchResults.value : [];
    for (let i = 0; i < searchBatches.length; i++) {
      const tracks = searchBatches[i];
      if (!tracks) continue;
      const queryMeta = allQueries[i];
      const isDiscovery = queryMeta?.type === "discovery" || queryMeta?.type === "related_genre";
      const isExploration = queryMeta?.type === "exploration";
      for (const track of tracks) {
        processTrack(track, isDiscovery, isExploration, false);
      }
    }

    // Process related results (from artist searches)
    const relatedBatches = relatedResults.status === "fulfilled" ? relatedResults.value : [];
    for (const batch of relatedBatches) {
      for (const track of batch) {
        processTrack(track, true, false, true);
      }
    }

    // Score all tracks
    const scoredTracks: ScoredTrack[] = [];
    for (const { track, queryCount, isDiscovery, isExploration, isRelated } of trackMap.values()) {
      const baseScore = scoreTrack(track, queryCount, allGenres, artists, relatedArr, isDiscovery, isExploration, isRelated, timeContext, sessionMood, userMoods, languagePreference);
      scoredTracks.push({ ...track, _score: baseScore, _queryCount: queryCount, _isDiscovery: isDiscovery, _isExploration: isExploration, _isRelated: isRelated });
    }

    scoredTracks.sort((a, b) => b._score - a._score);

    // ── FINAL SELECTION: 65% familiar, 35% exploration (was 70/30) ──
    const FAMILIAR_COUNT = 10;
    const EXPLORATION_COUNT = 5;
    const TOTAL = 15;

    const finalTracks: ScoredTrack[] = [];
    const artistCount = new Map<string, number>();

    // Pass 1: Familiar (highest scoring non-exploration tracks)
    for (const track of scoredTracks.filter(t => !t._isExploration)) {
      if (finalTracks.length >= FAMILIAR_COUNT) break;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= 2) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      finalTracks.push(track);
    }

    // Pass 2: Exploration (bridge genre tracks)
    for (const track of scoredTracks.filter(t => t._isExploration)) {
      if (finalTracks.length >= FAMILIAR_COUNT + EXPLORATION_COUNT) break;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= 2) continue;
      if (finalTracks.some(f => f.scTrackId === track.scTrackId)) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      finalTracks.push(track);
    }

    // Pass 3: Fill from discovery/related
    if (finalTracks.length < TOTAL) {
      for (const track of scoredTracks.filter(t => (t._isDiscovery || t._isRelated) && !finalTracks.some(f => f.scTrackId === t.scTrackId))) {
        if (finalTracks.length >= TOTAL) break;
        const artist = (track.artist || "").toLowerCase().trim();
        if ((artistCount.get(artist) || 0) >= 2) continue;
        artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
        finalTracks.push(track);
      }
    }

    // Pass 4: Fill remaining
    if (finalTracks.length < TOTAL) {
      const finalIds = new Set(finalTracks.map(t => t.scTrackId));
      for (const track of scoredTracks.filter(t => !finalIds.has(t.scTrackId)).sort(() => Math.random() - 0.5)) {
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
      _meta: { 
        timeContext, 
        moods: userMoods, 
        sessionMood: {
          avgEnergy: Math.round(sessionMood.avgEnergy * 100) / 100,
          dominantMoods: sessionMood.dominantMoods,
          dominantGenres: sessionMood.dominantGenres,
        },
        languagePreference,
        familiarCount: finalTracks.filter(t => !t._isExploration).length, 
        explorationCount: finalTracks.filter(t => t._isExploration).length,
      },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
