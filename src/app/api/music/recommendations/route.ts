import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { RECOMMENDATIONS_CONFIG as CFG } from "@/config/recommendations";

/**
 * Smart Recommendations API v8 — "Taste DNA" Edition.
 *
 * Fundamental shift from v7: instead of generic genre queries returning random music,
 * this version is built around what the user ACTUALLY listened to and liked.
 *
 * Key changes from v7:
 * 1. SOUNDCloud RELATED API IS PRIMARY — For each liked/recent track, calls
 *    /tracks/{scTrackId}/related to get genuinely similar music from SoundCloud.
 * 2. ARTIST SEARCH IS SECONDARY — Searches for user's top artists with smart queries.
 * 3. GENRE QUERIES ARE FALLBACK ONLY — Only used when we lack history/likes data.
 * 4. SIMPLER, MORE EFFECTIVE SCORING — Tracks from SC related are scored highest,
 *    followed by artist matches, then genre matches.
 * 5. CATEGORIZED OUTPUT — Returns tracks in rows like "Похожие на {artist}",
 *    "Для вас", "Открытия".
 *
 * New parameters from client:
 * - likedScIds: comma-separated SoundCloud track IDs from user's liked tracks
 * - historyScIds: comma-separated SoundCloud track IDs from recent history
 */

// ── Cache (6 min TTL) ──
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

// ── Genre-specific query templates (used as FALLBACK only) ──
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

// ── Genre relationship graph ──
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

// v12: Expanded spam-prone genres (these have high noise/spam ratio on SoundCloud)
const SPAM_PRONE_GENRES = ["deep house", "soulful house", "club house", "tech house", "jackin house"];

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
function getBridgeGenres(userGenres: string[]): string[] {
  const userSet = new Set(userGenres.map(g => g.toLowerCase().trim()));
  const firstHop = new Set<string>();

  for (const ug of userGenres) {
    for (const rg of getRelatedGenres(ug)) {
      const rgNorm = rg.toLowerCase().trim();
      if (!userSet.has(rgNorm) && !isSpamProneGenre(rgNorm)) {
        firstHop.add(rgNorm);
      }
    }
  }

  const secondHop = new Set<string>();
  for (const fh of [...firstHop].sort(() => Math.random() - 0.5).slice(0, 5)) {
    for (const rg of getRelatedGenres(fh)) {
      const rgNorm = rg.toLowerCase().trim();
      if (!userSet.has(rgNorm) && !firstHop.has(rgNorm) && !isSpamProneGenre(rgNorm)) {
        secondHop.add(rgNorm);
      }
    }
  }

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

// ── Internal track metadata for scoring ──
interface InternalTrack {
  track: SCTrack;
  /** True if came from fetchSCTrackRelated for a liked track */
  isFromLikedRelated: boolean;
  /** True if came from fetchSCTrackRelated for a history track */
  isFromHistoryRelated: boolean;
  /** True if came from an artist search */
  isFromArtistSearch: boolean;
  /** True if came from a genre fallback search */
  isFromGenreFallback: boolean;
  /** True if came from bridge genre exploration */
  isFromBridgeGenre: boolean;
  /** The source query that found this track */
  sourceQuery: string;
}

const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

// v14: Promo / spam / low-effort content keywords — HARD FILTER
// Only real spam, promo, and AI garbage. Legitimate track metadata words ("official audio",
// "slowed", "nightcore", "bass boost", "radio edit", etc.) are NOT here — those go to soft filter.
const PROMO_SPAM_KEYWORDS = [
  // Promo / beat-selling spam
  "free download", "free beat", "free instrumental", "type beat", "type beat free",
  "free dl", "free download link", "download free", "grab free",
  "subscribe", "follow me", "follow for", "link in bio", "link in desc",
  "buy now", "purchase", "shop now", "merch", "merchandise",
  // AI-generated content (instant reject)
  "made by ai", "ai generated", "suno", "udio", "ai music",
  "generated by", "cover by ai", "ai cover", "ai remix", "ai vocals",
  "chatgpt", "openai", "gemini ai", "claude ai", "gemini music",
  "ai track", "ai sing", "made with ai", "created with ai", "generated with suno",
  "ai beat", "ai producer", "ai artist", "ai song", "chatgpt song",
  // Low-effort / test content
  "test", "testing", "mic test", "audio test", "raw recording",
  "untitled", "no name", "unnamed track", "rough mix",
  // Clickbait / spam compilations
  "must hear", "best of", "top 50", "top 100", "non stop", "nonstop",
  "non stop mix", "back to back", "24 7",
  // Live / DJ sets (not individual tracks)
  "live set", "dj set", "live mix", "radio show", "podcast ep",
  // Tutorial / educational
  "tutorial", "how to", "lesson", "course", "masterclass", "workshop",
  // Ringtone / notification
  "ringtone", "notification", "alarm", "sms tone", "alert sound",
  // Social media spam in titles
  "snapchat", "onlyfans", "patreon", "donate", "support the artist",
  // Promo packaging
  "snippet", "teaser", "coming soon", "dropping soon",
  "feat. prod", "instrumental produced", "beat produced",
  // Pack compilations (not real tracks)
  "mashup pack", "remix pack", "bootleg pack", "edit pack",
  // Low-quality covers / style clones
  "covers ep", "covers album", "tribute to", "in the style of",
  "visualizer", "visualiser", "animated video",
];

// v14: Soft spam keywords — these score a PENALTY but don't hard-exclude
// These are words that appear in legitimate track titles but also in low-quality content
const SOFT_SPAM_KEYWORDS = [
  "official audio", "official video", "lyric video", "lyrics video",
  "slowed", "sped up", "nightcore", "bass boost", "reverb mix",
  "explicit", "clean version", "radio edit", "album version",
  "out now", "available now", "stream now", "new song",
  "x original", "original song", "official song", "debut single",
  "prod by", "produced by", "beat by", "demo version",
  "playlist", "mixtape", "sample",
];

function hasSoftSpamKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SOFT_SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

// v13: Keywords that indicate AI-generated or very low-quality content
const AI_GENERATED_KEYWORDS = [
  "suno", "udio", "suno ai", "udio ai", "ai song", "ai music", "ai generated",
  "made with ai", "created with ai", "generated with suno",
  "ai vocals", "ai cover", "ai remix", "chatgpt song",
  "made by ai", "ai beat", "ai producer", "ai artist",
];

// v13: Patterns indicating generic/boring titles (no creative effort)
const GENERIC_TITLE_PATTERNS = [
  /^(track \d+|untitled|no title|unknown)$/i,
  /^(beat \d+|instrumental \d+|song \d+)$/i,
  /^[a-z\d_]+$/, // Only lowercase alphanumeric + underscore (auto-generated)
  /^(.)\1{4,}$/, // Same character repeated 4+ times
];

// v13: Domains/URLs in titles = spam
const DOMAIN_PATTERNS = [
  ".com", ".io", ".net", ".org", ".gg", ".co",
  "soundcloud.com", "spotify.com", "youtube.com",
  "instagram.com", "tiktok.com", "twitter.com",
  "linktr.ee", "lnk.bio", "bit.ly",
];

// v13: Repeat artist spam detection — same name pattern from SC spam bots
const SPAM_ARTIST_PATTERNS = [
  /^(dj\s|mc\s|dj_)/i,  // Common spam artist prefixes when combined with generic suffixes
  /^(.{2,5})\s+\1\s+\1/i, // Repeated name
];

// v13: Artist name quality check
function isSpamArtistName(artistName: string): boolean {
  const lower = artistName.toLowerCase().trim();
  // Too short
  if (lower.length < 2) return true;
  // All special characters or digits
  if (/^[^a-zA-Zа-яА-Я]+$/.test(lower)) return true;
  // Contains URL
  if (DOMAIN_PATTERNS.some(d => lower.includes(d))) return true;
  // Contains excessive special chars
  const specialRatio = [...lower].filter(c => /[^a-zA-Zа-яА-Я0-9\s]/.test(c)).length / lower.length;
  if (specialRatio > 0.25) return true;
  // Repeated pattern (e.g. "aaaaaabbbbbb")
  if (/(.)\1{5,}/.test(lower)) return true;
  return false;
}

// v13: AI-generated content check
function isAIGeneratedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_GENERATED_KEYWORDS.some(kw => lower.includes(kw));
}

// v13: Generic/boring title check
function isGenericTitle(title: string): boolean {
  if (!title || title.trim().length < 2) return true;
  return GENERIC_TITLE_PATTERNS.some(p => p.test(title.trim()));
}

// v13: Title contains URL/domain = spam
function titleContainsUrl(title: string): boolean {
  const lower = title.toLowerCase();
  return DOMAIN_PATTERNS.some(d => lower.includes(d));
}

// v13: Remix/cover spam — too many variants of the same song flooding SC
// If title suggests it's a remix/cover/mashup but from unknown artist, it's likely low quality
const REMIX_COVER_KEYWORDS = ["remix", "cover", "mashup", "bootleg", "flip", "reflip", "rework", "edit", "mix", "version", "vip mix", "re-edit", "dub", "instrumental"];

function isRemixFromUnknown(title: string, artist: string, topArtists: string[]): boolean {
  const lower = title.toLowerCase();
  const hasRemix = REMIX_COVER_KEYWORDS.some(kw => lower.includes(kw));
  if (!hasRemix) return false;
  const artistLower = artist.toLowerCase().trim();
  // If the artist is one of user's top artists, it's likely a legitimate remix
  if (topArtists.some(a => artistLower.includes(a.toLowerCase()) || a.toLowerCase().includes(artistLower))) return false;
  return true;
}

// v12: Genres that tend to have high spam/low-quality content on SoundCloud
const LOW_QUALITY_GENRES = [
  "deep house", "soulful house", "club house", "jackin house",
  "progressive house", "tech house",  // often filled with AI/dJ spam
];

function hasPromoSpamKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMO_SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

// v13: Combined content quality score — returns 0-100, below threshold = filtered
function contentQualityScore(track: SCTrack, allGenres: string[], topArtists: string[]): number {
  let score = 100;
  const title = (track.title || "").trim();
  const artist = (track.artist || "").trim();
  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  const titleLen = title.length;
  const combined = `${title} ${artist}`.toLowerCase();

  // No title or too short
  if (titleLen < 3) return 0;
  if (titleLen < 5) score -= 30;

  // AI-generated content
  if (isAIGeneratedContent(combined)) return 0;

  // Generic/boring title
  if (isGenericTitle(title)) score -= 50;

  // Title contains URL/domain
  if (titleContainsUrl(title)) return 0;

  // Spam artist name
  if (isSpamArtistName(artist)) score -= 60;

  // Title is all caps (usually spam)
  if (title === title.toUpperCase() && titleLen > 3) score -= 25;

  // Excessive special characters
  if (titleLen > 5) {
    const specialCount = [...title].filter(c => /[^a-zA-Zа-яА-Я0-9\s]/.test(c)).length;
    if (specialCount / titleLen > 0.2) score -= 30;
    if (specialCount / titleLen > 0.35) score -= 40;
  }

  // Very long title (likely keyword stuffing)
  if (titleLen > 80) score -= 20;
  if (titleLen > 120) return 5;

  // Remix from unknown artist
  if (isRemixFromUnknown(title, artist, topArtists)) score -= 35;

  // Preview-only from unknown artist (likely low quality)
  if (!track.scIsFull && !topArtists.some(a => artistLower.includes(a.toLowerCase()) || a.toLowerCase().includes(artistLower))) {
    score -= 30;
  }

  // Duration too short or too long
  if (track.duration > 0) {
    if (track.duration < 60) score -= 40;
    if (track.duration > 600) score -= 15; // >10 min may be DJ set/mix
    if (track.duration > 1200) score -= 40; // >20 min definitely not a proper track
  }

  // No genre metadata at all
  if (!track.genre || track.genre.trim().length === 0) score -= 15;

  // Repetitive words in title
  const words = titleLower.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 3 && uniqueWords.size < words.length * 0.5) score -= 20;

  // SoundCloud spam: title is just artist name + generic suffix
  if (titleLower.startsWith(artistLower) && titleLower.length < artistLower.length + 20) score -= 15;

  return Math.max(0, score);
}

function isLowQualityGenre(genre: string): boolean {
  const lower = (genre || "").toLowerCase().trim();
  return LOW_QUALITY_GENRES.some(lq => lower === lq || lower.includes(lq));
}

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

// ── Fetch SoundCloud related tracks (PRIMARY data source in v8) ──
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

// ── Time-of-day energy weighting ──
// Returns preferred energy range based on time of day
function getTimeEnergyPreference(timeContext: TimeContext): { minEnergy: number; maxEnergy: number; weight: number } {
  switch (timeContext) {
    case "morning": return { minEnergy: 0.4, maxEnergy: 0.9, weight: 12 };      // Upbeat, energizing
    case "afternoon": return { minEnergy: 0.3, maxEnergy: 0.85, weight: 8 };     // Moderate energy, focus-friendly
    case "evening": return { minEnergy: 0.15, maxEnergy: 0.65, weight: 12 };    // Winding down, calmer
    case "night": return { minEnergy: 0.05, maxEnergy: 0.4, weight: 15 };       // Very calm, ambient
    case "weekend": return { minEnergy: 0.3, maxEnergy: 0.8, weight: 6 };       // Relaxed but varied
    case "friday_evening": return { minEnergy: 0.5, maxEnergy: 1.0, weight: 10 }; // High energy, party mood
    default: return { minEnergy: 0, maxEnergy: 1, weight: 0 };
  }
}

// ── v11 Scoring: config-driven weights + confidence-proportional jitter + serendipity + time-of-day energy ──
function scoreTrackV8(
  track: SCTrack,
  meta: InternalTrack,
  topGenres: string[],
  topArtists: string[],
  languagePreference: "russian" | "english" | "latin" | "mixed",
  feedbackData?: {
    genreBoost: Record<string, number>;
    artistBoost: Record<string, number>;
    skipGenrePenalty: Set<string>;
    completedGenres: Set<string>;
  },
  timeContext?: TimeContext,
): number {
  let score = 0;
  const trackGenre = normalizeGenre(track.genre || "");
  const trackArtist = (track.artist || "").toLowerCase().trim();

  // ── PHASE ORIGIN BONUS (the most important signal) ──
  // Config: CFG.scoring.relatedLiked / relatedHistory
  if (meta.isFromLikedRelated) score += CFG.scoring.relatedLiked;
  else if (meta.isFromHistoryRelated) score += CFG.scoring.relatedHistory;

  // ── ARTIST MATCH ──
  // Config: CFG.scoring.artistExact / artistPartial
  let hasArtistMatch = false;
  if (trackArtist) {
    for (const a of topArtists) {
      const aLower = a.toLowerCase().trim();
      if (trackArtist === aLower) { score += CFG.scoring.artistExact; hasArtistMatch = true; break; }
      else if (trackArtist.includes(aLower) || aLower.includes(trackArtist)) {
        score += CFG.scoring.artistPartial; hasArtistMatch = true; break;
      }
    }
  }

  // ── SAME ARTIST PENALTY (diversity enforcement) ──
  // Penalize tracks from the same artist as the seed to encourage variety.
  // The topArtists array often contains the current track's artist,
  // so we need to balance discovery with familiarity.
  if (trackArtist && topArtists.length > 0) {
    const isTopArtist = topArtists.some(a => trackArtist === a.toLowerCase().trim());
    if (isTopArtist && meta.isFromArtistSearch) {
      score -= 20; // Soft penalty for top artist found via artist search (too much repetition)
    }
  }

  // ── GENRE MATCH ──
  // Config: CFG.scoring.genreExact / genrePartial
  if (trackGenre) {
    for (const g of topGenres) {
      const normalized = normalizeGenre(g);
      if (trackGenre === normalized) { score += CFG.scoring.genreExact; break; }
      else if (trackGenre.includes(normalized) || normalized.includes(trackGenre)) { score += CFG.scoring.genrePartial; break; }
    }
  }

  // ── SERENDIPITY BOOST (v12: reduced for genre fallback, stronger for bridge genres)
  // Reward tracks from genres the user rarely encounters (encourages discovery)
  // But only for high-confidence sources (related tracks, artist search)
  // Genre fallback + serendipity = too random, so we gate it
  if (trackGenre && feedbackData && !meta.isFromLikedRelated && !meta.isFromHistoryRelated) {
    const genreBoostValue = feedbackData.genreBoost[trackGenre] || 0;
    // Only give serendipity bonus for non-fallback sources (artist search, bridge)
    if (!meta.isFromGenreFallback && Math.abs(genreBoostValue) < 5) {
      score += CFG.scoring.serendipityBonus;
    }
  }

  // v12: GENRE RELEVANCE GATE for genre fallback tracks
  // If track came from genre fallback and genre doesn't match user's profile at all,
  // apply a significant penalty to prevent random junk
  if (meta.isFromGenreFallback && trackGenre && topGenres.length > 0) {
    const genreNormalized = normalizeGenre(trackGenre);
    const hasAnyRelation = topGenres.some(tg => {
      const tgn = normalizeGenre(tg);
      return genreNormalized === tgn || genreNormalized.includes(tgn) || tgn.includes(genreNormalized);
    });
    const relatedGenres = getRelatedGenres(genreNormalized);
    const hasRelatedMatch = topGenres.some(tg => relatedGenres.includes(normalizeGenre(tg)));
    if (!hasAnyRelation && !hasRelatedMatch) {
      score -= 40; // Significant penalty for completely unrelated genre fallback tracks
    }
  }

  // ── LANGUAGE PREFERENCE ──
  // Config: CFG.scoring.languageMatch
  if (languagePreference !== "mixed") {
    const trackText = `${track.title || ""} ${track.artist || ""}`;
    const trackLang = detectLanguage(trackText);
    if (trackLang === languagePreference) score += CFG.scoring.languageMatch;
  }

  // v14: Soft spam penalty — tracks with promo-flavored titles score lower
  // (e.g. "official audio", "slowed + reverb", "radio edit") but aren't excluded
  const softSpamText = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasSoftSpamKeywords(softSpamText)) score -= 12;

  // v12: LANGUAGE MISMATCH PENALTY — penalize tracks in the wrong language
  // If user clearly prefers a language, heavily penalize tracks in a completely different language
  if (languagePreference !== "mixed" && topGenres.length > 0) {
    const trackText = `${track.title || ""} ${track.artist || ""}`;
    const trackLang = detectLanguage(trackText);
    if (languagePreference === "russian" && trackLang === "english") score -= 15;
    if (languagePreference === "english" && trackLang === "russian") score -= 15;
  }

  // ── PLAYABILITY ──
  // Config: CFG.scoring.playability
  if (track.scIsFull) score += CFG.scoring.playability;

  // ── COVER ART ──
  // Config: CFG.scoring.coverArt
  if (track.cover) score += CFG.scoring.coverArt;

  // ── HARD PENALTIES ──
  // -200: Disliked artist
  // (handled before scoring via hard filter, but also here for safety)
  // -200: Disliked genre
  // (handled before scoring via hard filter)

  // Config: CFG.scoring.noisePenalty
  const titleAndArtist = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleAndArtist) && !userWantsReligiousContent(topGenres)) score -= CFG.scoring.noisePenalty;
  if (titleHashtagGenreMismatch(track.title || "", topGenres)) score -= CFG.scoring.hashtagMismatchPenalty;

  // ── ADAPTIVE FEEDBACK SCORING (v9 self-learning) ──
  // Config: CFG.scoring.skipGenrePenalty / completedGenreBonus
  // Boost/penalize based on accumulated user behavior
  if (feedbackData) {
    if (trackGenre && feedbackData.genreBoost[trackGenre]) {
      score += feedbackData.genreBoost[trackGenre];
    }
    if (trackArtist && feedbackData.artistBoost[trackArtist]) {
      score += feedbackData.artistBoost[trackArtist];
    }
    if (trackGenre && feedbackData.skipGenrePenalty.has(trackGenre)) {
      score -= CFG.scoring.skipGenrePenalty;
    }
    if (trackGenre && feedbackData.completedGenres.has(trackGenre)) {
      score += CFG.scoring.completedGenreBonus;
    }
  }

  // ── TIME-OF-DAY ENERGY MATCHING (v11) ──
  // Prefer tracks with energy matching the time of day
  if (timeContext) {
    const energyPref = getTimeEnergyPreference(timeContext);
    const trackEnergy = estimateEnergy(track);
    if (trackEnergy >= energyPref.minEnergy && trackEnergy <= energyPref.maxEnergy) {
      score += energyPref.weight;
    } else {
      // Mild penalty for energy mismatch (not too harsh — allow variety)
      const distance = trackEnergy < energyPref.minEnergy
        ? energyPref.minEnergy - trackEnergy
        : trackEnergy - energyPref.maxEnergy;
      if (distance > 0.3) score -= Math.min(energyPref.weight * 0.5, distance * 10);
    }
  }

  // ── Confidence-proportional jitter (v11) ──
  // Higher-confidence matches get less jitter for more stable rankings
  const confidence = meta.isFromLikedRelated ? 1.0 : meta.isFromHistoryRelated ? 0.8 : meta.isFromArtistSearch ? 0.6 : meta.isFromGenreFallback ? 0.4 : 0.3;
  const maxJitter = confidence >= 0.8 ? CFG.scoring.highConfidenceJitter : CFG.scoring.maxJitter;
  score += (Math.random() - 0.5) * 2 * maxJitter;

  return score;
}

// ── Hard filter: should this track be excluded entirely? ──
function shouldExcludeTrack(
  track: SCTrack,
  allGenres: string[],
  excludeIds: Set<string>,
  dislikedIds: Set<string>,
  recentIds: Set<string>,
  dislikedArtists: Set<string>,
  dislikedGenres: Set<string>,
): boolean {
  // Already excluded / disliked / recently played
  if (excludeIds.has(track.id) || excludeIds.has(String(track.scTrackId))) return true;
  if (dislikedIds.has(track.id)) return true;
  if (recentIds.has(track.id) || recentIds.has(String(track.scTrackId))) return true;

  // Disliked artist
  if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) return true;

  // Disliked genre
  if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) return true;

  // Religious content filter
  if (!userWantsReligiousContent(allGenres)) {
    const genreLower = (track.genre || "").toLowerCase();
    const titleLower = (track.title || "").toLowerCase();
    const userWantsDeepHouse = allGenres.some(g => {
      const n = normalizeGenre(g);
      return n === "deep house" || n.includes("deep house");
    });
    if (!userWantsDeepHouse && (genreLower.includes("deep house") || titleLower.includes("deep house"))) return true;
  }

  // Must have cover art
  if (!track.cover) return true;

  // Duration filter (too short = likely not a real track)
  if (track.duration && track.duration < 30) return true;

  // Noise content
  const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleArtistNoise) && !userWantsReligiousContent(allGenres)) return true;

  // Hashtag genre mismatch
  if (titleHashtagGenreMismatch(track.title || "", allGenres)) return true;

  // v12: Promo/spam/low-effort content filter
  const titleArtistPromo = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasPromoSpamKeywords(titleArtistPromo)) return true;

  // v12: Low-quality genre gate (unless user explicitly likes these genres)
  if (!isLowQualityGenreMatch(allGenres) && isLowQualityGenre(track.genre || "")) return true;

  // v12: Extremely short titles (likely garbage)
  const titleLen = (track.title || "").trim().length;
  if (titleLen > 0 && titleLen < 3) return true;

  // v12: Title consists of only special characters (no real content)
  if (titleLen > 0 && /^[^a-zA-Zа-яА-Я0-9]+$/.test(track.title || "")) return true;

  // v12: Title has excessive special character density (spam indicator)
  if (titleLen > 10) {
    const specialCount = (track.title || "").split('').filter(c => /[^a-zA-Zа-яА-Я0-9\s]/.test(c)).length;
    if (specialCount / titleLen > 0.3) return true;
  }

  // v13: AI-generated content hard filter
  if (isAIGeneratedContent(titleArtistPromo)) return true;

  // v13: Generic/boring title
  if (isGenericTitle(track.title || "")) return true;

  // v13: Title contains URL/domain
  if (titleContainsUrl(track.title || "")) return true;

  // v13: Spam artist name
  if (isSpamArtistName(track.artist || "")) return true;

  // v13: Duration gates
  if (track.duration > 0 && track.duration > 1200) return true; // >20 min = not a real track

  return false;

  // v12: Check if user's genres include any low-quality genres
  function isLowQualityGenreMatch(userGenres: string[]): boolean {
    return userGenres.some(g => isLowQualityGenre(g));
  }
}

// ── Artist-aware interleaving to prevent consecutive same-artist tracks ──
// Reorders tracks so that no more than `maxConsecutive` tracks from the same
// artist appear back-to-back. Preserves the overall score ranking as much as
// possible while improving listening variety.
function interleaveByArtist<T extends { artist: string }>(tracks: T[], maxConsecutive: number = 1, maxPerArtist: number = 2): T[] {
  if (tracks.length <= 2) return tracks;

  const result: T[] = [];
  const recentArtists: string[] = []; // circular buffer of recent artist names
  const artistFrequency = new Map<string, number>(); // total count per artist in result

  // Work with a mutable copy so we can remove picked tracks
  const remaining = [...tracks];

  while (remaining.length > 0) {
    // Count how many of the last `maxConsecutive` entries are from the same artist
    const tailArtist = recentArtists.length > 0
      ? recentArtists[recentArtists.length - 1]
      : null;
    const consecutiveCount = tailArtist
      ? recentArtists.filter(a => a === tailArtist).length
      : 0;

    // Find the best (first = highest score) track that satisfies diversity constraints
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const artist = (remaining[i].artist || "").toLowerCase().trim();
      // Skip if already at max total frequency for this artist
      const freq = artistFrequency.get(artist) || 0;
      if (freq >= maxPerArtist) continue;
      // Skip if consecutive limit reached
      if (artist === tailArtist && consecutiveCount >= maxConsecutive) continue;
      // Accept this track
      pickedIdx = i;
      break;
    }

    // Fallback: if all remaining are from same artist or at frequency limit, take the first non-consecutive
    if (pickedIdx === -1) {
      for (let i = 0; i < remaining.length; i++) {
        const artist = (remaining[i].artist || "").toLowerCase().trim();
        if (artist !== tailArtist) { pickedIdx = i; break; }
      }
    }
    // Ultimate fallback: take the first remaining
    if (pickedIdx === -1) pickedIdx = 0;

    const picked = remaining.splice(pickedIdx, 1)[0];
    const pickedArtist = (picked.artist || "").toLowerCase().trim();
    result.push(picked);

    // Update frequency tracking
    artistFrequency.set(pickedArtist, (artistFrequency.get(pickedArtist) || 0) + 1);

    // Update recent artists circular buffer
    recentArtists.push(pickedArtist);
    if (recentArtists.length > maxConsecutive) {
      recentArtists.shift();
    }
  }

  return result;
}

// ── Mapped track for output (v10: includes confidence and reason) ──
interface MappedTrack {
  id: string; title: string; artist: string; album: string;
  cover: string; duration: number; genre: string;
  audioUrl: string; previewUrl: string; source: string;
  scTrackId: number; scStreamPolicy: string; scIsFull: boolean;
  _score: number;
  _confidence?: "high" | "medium" | "low";
  _reason?: string;
}

function mapTrack(track: SCTrack, score: number, meta?: InternalTrack): MappedTrack {
  let _confidence: "high" | "medium" | "low" = "low";
  let _reason = "genre_fallback";

  if (meta) {
    if (meta.isFromLikedRelated) { _confidence = "high"; _reason = "related_to_liked"; }
    else if (meta.isFromHistoryRelated) { _confidence = "high"; _reason = "related_to_history"; }
    else if (meta.isFromArtistSearch) { _confidence = "medium"; _reason = "artist_match"; }
    else if (meta.isFromBridgeGenre) { _confidence = "medium"; _reason = "discovery"; }
    else if (meta.isFromGenreFallback) { _confidence = "low"; _reason = "genre_fallback"; }

    // Upgrade confidence if multiple signals agree
    const signalCount = [meta.isFromLikedRelated, meta.isFromHistoryRelated, meta.isFromArtistSearch, meta.isFromGenreFallback, meta.isFromBridgeGenre].filter(Boolean).length;
    if (signalCount >= 2 && _confidence === "medium") _confidence = "high";
  }

  return {
    id: track.id, title: track.title, artist: track.artist, album: track.album,
    cover: track.cover, duration: track.duration, genre: track.genre,
    audioUrl: track.audioUrl, previewUrl: track.previewUrl, source: track.source,
    scTrackId: track.scTrackId, scStreamPolicy: track.scStreamPolicy, scIsFull: track.scIsFull,
    _score: Math.round(score),
    _confidence,
    _reason,
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ── Parse parameters ──
  const genresParam = searchParams.get("genres");
  const artistsParam = searchParams.get("artists");
  const excludeParam = searchParams.get("excludeIds");
  const dislikedParam = searchParams.get("dislikedIds");
  const dislikedArtistsParam = searchParams.get("dislikedArtists");
  const dislikedGenresParam = searchParams.get("dislikedGenres");
  const recentIdsParam = searchParams.get("recentIds") || "";
  const sessionParam = searchParams.get("session");
  const langParam = searchParams.get("lang") || "mixed";

  // v8 NEW parameters
  const likedScIdsParam = searchParams.get("likedScIds") || "";
  const historyScIdsParam = searchParams.get("historyScIds") || "";
  // v9: Feedback signals for self-learning
  const feedbackParam = searchParams.get("feedback") || "";

  const excludeIds = new Set((excludeParam || "").split(",").filter(Boolean));
  const dislikedIds = new Set((dislikedParam || "").split(",").filter(Boolean));
  const dislikedArtists = new Set((dislikedArtistsParam || "").split(",").filter(Boolean).map(a => a.toLowerCase()));
  const dislikedGenres = new Set((dislikedGenresParam || "").split(",").filter(Boolean).map(g => normalizeGenre(g)));
  const recentIds = new Set((recentIdsParam || "").split(",").filter(Boolean));

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 5) : [];

  // Parse liked SoundCloud track IDs (most recent first — client sends them in order)
  const likedScIds: number[] = likedScIdsParam
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter(n => !isNaN(n) && n > 0);

  // Parse history SoundCloud track IDs (most recent first)
  const historyScIds: number[] = historyScIdsParam
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter(n => !isNaN(n) && n > 0);

  const timeContext = getTimeContext();

  // ── Cold Start Detection (v10) ──
  const isColdStart = likedScIds.length < CFG.coldStart.minLikedForFullMode && historyScIds.length < CFG.coldStart.minHistoryForFullMode;
  if (isColdStart) {
    console.log(`[rec] Cold start user: ${likedScIds.length} likes, ${historyScIds.length} history — boosting exploration`);
  }

  // Parse session tracks (kept for language/mood context)
  let sessionTracks: SessionTrack[] = [];
  if (sessionParam) {
    try {
      sessionTracks = JSON.parse(sessionParam);
    } catch { /* ignore */ }
  }

  // Build session mood profile (used for language preference + bridge genres)
  const sessionMood = buildSessionMood(sessionTracks);

  // Merge session genres into user genres
  const allGenres = [...new Set([...genres, ...sessionMood.dominantGenres])].slice(0, 6);

  // Language preference: explicit param > session analysis > mixed
  // v9: Parse feedback signals for adaptive scoring
  interface FeedbackSignal {
    genreBoost: Record<string, number>;   // genre -> boost score (-100 to +100)
    artistBoost: Record<string, number>;  // artist -> boost score (-100 to +100)
    skipGenrePenalty: Set<string>;        // genres with high skip rate
    completedGenres: Set<string>;         // genres with completions
  }
  let feedbackData: FeedbackSignal = { genreBoost: {}, artistBoost: {}, skipGenrePenalty: new Set(), completedGenres: new Set() };
  if (feedbackParam) {
    try {
      const parsed = JSON.parse(feedbackParam);
      feedbackData = {
        genreBoost: parsed.genreBoost || {},
        artistBoost: parsed.artistBoost || {},
        skipGenrePenalty: new Set(parsed.skipGenrePenalty || []),
        completedGenres: new Set(parsed.completedGenres || []),
      };
    } catch { /* ignore */ }
  }

  const languagePreference: "russian" | "english" | "latin" | "mixed" =
    (langParam !== "mixed" ? langParam : null) as "russian" | "english" | "latin" | null
    || sessionMood.languagePreference;

  // ── Cache check ──
  const cacheKey = `rec:v9:${likedScIdsParam}:${historyScIdsParam}:${genresParam || ""}:${artistsParam || ""}:${dislikedParam || ""}:${dislikedArtistsParam || ""}:${dislikedGenresParam || ""}:${recentIdsParam}:${langParam}:${sessionParam || ""}:${feedbackParam}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // ════════════════════════════════════════════════
    // PHASE 1: RELATED TRACKS (highest priority, ~60%)
    // ════════════════════════════════════════════════
    const relatedPromises: { promise: Promise<SCTrack[]>; fromLiked: boolean }[] = [];

    // Take up to N liked track IDs (config-driven, reduced for cold start)
    const maxLiked = isColdStart ? 2 : CFG.phases.relatedApi.maxLikedTracks;
    const maxHistory = isColdStart ? 1 : CFG.phases.relatedApi.maxHistoryTracks;
    for (const scId of likedScIds.slice(0, maxLiked)) {
      relatedPromises.push({ promise: fetchSCTrackRelated(scId), fromLiked: true });
    }
    // Take up to N history track IDs
    for (const scId of historyScIds.slice(0, maxHistory)) {
      relatedPromises.push({ promise: fetchSCTrackRelated(scId), fromLiked: false });
    }

    // Also exclude the source IDs themselves from results
    const sourceScIds = new Set<number>([...likedScIds, ...historyScIds]);

    // ════════════════════════════════════════════════
    // PHASE 2: ARTIST SEARCH (medium priority, ~25%)
    // ════════════════════════════════════════════════
    const artistSearchPromises: Promise<SCTrack[]>[] = [];
    for (const artist of artists.slice(0, CFG.phases.artistSearch.maxArtists)) {
      // Search for artist name (quoted for exact match)
      artistSearchPromises.push(searchSCTracks(`"${artist}"`, 15));
      // Combine with top genre if available
      if (allGenres.length > 0) {
        artistSearchPromises.push(searchSCTracks(`${artist} ${allGenres[0]}`, 10));
      }
    }

    // ════════════════════════════════════════════════
    // PHASE 3: GENRE FALLBACK (low priority, ~15%)
    // Only used if we don't have enough data from phases 1-2
    // ════════════════════════════════════════════════
    const needGenreFallback = likedScIds.length < CFG.phases.genreFallback.minLikedForSkip && historyScIds.length < CFG.phases.genreFallback.minHistoryForSkip;

    const genreSearchPromises: Promise<SCTrack[]>[] = [];
    if (needGenreFallback && allGenres.length > 0) {
      // Pick 1-2 specific genre queries from user's top genre
      const topGenre = normalizeGenre(allGenres[0]);
      const templates = GENRE_QUERIES[topGenre] || GENRE_QUERIES[allGenres[0]?.toLowerCase().trim() || ""];
      if (templates) {
        const shuffled = templates.sort(() => Math.random() - 0.5);
        for (const tmpl of shuffled.slice(0, 2)) {
          genreSearchPromises.push(searchSCTracks(tmpl, 10));
        }
      }
      // Second genre if available
      if (allGenres.length > 1) {
        const secondGenre = normalizeGenre(allGenres[1]);
        const secondTemplates = GENRE_QUERIES[secondGenre] || GENRE_QUERIES[allGenres[1]?.toLowerCase().trim() || ""];
        if (secondTemplates) {
          const shuffled = secondTemplates.sort(() => Math.random() - 0.5);
          genreSearchPromises.push(searchSCTracks(shuffled[0], 10));
        }
      }
    }

    // Bridge genre exploration queries (used for "Открытия" category)
    // v10: Cold start users get more bridge genres for broader exploration
    const bridgeSearchPromises: Promise<SCTrack[]>[] = [];
    if (allGenres.length > 0) {
      const bridgeGenres = getBridgeGenres(allGenres.slice(0, 3));
      const bridgeLimit = isColdStart ? 5 : 3;
      for (const bg of bridgeGenres.slice(0, bridgeLimit)) {
        const templates = GENRE_QUERIES[bg];
        if (templates) {
          bridgeSearchPromises.push(searchSCTracks(templates.sort(() => Math.random() - 0.5)[0], 8));
        } else {
          bridgeSearchPromises.push(searchSCTracks(bg, 8));
        }
      }
    }

    // ── Execute all fetches in parallel ──
    const [relatedResults, artistResults, genreResults, bridgeResults] = await Promise.allSettled([
      Promise.all(relatedPromises.map(r => r.promise)),
      Promise.all(artistSearchPromises),
      Promise.all(genreSearchPromises),
      Promise.all(bridgeSearchPromises),
    ]);

    // ── Aggregate all tracks with metadata ──
    const trackMap = new Map<number, InternalTrack>();

    const addTrack = (
      track: SCTrack,
      isFromLikedRelated: boolean,
      isFromHistoryRelated: boolean,
      isFromArtistSearch: boolean,
      isFromGenreFallback: boolean,
      isFromBridgeGenre: boolean,
      sourceQuery: string,
    ) => {
      // Skip source tracks themselves
      if (sourceScIds.has(track.scTrackId)) return;

      // Hard filters
      if (shouldExcludeTrack(track, allGenres, excludeIds, dislikedIds, recentIds, dislikedArtists, dislikedGenres)) {
        return;
      }

      const existing = trackMap.get(track.scTrackId);
      if (existing) {
        // Upgrade source priority: if a track was found by a higher-priority source, upgrade it
        if (isFromLikedRelated && !existing.isFromLikedRelated) {
          existing.isFromLikedRelated = true;
          existing.isFromHistoryRelated = false;
          existing.sourceQuery = sourceQuery;
        } else if (isFromHistoryRelated && !existing.isFromHistoryRelated && !existing.isFromLikedRelated) {
          existing.isFromHistoryRelated = true;
          existing.sourceQuery = sourceQuery;
        } else if (isFromArtistSearch && !existing.isFromArtistSearch && !existing.isFromLikedRelated && !existing.isFromHistoryRelated) {
          existing.isFromArtistSearch = true;
        }
      } else {
        trackMap.set(track.scTrackId, {
          track,
          isFromLikedRelated,
          isFromHistoryRelated,
          isFromArtistSearch,
          isFromGenreFallback,
          isFromBridgeGenre,
          sourceQuery,
        });
      }
    };

    // Process PHASE 1 results (Related tracks)
    if (relatedResults.status === "fulfilled") {
      for (let i = 0; i < relatedResults.value.length; i++) {
        const tracks = relatedResults.value[i];
        if (!tracks) continue;
        const fromLiked = relatedPromises[i].fromLiked;
        for (const track of tracks) {
          addTrack(track, fromLiked, !fromLiked, false, false, false, `related:${track.scTrackId}`);
        }
      }
    }

    // Process PHASE 2 results (Artist search)
    if (artistResults.status === "fulfilled") {
      for (let i = 0; i < artistResults.value.length; i++) {
        const tracks = artistResults.value[i];
        if (!tracks) continue;
        const artistIdx = Math.floor(i / 2); // Each artist gets 2 queries
        const artistName = artists[artistIdx] || "";
        for (const track of tracks) {
          addTrack(track, false, false, true, false, false, `artist:${artistName}`);
        }
      }
    }

    // Process PHASE 3 results (Genre fallback)
    if (genreResults.status === "fulfilled") {
      for (let i = 0; i < genreResults.value.length; i++) {
        const tracks = genreResults.value[i];
        if (!tracks) continue;
        for (const track of tracks) {
          addTrack(track, false, false, false, true, false, `genre:${allGenres[i] || "fallback"}`);
        }
      }
    }

    // Process bridge genre results
    if (bridgeResults.status === "fulfilled") {
      for (const batch of bridgeResults.value) {
        if (!batch) continue;
        for (const track of batch) {
          addTrack(track, false, false, false, false, true, "bridge");
        }
      }
    }

    // ── Score all tracks ──
    // v10: Cold start users get exploration boost for bridge genre tracks
    const scoredTracks: { track: SCTrack; score: number; meta: InternalTrack; qualityScore: number }[] = [];
    for (const [scTrackId, meta] of trackMap.entries()) {
      // v14: Content quality gate — filter out obviously bad content BEFORE scoring
      const quality = contentQualityScore(meta.track, allGenres, artists);
      if (quality < 45) continue; // Hard minimum: below 45 = garbage (raised from 30)

      let score = scoreTrackV8(meta.track, meta, allGenres, artists, languagePreference, feedbackData, timeContext);
      if (isColdStart && meta.isFromBridgeGenre) {
        score += 15;
      }
      // v13: Quality bonus — higher quality content gets a small bonus to surface above borderline content
      score += Math.floor(quality / 25); // 0-4 bonus based on quality
      scoredTracks.push({ track: meta.track, score, meta, qualityScore: quality });
    }

    // Sort by score descending
    scoredTracks.sort((a, b) => b.score - a.score);

    // v13: CONTENT DEDUPLICATION — remove near-duplicate tracks (same title, different artist = remix spam)
    // Also remove tracks whose titles are very similar (Levenshtein-like simple check)
    const seenTitles = new Map<string, number>(); // normalized title -> count
    const dedupedTracks: typeof scoredTracks = [];
    for (const item of scoredTracks) {
      const title = (item.track.title || "").toLowerCase().trim();
      // Normalize: remove special chars, extra spaces, common suffixes
      const normalized = title
        .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, "")
        .replace(/\s+(remix|cover|edit|mix|version|instrumental|vip|bootleg|flip|dub|original|extended|radio|club|acoustic|live|unplugged).*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) continue;

      const existingCount = seenTitles.get(normalized) || 0;
      if (existingCount >= 1) continue; // Max 1 variant of same title (pick highest scored)
      seenTitles.set(normalized, existingCount + 1);
      dedupedTracks.push(item);
    }
    const scoredTracksFinal = dedupedTracks;

    // ════════════════════════════════════════════════
    // CATEGORIZED OUTPUT
    // ════════════════════════════════════════════════

    // Track IDs already placed in categories (to avoid duplication)
    const usedInCategory = new Set<number>();

    // ── "Похожие на {artist}" — up to 3 rows, one per top artist ──
    const artistRows: { id: string; title: string; icon: string; tracks: MappedTrack[] }[] = [];
    // Each artist row gets up to 50 tracks for the detail view
    const maxTracksPerArtistInRow = CFG.curated.trackLimit;

    for (const artist of artists.slice(0, 3)) {
      const aLower = artist.toLowerCase().trim();
      const artistTracks = scoredTracksFinal.filter(({ track }) => {
        const tArtist = (track.artist || "").toLowerCase().trim();
        return (tArtist === aLower || tArtist.includes(aLower) || aLower.includes(tArtist))
          && !usedInCategory.has(track.scTrackId);
      });

      // Lower minimum threshold since we want more content
      if (artistTracks.length >= 3) {
        // Relax artist diversity limit for artist-specific rows (allow up to 10 per artist since it's their own row)
        let artistLocalCount = new Map<string, number>();
        const selected: typeof artistTracks = [];
        for (const item of artistTracks) {
          if (selected.length >= maxTracksPerArtistInRow) break;
          const a = (item.track.artist || "").toLowerCase().trim();
          if ((artistLocalCount.get(a) || 0) >= Math.max(CFG.diversity.maxPerArtist, 3)) continue;
          artistLocalCount.set(a, (artistLocalCount.get(a) || 0) + 1);
          selected.push(item);
        }
        for (const { track } of selected) usedInCategory.add(track.scTrackId);
        artistRows.push({
          id: `artist_${aLower.replace(/\s+/g, '_')}`,
          title: `Похожие на ${artist}`,
          icon: "Mic2",
          tracks: selected.map(({ track, score, meta }) => mapTrack(track, score, meta)),
        });
      }
    }

    // ── "Для вас" — the best overall scored tracks ──
    // Apply artist diversity: no more than maxPerArtist tracks per artist in this row
    const forYouArtistCount = new Map<string, number>();
    const forYouTracks: { track: SCTrack; score: number; meta: InternalTrack }[] = [];
    for (const { track, score, meta } of scoredTracksFinal) {
      if (forYouTracks.length >= 50) break;
      if (usedInCategory.has(track.scTrackId)) continue;
      if (meta.isFromBridgeGenre) continue;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((forYouArtistCount.get(artist) || 0) >= CFG.diversity.maxPerArtist) continue;
      forYouArtistCount.set(artist, (forYouArtistCount.get(artist) || 0) + 1);
      forYouTracks.push({ track, score, meta });
    }
    // Interleave to prevent consecutive same-artist tracks
    const forYouInterleaved = interleaveByArtist(forYouTracks.map(({ track }) => track), 1, CFG.diversity.maxPerArtist);
    const forYouInterleavedIds = new Set(forYouInterleaved.map(t => t.scTrackId));
    for (const { track } of forYouTracks) usedInCategory.add(track.scTrackId);

    // ── "Открытия" — bridge genre exploration tracks ──
    // Apply artist diversity: no more than maxPerArtist tracks per artist
    const discoveryArtistCount = new Map<string, number>();
    const discoveryTracks: { track: SCTrack; score: number; meta: InternalTrack }[] = [];
    for (const { track, score, meta } of scoredTracksFinal) {
      if (discoveryTracks.length >= 50) break;
      if (!meta.isFromBridgeGenre) continue;
      if (usedInCategory.has(track.scTrackId)) continue;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((discoveryArtistCount.get(artist) || 0) >= CFG.diversity.maxPerArtist) continue;
      discoveryArtistCount.set(artist, (discoveryArtistCount.get(artist) || 0) + 1);
      discoveryTracks.push({ track, score, meta });
    }
    for (const { track } of discoveryTracks) usedInCategory.add(track.scTrackId);

    // ── Build flat track list (MUST always have 50 tracks) ──
    const TARGET_TRACKS = 50;
    const artistLimit = CFG.diversity.maxPerArtist;
    const flatTracks: MappedTrack[] = [];
    const artistCount = new Map<string, number>();
    const flatIds = new Set<number>();

    for (const { track, score, meta } of scoredTracksFinal) {
      if (flatTracks.length >= TARGET_TRACKS) break;
      const artist = (track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= artistLimit) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      flatIds.add(track.scTrackId);
      flatTracks.push(mapTrack(track, score, meta));
    }

    // ── INTERLEAVE: prevent consecutive same-artist tracks in flat list ──
    const interleavedFlat = interleaveByArtist(flatTracks, 1, CFG.diversity.maxPerArtist);
    // Replace flatTracks with the interleaved version
    flatTracks.length = 0;
    flatTracks.push(...interleavedFlat);

    // ── SUPPLEMENTARY PHASE: if we don't have 50, fetch more ──
    if (flatTracks.length < TARGET_TRACKS) {
      const needed = TARGET_TRACKS - flatTracks.length;
      console.log(`[rec] Only ${flatTracks.length}/${TARGET_TRACKS} tracks, fetching ${needed} more`);

      // Use top genres + time-of-day queries to fill
      const fillQueries: string[] = [];
      const timeQueries: Record<string, string[]> = {
        morning: ["morning vibes", "wake up music", "acoustic morning"],
        afternoon: ["afternoon hits", "workday music", "focus flow"],
        evening: ["evening chill", "night drive", "sunset vibes"],
        night: ["late night vibes", "midnight chill", "after hours"],
        weekend: ["weekend vibes", "saturday mood", "sunday chill"],
        friday_evening: ["friday night", "weekend start", "party pregame"],
      };

      // Time-appropriate queries
      const timeQs = timeQueries[timeContext] || timeQueries.evening;
      fillQueries.push(...timeQs);

      // Genre-based fill queries
      if (allGenres.length > 0) {
        for (const g of allGenres.slice(0, 3)) {
          const norm = normalizeGenre(g);
          const templates = GENRE_QUERIES[norm];
          if (templates) {
            fillQueries.push(templates[0], templates[templates.length > 2 ? 2 : 1]);
          } else {
            fillQueries.push(`${g} 2025`);
          }
        }
      }

      // Also try language-appropriate queries
      if (languagePreference === "russian") {
        fillQueries.push("русская музыка 2025", "русский рэп", "поп русская");
      }

      // Execute fill queries (up to 8)
      const fillResults = await Promise.allSettled(
        fillQueries.slice(0, 8).map(q => searchSCTracks(q, Math.ceil(needed / 4) + 5))
      );

      // Score and add supplementary tracks
      const fillMap = new Map<number, SCTrack>();
      for (const result of fillResults) {
        if (result.status !== "fulfilled") continue;
        for (const t of result.value) {
          if (!fillMap.has(t.scTrackId) && !flatIds.has(t.scTrackId) && !sourceScIds.has(t.scTrackId)) {
            if (shouldExcludeTrack(t, allGenres, excludeIds, dislikedIds, recentIds, dislikedArtists, dislikedGenres)) continue;
            fillMap.set(t.scTrackId, t);
          }
        }
      }

      // Score supplementary tracks — v14: also apply contentQualityScore to fill tracks
      const fillMeta = (t: SCTrack): InternalTrack => ({ track: t, isFromLikedRelated: false, isFromHistoryRelated: false, isFromArtistSearch: false, isFromGenreFallback: true, isFromBridgeGenre: false, sourceQuery: "fill" });
      const fillScored = Array.from(fillMap.values())
        .filter(t => contentQualityScore(t, allGenres, artists) >= 45) // v14: quality gate for fill tracks too
        .map(t => { const m = fillMeta(t); return { track: t, meta: m, score: scoreTrackV8(t, m, allGenres, artists, languagePreference, feedbackData, timeContext) }; })
        .sort((a, b) => b.score - a.score);

      for (const { track, score, meta } of fillScored) {
        if (flatTracks.length >= TARGET_TRACKS) break;
        const artist = (track.artist || "").toLowerCase().trim();
        if ((artistCount.get(artist) || 0) >= artistLimit) continue;
        artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
        flatTracks.push(mapTrack(track, score, meta));
      }
    }

    // ── Re-interleave after supplementary fill ──
    const reinterleavedFlat = interleaveByArtist(flatTracks, 1, CFG.diversity.maxPerArtist);
    flatTracks.length = 0;
    flatTracks.push(...reinterleavedFlat);

    // ── v10 EXPLORATION INJECTION: self-developing discovery ──
    // Replace last 5 slots with tracks from genres the user doesn't usually listen to
    // This prevents the algorithm from becoming too narrow ("filter bubble")
    if (flatTracks.length >= TARGET_TRACKS && allGenres.length > 0) {
      const userGenreSet = new Set(allGenres.map(g => normalizeGenre(g)));
      // Find bridge/adjacent genres the user hasn't explored
      const unexplored = new Set<string>();
      for (const g of allGenres.slice(0, 3)) {
        for (const rg of getRelatedGenres(g)) {
          const rgNorm = normalizeGenre(rg);
          if (!userGenreSet.has(rgNorm) && !isSpamProneGenre(rgNorm)) {
            unexplored.add(rgNorm);
          }
        }
      }
      const unexploredArr = [...unexplored].sort(() => Math.random() - 0.5).slice(0, 3);

      if (unexploredArr.length > 0) {
        const exploreResults = await Promise.allSettled(
          unexploredArr.map(g => {
            const t = GENRE_QUERIES[g];
            return searchSCTracks(t ? t[0] : `${g} 2025`, 10);
          })
        );

        const exploreTracks: { track: SCTrack; meta: InternalTrack; score: number }[] = [];
        for (const result of exploreResults) {
          if (result.status !== "fulfilled") continue;
          for (const t of result.value) {
            if (flatIds.has(t.scTrackId) || sourceScIds.has(t.scTrackId)) continue;
            if (shouldExcludeTrack(t, allGenres, excludeIds, dislikedIds, recentIds, dislikedArtists, dislikedGenres)) continue;
            // v14: Quality gate for exploration tracks — no more garbage discoveries
            if (contentQualityScore(t, allGenres, artists) < 45) continue;
            const eMeta: InternalTrack = { track: t, isFromLikedRelated: false, isFromHistoryRelated: false, isFromArtistSearch: false, isFromGenreFallback: false, isFromBridgeGenre: true, sourceQuery: "explore" };
            // Give exploration tracks a small score bonus so they don't get cut
            exploreTracks.push({ track: t, meta: eMeta, score: 30 + Math.random() * 20 });
          }
        }

        // v14: Only replace if exploration tracks pass quality AND target slot is low-confidence
        const exploreCount = Math.min(5, exploreTracks.length);
        if (exploreCount > 0) {
          // Only replace tracks with low confidence scores (not high-confidence recommendations)
          const replaceStart = Math.max(TARGET_TRACKS - exploreCount, flatTracks.length - exploreCount);
          let replaced = 0;
          for (let i = 0; i < exploreTracks.length && replaced < exploreCount; i++) {
            const idx = replaceStart + replaced;
            if (idx < flatTracks.length) {
              const existing = flatTracks[idx];
              // Only replace low-confidence fallback tracks, never high-confidence ones
              if (existing._confidence === "low" || !existing._confidence) {
                flatTracks[idx] = mapTrack(exploreTracks[i].track, exploreTracks[i].score, exploreTracks[i].meta);
                replaced++;
              }
            } else {
              flatTracks.push(mapTrack(exploreTracks[i].track, exploreTracks[i].score, exploreTracks[i].meta));
              replaced++;
            }
          }
        }
      }
    }

    // ── Build categories array ──
    const categories: { id: string; title: string; icon: string; tracks: MappedTrack[] }[] = [];

    // v11: Time-of-day category (e.g., "Вечерний вайб", "Ночной calm")
    const timeCategoryTitles: Record<string, { title: string; icon: string }> = {
      morning: { title: "Утренний подъём", icon: "Sunrise" },
      afternoon: { title: "Фокус и работа", icon: "Zap" },
      evening: { title: "Вечерний вайб", icon: "Sunset" },
      night: { title: "Ночной calm", icon: "Moon" },
      weekend: { title: "Выходные", icon: "Coffee" },
      friday_evening: { title: "Пятничный вайб", icon: "PartyPopper" },
    };
    const timeCat = timeCategoryTitles[timeContext];
    if (timeCat && flatTracks.length >= 5) {
      // Pick top 8 tracks that have energy matching the time of day
      const energyPref = getTimeEnergyPreference(timeContext);
      const timeMatched = flatTracks.filter(t => {
        const e = estimateEnergy({ genre: t.genre, title: t.title, duration: t.duration } as SCTrack);
        return e >= energyPref.minEnergy && e <= energyPref.maxEnergy;
      }).slice(0, 8);
      if (timeMatched.length >= 3) {
        categories.push({ id: "time_of_day", title: timeCat.title, icon: timeCat.icon, tracks: timeMatched });
      }
    }

    // Artist-based rows first (most personalized)
    categories.push(...artistRows);

    // "Для вас"
    if (forYouTracks.length >= 3) {
      categories.push({
        id: "for_you",
        title: "Для вас",
        icon: "Sparkles",
        tracks: forYouInterleaved.map(track => {
          const match = forYouTracks.find(({ track: t }) => t.scTrackId === track.scTrackId);
          return match ? mapTrack(match.track, match.score, match.meta) : mapTrack(track, 0);
        }),
      });
    }

    // "Открытия" (interleaved)
    if (discoveryTracks.length >= 3) {
      const discoveryInterleaved = interleaveByArtist(discoveryTracks.map(({ track }) => track), 1, CFG.diversity.maxPerArtist);
      categories.push({
        id: "discover",
        title: "Открытия",
        icon: "Compass",
        tracks: discoveryInterleaved.map(track => {
          const match = discoveryTracks.find(({ track: t }) => t.scTrackId === track.scTrackId);
          return match ? mapTrack(match.track, match.score, match.meta) : mapTrack(track, 0);
        }),
      });
    }

    const responseData = {
      tracks: flatTracks.slice(0, TARGET_TRACKS),
      categories,
      _meta: {
        version: 14,
        timeContext,
        phase1Count: scoredTracksFinal.filter(({ meta }) => meta.isFromLikedRelated || meta.isFromHistoryRelated).length,
        phase2Count: scoredTracksFinal.filter(({ meta }) => meta.isFromArtistSearch).length,
        phase3Count: scoredTracksFinal.filter(({ meta }) => meta.isFromGenreFallback).length,
        bridgeCount: scoredTracksFinal.filter(({ meta }) => meta.isFromBridgeGenre).length,
        likedScIdsUsed: likedScIds.slice(0, isColdStart ? 2 : CFG.phases.relatedApi.maxLikedTracks).length,
        historyScIdsUsed: historyScIds.slice(0, isColdStart ? 1 : CFG.phases.relatedApi.maxHistoryTracks).length,
        languagePreference,
        isColdStart,
      },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [], categories: [] }, { status: 200 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
