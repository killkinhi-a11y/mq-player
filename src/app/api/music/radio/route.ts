import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { RECOMMENDATIONS_CONFIG as CFG } from "@/config/recommendations";
import {
  normalizeGenre, estimateEnergy, detectLanguage,
  hasNoiseKeywords, titleHashtagGenreMismatch,
  fetchSCTrackRelated, getFromCache, setCache,
} from "@/lib/music-utils";

/**
 * "Моя волна" (My Wave) Radio API v2 — YouTube Music / Yandex Music style.
 *
 * v2 changes: Ported ALL content quality filters from recommendations API.
 * Previously radio had minimal filtering (only noise keywords + cover check),
 * letting through AI-generated tracks, promo spam, generic titles, URL stuffers,
 * and other low-quality content that recommendations already filtered.
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
 *   &likedArtists=Artist1,Artist2  (optional) artists user has liked
 *   &likedGenres=rock,indie        (optional) genres user has liked
 *   &lang=russian                  (optional) language preference
 *   &energy=medium                 (optional) desired energy level
 *   &recentSkipCount=3             (optional) number of consecutive recent skips
 *   &completedGenres=rock,indie    (optional) genres user completes (feedback)
 */

// ── In-memory cache (4 min TTL) ────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute (reduced from 4 to prevent repeated tracks from cache)

// ── Mood extraction helper ──────────────────────────────────────────────────
function extractTrackMoods(title: string, genre: string): string[] {
  const text = `${title} ${genre}`.toLowerCase();
  const moods: string[] = [];
  const moodKeywords: Record<string, string[]> = {
    chill: ["chill", "relax", "calm", "mellow", "smooth", "soft", "gentle", "slow", "peaceful", "serene", "laid back", "cozy"],
    bassy: ["bass", "bass boosted", "sub bass", "808", "banger", "drop", "wobble"],
    melodic: ["melodic", "melody", "piano", "guitar", "harmonic", "orchestral", "strings", "keys", "ambient", "ethereal"],
    dark: ["dark", "grimy", "gritty", "raw", "underground", "shadow", "sinister", "noir", "midnight"],
    upbeat: ["upbeat", "happy", "energetic", "hype", "feel good", "party", "dance", "fun", "bright", "summer", "sunny"],
    romantic: ["love", "heart", "kiss", "romance", "baby", "darling", "miss you", "tender", "intimate"],
    aggressive: ["hard", "heavy", "aggressive", "intense", "brutal", "rage", "fury", "smash", "destroy", "war"],
    dreamy: ["dream", "float", "cloud", "space", "cosmic", "ethereal", "haze", "glow", "atmospheric", "euphoric"],
  };
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        moods.push(mood);
        break;
      }
    }
  }
  return moods;
}

// ── Time-of-day context for radio ───────────────────────────────────────────
function getRadioTimeContext(): "morning" | "afternoon" | "evening" | "night" | "weekend" | "friday_evening" {
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

function getRadioTimeEnergyBonus(energy: number): number {
  const ctx = getRadioTimeContext();
  switch (ctx) {
    case "morning": return energy >= 0.4 && energy <= 0.9 ? 12 : -5;
    case "afternoon": return energy >= 0.3 && energy <= 0.85 ? 8 : -3;
    case "evening": return energy >= 0.15 && energy <= 0.65 ? 12 : -5;
    case "night": return energy >= 0.05 && energy <= 0.4 ? 15 : -8;
    case "weekend": return 0;
    case "friday_evening": return energy >= 0.5 ? 15 : -5;
    default: return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT QUALITY FILTERS (ported from recommendations API v13)
// ══════════════════════════════════════════════════════════════════════════════

/** Promo / spam / low-effort content keywords — HARD FILTER */
const PROMO_SPAM_KEYWORDS = [
  "free download", "free beat", "free instrumental", "type beat", "type beat free",
  "free dl", "free download link", "download free", "grab free",
  "subscribe", "follow me", "follow for", "link in bio", "link in desc",
  "buy now", "purchase", "shop now", "merch", "merchandise",
  "made by ai", "ai generated", "suno", "udio", "ai music",
  "generated by", "cover by ai", "ai cover", "ai remix", "ai vocals",
  "chatgpt", "openai", "gemini ai", "claude ai", "gemini music",
  "ai track", "ai sing", "made with ai", "created with ai", "generated with suno",
  "ai beat", "ai producer", "ai artist", "ai song", "chatgpt song",
  "test", "testing", "mic test", "audio test", "raw recording",
  "untitled", "no name", "unnamed track", "rough mix",
  "must hear", "best of", "top 50", "top 100", "non stop", "nonstop",
  "non stop mix", "back to back", "24 7",
  "live set", "dj set", "live mix", "radio show", "podcast ep",
  "tutorial", "how to", "lesson", "course", "masterclass", "workshop",
  "ringtone", "notification", "alarm", "sms tone", "alert sound",
  "snapchat", "onlyfans", "patreon", "donate", "support the artist",
  "snippet", "teaser", "coming soon", "dropping soon",
  "feat. prod", "instrumental produced", "beat produced",
  "mashup pack", "remix pack", "bootleg pack", "edit pack",
  "covers ep", "covers album", "tribute to", "in the style of",
  "visualizer", "visualiser", "animated video",
];

/** Soft spam keywords — score penalty, not hard exclude */
const SOFT_SPAM_KEYWORDS = [
  "official audio", "official video", "lyric video", "lyrics video",
  "slowed", "sped up", "nightcore", "bass boost", "reverb mix",
  "explicit", "clean version", "radio edit", "album version",
  "out now", "available now", "stream now", "new song",
  "x original", "original song", "official song", "debut single",
  "prod by", "produced by", "beat by", "demo version",
  "playlist", "mixtape", "sample",
];

/** Keywords that indicate AI-generated content */
const AI_GENERATED_KEYWORDS = [
  "suno", "udio", "suno ai", "udio ai", "ai song", "ai music", "ai generated",
  "made with ai", "created with ai", "generated with suno",
  "ai vocals", "ai cover", "ai remix", "chatgpt song",
  "made by ai", "ai beat", "ai producer", "ai artist",
];

/** Patterns indicating generic/boring titles */
const GENERIC_TITLE_PATTERNS = [
  /^(track \d+|untitled|no title|unknown)$/i,
  /^(beat \d+|instrumental \d+|song \d+)$/i,
  /^[a-z\d_]+$/,
  /^(.)\1{4,}$/,
];

/** Domains/URLs in titles = spam */
const DOMAIN_PATTERNS = [
  ".com", ".io", ".net", ".org", ".gg", ".co",
  "soundcloud.com", "spotify.com", "youtube.com",
  "instagram.com", "tiktok.com", "twitter.com",
  "linktr.ee", "lnk.bio", "bit.ly",
];

/** Remix/cover keywords for unknown-artist spam detection */
const REMIX_COVER_KEYWORDS = ["remix", "cover", "mashup", "bootleg", "flip", "reflip", "rework", "edit", "mix", "version", "vip mix", "re-edit", "dub", "instrumental"];

/** Genres with high spam ratio on SoundCloud */
const LOW_QUALITY_GENRES = [
  "deep house", "soulful house", "club house", "jackin house",
  "progressive house", "tech house",
];

// ── Content quality check functions ──

function hasPromoSpamKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMO_SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

function hasSoftSpamKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SOFT_SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

function isAIGeneratedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_GENERATED_KEYWORDS.some(kw => lower.includes(kw));
}

function isGenericTitle(title: string): boolean {
  if (!title || title.trim().length < 2) return true;
  return GENERIC_TITLE_PATTERNS.some(p => p.test(title.trim()));
}

function titleContainsUrl(title: string): boolean {
  const lower = title.toLowerCase();
  return DOMAIN_PATTERNS.some(d => lower.includes(d));
}

function isSpamArtistName(artistName: string): boolean {
  const lower = artistName.toLowerCase().trim();
  if (lower.length < 2) return true;
  if (/^[^a-zA-Zа-яА-Я]+$/.test(lower)) return true;
  if (DOMAIN_PATTERNS.some(d => lower.includes(d))) return true;
  const specialRatio = [...lower].filter(c => /[^a-zA-Zа-яА-Я0-9\s]/.test(c)).length / lower.length;
  if (specialRatio > 0.25) return true;
  if (/(.)\1{5,}/.test(lower)) return true;
  return false;
}

function isLowQualityGenre(genre: string): boolean {
  const lower = (genre || "").toLowerCase().trim();
  return LOW_QUALITY_GENRES.some(lq => lower === lq || lower.includes(lq));
}

function isRemixFromUnknown(title: string, artist: string, likedArtists: Set<string>): boolean {
  const lower = title.toLowerCase();
  const hasRemix = REMIX_COVER_KEYWORDS.some(kw => lower.includes(kw));
  if (!hasRemix) return false;
  const artistLower = artist.toLowerCase().trim();
  for (const a of likedArtists) {
    if (artistLower.includes(a.toLowerCase()) || a.toLowerCase().includes(artistLower)) return false;
  }
  return true;
}

/**
 * Combined content quality score — returns 0-100.
 * Tracks scoring below QUALITY_THRESHOLD are filtered out entirely.
 */
function contentQualityScore(
  track: SCTrack,
  likedArtists: Set<string>,
): number {
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

  // AI-generated content → instant reject
  if (isAIGeneratedContent(combined)) return 0;

  // Generic/boring title
  if (isGenericTitle(title)) score -= 50;

  // Title contains URL/domain → instant reject
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
  if (isRemixFromUnknown(title, artist, likedArtists)) score -= 35;

  // Preview-only from unknown artist
  if (!track.scIsFull) {
    let isLikedArtist = false;
    for (const a of likedArtists) {
      if (artistLower.includes(a.toLowerCase()) || a.toLowerCase().includes(artistLower)) {
        isLikedArtist = true;
        break;
      }
    }
    if (!isLikedArtist) score -= 30;
  }

  // Duration too short or too long
  if (track.duration > 0) {
    if (track.duration < 60) score -= 40;
    if (track.duration > 600) score -= 15;
    if (track.duration > 1200) score -= 40;
  }

  // No genre metadata
  if (!track.genre || track.genre.trim().length === 0) score -= 15;

  // Repetitive words in title
  const words = titleLower.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 3 && uniqueWords.size < words.length * 0.5) score -= 20;

  // Title is just artist name + generic suffix
  if (titleLower.startsWith(artistLower) && titleLower.length < artistLower.length + 20) score -= 15;

  return Math.max(0, score);
}

// Minimum quality score for a track to pass filtering
const QUALITY_THRESHOLD = 45; // v14: raised from 40 to match recommendations config


// ── Fetch track metadata by ID (direct API, NOT text search) ─────────────
async function fetchSCTrackMetadata(scTrackId: number): Promise<{
  artist: string; genre: string; duration: number; energy: number;
} | null> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return null;
    const res = await fetch(
      `https://api-v2.soundcloud.com/tracks/${scTrackId}?client_id=${clientId}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const t = await res.json();
    const user = t.user as Record<string, unknown> | undefined;
    const duration = Math.round(((t.full_duration as number) || (t.duration as number) || 30000) / 1000);
    return {
      artist: ((user?.username as string) || "").toLowerCase().trim(),
      genre: (t.genre as string) || "",
      duration,
      energy: estimateEnergy({ duration } as SCTrack),
    };
  } catch {
    return null;
  }
}

// ── Internal candidate with provenance ─────────────────────────────────────────
type CandidateSource =
  | "current_related"    // From SC Related for the currently playing track
  | "history_related"    // From SC Related for a history track
  | "artist_search"      // Found via artist name search
  | "genre_year_search"  // Found via "{genre} {year}" search
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
    likedArtists: Set<string>;
    likedGenres: Set<string>;
    completedGenres: Set<string>;
    langPref: string | null;
    tasteGenres: Map<string, number>;
    tasteArtists: Map<string, number>;
    tasteMoods: Map<string, number>;
    sessionMinutes: number;
    radioTimeContext: string;
  },
): number {
  let score = 0;
  const { track, source } = candidate;
  const trackGenre = normalizeGenre(track.genre || "");
  const trackArtist = (track.artist || "").toLowerCase().trim();

  // ── PRIMARY SIGNALS (actual similarity) ──
  if (source === "current_related") score += CFG.radio.relatedCurrent;
  else if (source === "history_related") score += CFG.radio.relatedHistory;

  // Same artist as current track → PENALTY
  if (trackArtist && trackArtist === ctx.currentArtist.toLowerCase().trim()) {
    score += CFG.radio.sameArtist; // -40
  }
  // Same artist as recently played → soft penalty (strengthened to -25 for more diversity)
  if (trackArtist && ctx.historyArtists.has(trackArtist)) {
    score -= 25;
  }
  // Genre match with current track
  if (trackGenre && ctx.currentGenre) {
    const curNorm = normalizeGenre(ctx.currentGenre);
    if (trackGenre === curNorm || trackGenre.includes(curNorm) || curNorm.includes(trackGenre)) {
      score += CFG.radio.genreMatch;
    }
  }

  // ── ENERGY FLOW ──
  // Session mood momentum — longer sessions gradually shift energy preference
  let sessionEnergyShift = 0;
  if (ctx.sessionMinutes > 20) {
    sessionEnergyShift = Math.sin(ctx.sessionMinutes / 60 * Math.PI) * 0.15;
  }

  const trackE = estimateEnergy(track);
  const effectiveEnergy = ctx.currentEnergy + sessionEnergyShift;
  const energyDiff = trackE - effectiveEnergy;
  if (energyDiff > 0 && energyDiff <= 0.3) {
    score += CFG.radio.energyFlowUp;
  } else if (energyDiff < 0 && energyDiff >= -0.3) {
    score += CFG.radio.energyFlowDown;
  } else if (Math.abs(energyDiff) <= 0.15) {
    score += CFG.radio.energyStable;
  }

  // ── LANGUAGE (user preference) ──
  if (ctx.langPref) {
    const trackText = `${track.title || ""} ${track.artist || ""}`;
    const trackLang = detectLanguage(trackText);
    if (trackLang === ctx.langPref) score += CFG.radio.languageMatch;

    // Language mismatch penalty (from recommendations v12)
    if (ctx.langPref === "russian" && trackLang === "english") score -= 15;
    if (ctx.langPref === "english" && trackLang === "russian") score -= 15;
  }

  // ── LIKED ARTISTS/GENRES (strong positive personalization) ──
  if (ctx.likedArtists.has(trackArtist)) score += CFG.radio.historyArtist * 1.5;
  if (trackGenre && ctx.likedGenres.has(trackGenre)) score += CFG.radio.genreMatch * 1.5;

  // ── COMPLETED GENRES (feedback signal — user actually listens to these) ──
  if (trackGenre && ctx.completedGenres.has(trackGenre)) {
    score += CFG.scoring.completedGenreBonus;
  }

  // ── TASTE PROFILE GENRE MATCH (user's explicit preference sliders) ──
  if (trackGenre && ctx.tasteGenres.size > 0) {
    const tasteLevel = ctx.tasteGenres.get(trackGenre);
    if (tasteLevel !== undefined) {
      // Scale: level 100 = +80 points, level 50 = +40, level 20 = +16
      score += Math.round(tasteLevel * 0.8);
    } else {
      // Check for partial match
      for (const [tg, level] of ctx.tasteGenres) {
        if (trackGenre.includes(tg) || tg.includes(trackGenre)) {
          score += Math.round(level * 0.4); // half bonus for partial match
          break;
        }
      }
    }
  }

  // ── TASTE PROFILE ARTIST MATCH (user's explicit artist preferences) ──
  if (trackArtist && ctx.tasteArtists.size > 0) {
    const tasteArtistLevel = ctx.tasteArtists.get(trackArtist);
    if (tasteArtistLevel !== undefined) {
      // Scale: level 100 = +100 points
      score += tasteArtistLevel;
    } else {
      // Partial artist name match
      for (const [ta, level] of ctx.tasteArtists) {
        if (trackArtist.includes(ta) || ta.includes(trackArtist)) {
          score += Math.round(level * 0.5);
          break;
        }
      }
    }
  }

  // ── TASTE PROFILE MOOD MATCH ──
  if (ctx.tasteMoods.size > 0) {
    const trackMoods = extractTrackMoods(track.title || "", track.genre || "");
    for (const mood of trackMoods) {
      const moodLevel = ctx.tasteMoods.get(mood);
      if (moodLevel !== undefined) {
        score += Math.round(moodLevel * 0.3); // +30 max per mood match
      }
    }
  }

  // ── TIME-OF-DAY ENERGY BONUS ──
  score += getRadioTimeEnergyBonus(trackE);

  // ── SESSION DURATION ADAPTATION ──
  // After 30+ minutes, gradually boost discovery tracks to prevent fatigue
  const trackArtistNorm = (track.artist || "").toLowerCase().trim();
  const isNewArtist = !ctx.historyArtists.has(trackArtistNorm)
    && trackArtistNorm !== ctx.currentArtist.toLowerCase().trim()
    && !ctx.likedArtists.has(trackArtistNorm);
  const isNewGenre = trackGenre && !ctx.likedGenres.has(trackGenre) && trackGenre !== normalizeGenre(ctx.currentGenre);

  if (ctx.sessionMinutes > 30) {
    const explorationBoost = Math.min(20, Math.floor((ctx.sessionMinutes - 30) / 10) * 3);
    if (isNewArtist) score += explorationBoost;
    if (isNewGenre) score += Math.floor(explorationBoost * 0.7);
  }

  // ── QUALITY GATES ──
  if (track.scIsFull) score += CFG.radio.playability;
  if (track.cover) score += CFG.radio.coverArt;
  if (track.duration >= 120 && track.duration <= 360) score += 10;

  // ── DURATION SIMILARITY ──
  if (ctx.currentDuration > 0) {
    const durDiff = Math.abs((track.duration || 200) - ctx.currentDuration);
    if (durDiff <= 60) score += 10;
    else if (durDiff <= 120) score += 5;
  }

  // ── FEEDBACK (skip signals) ──
  if (ctx.skippedArtists.has(trackArtist)) score -= CFG.radio.skippedArtistPenalty;
  if (ctx.skippedGenres.has(trackGenre)) score -= CFG.radio.skippedGenrePenalty;

  // ── ANTI-SPAM ──
  const titleArtistNoise = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasNoiseKeywords(titleArtistNoise)) score -= CFG.radio.noisePenalty;
  if (titleHashtagGenreMismatch(track.title || "", [ctx.currentGenre])) score -= CFG.radio.noisePenalty / 2;

  // v14: Soft spam penalty — promo-flavored titles score lower but aren't excluded
  if (hasSoftSpamKeywords(titleArtistNoise)) score -= 12;

  // v14: Quality scoring — prefer tracks with proper titles, real artists, etc.
  // This supplements the hard filter above by scoring borderline content
  const radioTitle = (track.title || "").trim();
  const radioArtist = (track.artist || "").trim();
  const radioTitleLen = radioTitle.length;
  // Good title length (not too short, not too long)
  if (radioTitleLen >= 5 && radioTitleLen <= 60) score += 5;
  // Has genre metadata
  if (track.genre && track.genre.trim().length > 0) score += 3;
  // Reasonable duration (2-6 min = proper track)
  if (track.duration >= 120 && track.duration <= 360) score += 5;
  // Full playable track (massive bonus — preview-only from unknown artist is usually garbage)
  if (!track.scIsFull) score -= 25;

  // ── MOMENTUM PENALTY ──
  if (ctx.recentSkipCount >= CFG.radio.momentumSkipThreshold) {
    if (trackArtist && trackArtist === ctx.currentArtist.toLowerCase().trim()) {
      score -= CFG.radio.momentumPenalty;
    }
  }

  // ── SERENDIPITY — reward novel discovery tracks (strengthened for Wave diversity) ──
  if (isNewArtist && isNewGenre) score += CFG.scoring.serendipityBonus * 2; // x2 for Wave
  else if (isNewArtist) score += CFG.scoring.serendipityBonus; // full bonus for new artist alone
  else if (isNewGenre) score += Math.floor(CFG.scoring.serendipityBonus / 2);

  // ── FRESHNESS (confidence-proportional jitter) ──
  // Higher-confidence sources get less jitter for stable rankings
  const confidence = source === "current_related" ? 1.0
    : source === "history_related" ? 0.8
    : source === "artist_search" ? 0.6
    : 0.4;
  // Increased jitter for more variety in Wave
  const jitterBase = confidence >= 0.8 ? CFG.scoring.highConfidenceJitter : CFG.scoring.maxJitter;
  const maxJitter = Math.max(jitterBase, 12); // at least ±12 for Wave variety
  score += (Math.random() - 0.5) * 2 * maxJitter;

  return score;
}

// ── Hard exclusion filter (v2 — with ALL content quality gates) ──────────────
function shouldExclude(
  track: SCTrack,
  ctx: {
    excludedScIds: Set<number>;
    skippedArtists: Set<string>;
    skippedGenres: Set<string>;
    currentGenre: string;
    likedArtists: Set<string>;
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

  // No cover art
  if (!track.cover) return true;

  // Too short to be a real track
  if (track.duration && track.duration < 30) return true;

  // v14: Hard promo/spam filter (same comprehensive filter as recommendations)
  const titleArtistPromo = `${track.title || ""} ${track.artist || ""}`.toLowerCase();
  if (hasPromoSpamKeywords(titleArtistPromo)) return true;

  // v14: AI-generated content
  if (isAIGeneratedContent(titleArtistPromo)) return true;

  // v14: Generic title
  if (isGenericTitle(track.title || "")) return true;

  // v14: URL in title
  if (titleContainsUrl(track.title || "")) return true;

  // v14: Spam artist name
  if (isSpamArtistName(track.artist || "")) return true;

  // v14: Duration gates (>20 min = not a real track)
  if (track.duration > 0 && track.duration > 1200) return true;

  return false;
}

// ── Energy-aware diversity selection ───────────────────────────────────────────
function selectWithEnergyDiversity(
  scored: { candidate: Candidate; score: number }[],
  currentEnergy: number,
  targetCount: { min: number; max: number },
): Candidate[] {
  const result: Candidate[] = [];
  const used = new Set<number>();
  const artistCount = new Map<string, number>();
  const MAX_PER_ARTIST = 1;
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
      const artist = (item.candidate.track.artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= MAX_PER_ARTIST) continue;
      artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      result.push(item.candidate);
      used.add(item.candidate.track.scTrackId);
      picked++;
    }
  };

  const closeRange = CFG.radio.energyCloseRange;
  const shiftRange = CFG.radio.energyShiftRange;

  pick(
    (c) => c.candidate.energyDistance <= closeRange,
    CFG.radio.closeBucketMax,
  );
  pick(
    (c) => c.candidate.energyDistance > closeRange && c.candidate.energyDistance <= shiftRange,
    CFG.radio.shiftBucketMax,
  );
  pick(
    (c) => c.candidate.energyDistance > shiftRange,
    CFG.radio.wildcardBucketMax,
  );

  // Fill remaining slots with highest-scored unused tracks
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

// ── Artist-aware interleaving ──
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
  const likedArtistsParam = searchParams.get("likedArtists") || "";
  const likedGenresParam = searchParams.get("likedGenres") || "";
  const langParam = searchParams.get("lang") || "";
  const energyParam = searchParams.get("energy") || "";
  const recentSkipCount = parseInt(searchParams.get("recentSkipCount") || "0", 10);
  const completedGenresParam = searchParams.get("completedGenres") || "";
  const dislikedScIdsParam = searchParams.get("dislikedScIds") || "";
  const tasteGenresParam = searchParams.get("tasteGenres") || "";
  const tasteArtistsParam = searchParams.get("tasteArtists") || "";
  const tasteMoodsParam = searchParams.get("tasteMoods") || "";
  const sessionDurationParam = searchParams.get("sessionDuration") || "";

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

  const dislikedScIds: number[] = dislikedScIdsParam
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);

  const excludedScIds = new Set<number>([scTrackId, ...historyScIds, ...dislikedScIds]);

  const skippedGenres = new Set(
    skippedGenresParam.split(",").filter(Boolean).map((g) => normalizeGenre(g)),
  );

  const skippedArtists = new Set(
    skippedArtistsParam.split(",").filter(Boolean).map((a) => a.toLowerCase().trim()),
  );

  const likedArtists = new Set(
    likedArtistsParam.split(",").filter(Boolean).map((a) => a.toLowerCase().trim()),
  );

  const likedGenres = new Set(
    likedGenresParam.split(",").filter(Boolean).map((g) => normalizeGenre(g)),
  );

  const completedGenres = new Set(
    completedGenresParam.split(",").filter(Boolean).map((g) => normalizeGenre(g)),
  );

  const langPref: "russian" | "english" | "latin" | null =
    langParam === "russian" || langParam === "english" || langParam === "latin"
      ? langParam
      : null;

  let energyPref: number | null = null;
  if (energyParam === "high") energyPref = 0.8;
  else if (energyParam === "medium") energyPref = 0.5;
  else if (energyParam === "low") energyPref = 0.2;

  // ── Parse taste profile params ──────────────────────────────────────────
  const tasteGenres: Map<string, number> = new Map();
  for (const entry of tasteGenresParam.split(",").filter(Boolean)) {
    const [genre, levelStr] = entry.split(":");
    if (genre && levelStr) {
      const level = parseInt(levelStr, 10);
      if (!isNaN(level)) tasteGenres.set(normalizeGenre(genre), level);
    }
  }

  const tasteArtists: Map<string, number> = new Map();
  for (const entry of tasteArtistsParam.split(",").filter(Boolean)) {
    const [artist, levelStr] = entry.split(":");
    if (artist && levelStr) {
      const level = parseInt(levelStr, 10);
      if (!isNaN(level)) tasteArtists.set(artist.toLowerCase().trim(), level);
    }
  }

  const tasteMoods: Map<string, number> = new Map();
  for (const entry of tasteMoodsParam.split(",").filter(Boolean)) {
    const [mood, levelStr] = entry.split(":");
    if (mood && levelStr) {
      const level = parseInt(levelStr, 10);
      if (!isNaN(level)) tasteMoods.set(mood.toLowerCase().trim(), level);
    }
  }

  const sessionMinutes = parseInt(sessionDurationParam, 10) || 0;

  // ── Cache check ───────────────────────────────────────────────────────────
  const cacheKey = `radio:${scTrackId}:${historyScIdsParam}:${skippedGenresParam}:${skippedArtistsParam}:${likedArtistsParam}:${likedGenresParam}:${langParam}:${energyParam}:${recentSkipCount}:${completedGenresParam}:${dislikedScIdsParam}:${tasteGenresParam}:${tasteArtistsParam}:${tasteMoodsParam}:${sessionDurationParam}`;
  const cached = getFromCache(cacheKey, cache);
  if (cached) return NextResponse.json(cached);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // STEP 0: Fetch seed track metadata + history track metadata (parallel)
    // ══════════════════════════════════════════════════════════════════════════

    const currentTrackPromise = fetchSCTrackMetadata(scTrackId);

    const last2History = historyScIds.slice(0, 3);
    const historyMetadataPromises = last2History.map(
      (hid) => fetchSCTrackMetadata(hid),
    );

    const [currentTrackMeta, ...historyMetadataResults] = await Promise.allSettled([
      currentTrackPromise,
      ...historyMetadataPromises,
    ]);

    let currentArtist = "";
    let currentGenre = "";
    let currentEnergy = 0.5;
    let currentDuration = 200;

    if (currentTrackMeta.status === "fulfilled" && currentTrackMeta.value) {
      const ct = currentTrackMeta.value;
      currentArtist = ct.artist;
      currentGenre = ct.genre;
      currentEnergy = ct.energy;
      currentDuration = ct.duration;
    }

    if (energyPref !== null) {
      currentEnergy = currentEnergy * 0.6 + energyPref * 0.4;
    }

    const historyArtists = new Set<string>();
    for (const result of historyMetadataResults) {
      if (result.status === "fulfilled" && result.value) {
        const artist = result.value.artist;
        if (artist) historyArtists.add(artist);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STAGE 1: CANDIDATE GENERATION (target 50–100 candidates)
    // ══════════════════════════════════════════════════════════════════════════

    const allFetchPromises: Promise<SCTrack[]>[] = [];
    const sourceMap: CandidateSource[] = [];

    // ── Source 1: SC Related for CURRENT track (~20 tracks, HIGHEST quality)
    sourceMap.push("current_related");
    allFetchPromises.push(fetchSCTrackRelated(scTrackId));

    // ── Source 2: Genre discovery search — randomized queries for diversity ──
    if (currentGenre) {
      const genreVariants = [
        `${currentGenre} new artists`,
        `${currentGenre} trending`,
        `${currentGenre} fresh`,
        `${currentGenre} underground`,
        `${currentGenre} emerging`,
      ];
      const genreQuery = genreVariants[Math.floor(Math.random() * genreVariants.length)];
      sourceMap.push("genre_search");
      allFetchPromises.push(searchSCTracks(genreQuery, 15));
    }

    // ── Source 3: SC Related for last 3 history tracks (~20 each, up to 60)
    const historyForRelated = historyScIds.slice(0, 3);
    for (const hid of historyForRelated) {
      sourceMap.push("history_related");
      allFetchPromises.push(fetchSCTrackRelated(hid));
    }

    // ── Source 4: Randomized year search ──
    const year = new Date().getFullYear();
    const yearVariants = [
      `${currentGenre || "indie"} ${year}`,
      `new music ${year}`,
      `best new ${year}`,
      `${currentGenre || ""} hits ${year}`.trim(),
      `popular ${year}`,
    ];
    const yearQuery = yearVariants[Math.floor(Math.random() * yearVariants.length)];
    sourceMap.push("genre_year_search");
    allFetchPromises.push(searchSCTracks(yearQuery, 15));

    // ── Source 5: Randomized mood/vibe search for more variety ──
    const vibeQueries = [
      "chill vibes new",
      "deep focus",
      "late night drive",
      "summer playlist new",
      "workout energy",
      "lo-fi study",
      "indie discovery",
      "alternative new artists",
    ];
    const vibeQuery = vibeQueries[Math.floor(Math.random() * vibeQueries.length)];
    sourceMap.push("genre_search");
    allFetchPromises.push(searchSCTracks(vibeQuery, 10));

    // ── Source 5: "{genre} mix" search (~10 tracks)
    if (currentGenre) {
      sourceMap.push("genre_search");
      allFetchPromises.push(searchSCTracks(`${currentGenre} mix`, 10));
    }

    // ── Source 6: Liked artist search — top 3 artists (increased from 2) ──
    const topLikedArtists = [...likedArtists].slice(0, 3);
    for (const la of topLikedArtists) {
      sourceMap.push("artist_search");
      allFetchPromises.push(searchSCTracks(`"${la}"`, 10));
    }

    // ── Source 7: Liked genre search — top 3 genres with randomized queries ──
    const topLikedGenres = [...likedGenres].slice(0, 3);
    for (const lg of topLikedGenres) {
      const likedGenreVariants = [`${lg} ${year}`, `${lg} new`, `${lg} playlist`, `${lg} mix`];
      const likedGenreQuery = likedGenreVariants[Math.floor(Math.random() * likedGenreVariants.length)];
      sourceMap.push("genre_search");
      allFetchPromises.push(searchSCTracks(likedGenreQuery, 10));
    }

    // ── Source 8: Completed genres bonus — search in genres user actually finishes ──
    const topCompletedGenres = [...completedGenres].slice(0, 3);
    for (const cg of topCompletedGenres) {
      const completedVariants = [`${cg} best`, `${cg} new artists`, `${cg} ${year}`];
      const completedQuery = completedVariants[Math.floor(Math.random() * completedVariants.length)];
      sourceMap.push("genre_search");
      allFetchPromises.push(searchSCTracks(completedQuery, 8));
    }

    // ── Source 9: Exploration — random broad discovery queries ──
    const explorationQueries = [
      `indie ${year} new`, `alternative rock ${year}`, `electronic new release`,
      `hip hop new ${year}`, `r&b soul new`, `jazz modern new`,
      `pop new artists ${year}`, `ambient chill new`, `punk new release`,
      `folk acoustic new`, `latin new music`, `african new artists`,
    ];
    // Pick 2 random exploration queries for variety
    const shuffled = explorationQueries.sort(() => Math.random() - 0.5);
    for (const eq of shuffled.slice(0, 2)) {
      sourceMap.push("genre_search");
      allFetchPromises.push(searchSCTracks(eq, 8));
    }

    // ── Source 10: Taste profile genre searches (user's explicit slider preferences) ──
    const topTasteGenres = [...tasteGenres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [tg, level] of topTasteGenres) {
      if (level >= 40) {
        const tasteVariants = [`${tg} best`, `${tg} ${year}`, `${tg} new artists`, `${tg} essential`];
        const tasteQuery = tasteVariants[Math.floor(Math.random() * tasteVariants.length)];
        sourceMap.push("genre_search");
        allFetchPromises.push(searchSCTracks(tasteQuery, 10));
      }
    }

    // ── Source 11: Taste profile artist searches (user's favorite artists) ──
    const topTasteArtists = [...tasteArtists.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [ta, level] of topTasteArtists) {
      if (level >= 40) {
        sourceMap.push("artist_search");
        allFetchPromises.push(searchSCTracks(`"${ta}"`, 10));
      }
    }

    // Execute ALL fetches in parallel
    const fetchResults = await Promise.allSettled(allFetchPromises);

    // ── Aggregate candidates ────────────────────────────────────────────────
    const candidateMap = new Map<number, Candidate>();
    const candidateArtistCount = new Map<string, number>();

    const sourcePriority: Record<CandidateSource, number> = {
      current_related: 5,
      history_related: 4,
      artist_search: 3,
      genre_year_search: 2,
      genre_search: 1,
    };

    // Build exclude context once (used by both shouldExclude and contentQualityScore)
    const excludeCtx = {
      excludedScIds,
      skippedArtists,
      skippedGenres,
      currentGenre,
      likedArtists,
    };

    let filteredByQuality = 0;
    let filteredByHard = 0;

    const addCandidate = (track: SCTrack, source: CandidateSource) => {
      if (track.scTrackId === scTrackId) return;

      const trackArtistLower = (track.artist || "").toLowerCase().trim();
      if (trackArtistLower && currentArtist && trackArtistLower === currentArtist) return;

      // ── ARTIST FREQUENCY CAP ──
      const artistCount = candidateArtistCount.get(trackArtistLower) || 0;
      if (artistCount >= 3) return;
      candidateArtistCount.set(trackArtistLower, artistCount + 1);

      // ── HARD EXCLUSION FILTER (v2 — comprehensive) ──
      if (shouldExclude(track, excludeCtx)) {
        filteredByHard++;
        return;
      }

      // ── CONTENT QUALITY SCORE GATE ──
      const quality = contentQualityScore(track, likedArtists);
      if (quality < QUALITY_THRESHOLD) {
        filteredByQuality++;
        return;
      }

      // Dedup with source priority upgrade
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
        likedArtists,
        likedGenres,
        completedGenres,
        langPref,
        tasteGenres,
        tasteArtists,
        tasteMoods,
        sessionMinutes,
        radioTimeContext: getRadioTimeContext(),
      });

      scoredCandidates.push({ candidate, score });
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    const selected = selectWithEnergyDiversity(scoredCandidates, currentEnergy, {
      min: CFG.radio.targetMin,
      max: CFG.radio.targetMax,
    });

    const interleaved = interleaveRadioTracks(selected);

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
        filteredByQuality,
        filteredByHard,
      },
    };

    setCache(cacheKey, responseData, cache, 100, CACHE_TTL);
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
