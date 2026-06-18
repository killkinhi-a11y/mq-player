/**
 * Shared taste-profile extraction utilities (M3.4).
 *
 * Previously the same logic was copy-pasted in 3 components
 * (MainView.tsx, AISmartRecs.tsx, AIAssistant.tsx) and 2 API routes
 * (/api/ai/chat, /api/music/radio). Each copy had small drifts
 * (different threshold for `>= 20` vs `>= 30`, different history
 * slice sizes, different language detection thresholds). This module
 * is the single source of truth.
 *
 * Usage:
 *   import { extractTasteProfile, tasteProfileToSearchQuery } from "@/lib/tasteProfile";
 *   const tp = extractTasteProfile({ history, likedTracksData, tasteGenres, tasteArtists, tasteMoods, dislikedTrackIds });
 *   // tp.topGenres, tp.topArtists, tp.topHistoryGenres, tp.topHistoryArtists,
 *   // tp.allGenres, tp.allArtists, tp.language, tp.recentTitles
 */

import type { Track } from "@/lib/musicApi";

export interface HistoryEntry {
  track: Track;
  playedAt: number;
  playCount: number;
}

export interface TasteProfileInput {
  history: HistoryEntry[];
  likedTracksData?: Track[];
  tasteGenres?: Record<string, number>;
  tasteArtists?: Record<string, number>;
  tasteMoods?: Record<string, number>;
  dislikedTrackIds?: string[];
}

export interface TasteProfile {
  /** Genres the user explicitly liked (tasteGenres >= GENRE_LIKE_THRESHOLD). */
  topGenres: string[];
  /** Artists the user explicitly liked. */
  topArtists: string[];
  /** Genres extracted from play history (weighted by playCount). */
  topHistoryGenres: string[];
  /** Artists extracted from play history (weighted by playCount). */
  topHistoryArtists: string[];
  /** Union of explicit + history signals, deduped, capped. */
  allGenres: string[];
  allArtists: string[];
  /** Moods the user has marked as preferred (tasteMoods >= MOOD_LIKE_THRESHOLD). */
  topMoods: string[];
  /** Detected language preference: 'russian' | 'english' | 'mixed'. */
  language: "russian" | "english" | "mixed";
  /** Recent track titles for context ("Title - Artist" format). */
  recentTitles: string[];
}

/** Threshold for tasteGenres/tasteArtists values to count as "liked". */
export const GENRE_LIKE_THRESHOLD = 20;
/** Threshold for tasteMoods values to count as "preferred". */
export const MOOD_LIKE_THRESHOLD = 30;
/** How many history entries to scan for genre/artist signals. */
export const HISTORY_SCAN_LIMIT = 50;
/** How many recent titles to include in the profile. */
export const RECENT_TITLES_LIMIT = 8;
/** Min language-signal count to declare a preference (otherwise 'mixed'). */
export const LANGUAGE_MIN_SIGNAL = 5;
/** Cyrillic ratio threshold for 'russian' detection. */
export const RUSSIAN_RATIO_THRESHOLD = 0.4;
/** Latin ratio threshold for 'english' detection. */
export const ENGLISH_RATIO_THRESHOLD = 0.6;
/** Min length of a valid genre tag. */
export const GENRE_MIN_LENGTH = 2;
/** Max length of a valid genre tag. */
export const GENRE_MAX_LENGTH = 24;
/** Max words allowed in a genre tag (genres are short, not sentences). */
export const GENRE_MAX_WORDS = 2;

/**
 * Curated list of known music genres for validation.
 * Any "genre" not matching this list (and not passing basic sanity checks)
 * is likely garbage from SoundCloud's free-text genre field.
 */
export const KNOWN_GENRES = new Set([
  // Electronic
  "electronic", "edm", "house", "deep house", "tech house", "progressive house",
  "electro house", "bass house", "future house", "tropical house", "tropical",
  "techno", "minimal techno", "detroit techno", "trance", "progressive trance",
  "psytrance", "goa", "hard trance", "drum and bass", "dnb", "liquid dnb",
  "neurofunk", "jungle", "dubstep", "riddim", "future bass", "melodic dubstep",
  "brostep", "chillstep", "trap", "hybrid trap", "future trap", "phonk",
  "drift phonk", "lofi", "lo-fi", "lofi hip hop", "chillhop", "vaporwave",
  "synthwave", "retrowave", "outrun", "cyberpunk", "ambient", "dark ambient",
  "drone", "new age", "trip hop", "idm", "glitch", "glitch hop", "wonky",
  "downtempo", "chillout", "electronica", "breakbeat", "big beat", "garage",
  "uk garage", "future garage", "2-step", "bassline", "grime", "dub",
  "dub techno", "minimal", "hardstyle", "happy hardcore", "gabber",
  "speedcore", "breakcore", "footwork", "juke", "wonky",
  // Hip-Hop / Rap
  "hip hop", "hip-hop", "rap", "trap", "drill", "uk drill", "ny drill",
  "boom bap", "lo-fi hip hop", "jazz rap", "conscious rap", "mumble rap",
  "soundcloud rap", "emo rap", "cloud rap", "gangsta rap", "old school rap",
  "new school rap", "freestyle", "battle rap",
  // Rock
  "rock", "alternative rock", "alt rock", "indie rock", "post rock",
  "punk rock", "punk", "post punk", "hardcore", "post hardcore", "emo",
  "screamo", "metal", "heavy metal", "death metal", "black metal",
  "thrash metal", "doom metal", "sludge metal", "progressive metal",
  "metalcore", "deathcore", "grindcore", "nu metal", "industrial metal",
  "grunge", "garage rock", "surf rock", "psychedelic rock", "psych rock",
  "stoner rock", "space rock", "shoegaze", "dream pop", "noise rock",
  "math rock", "krautrock", "glam rock", "arena rock", "classic rock",
  "soft rock", "hard rock", "blues rock", "folk rock", "country rock",
  "southern rock", "christian rock",
  // Pop
  "pop", "indie pop", "synth pop", "synth-pop", "electropop", "dream pop",
  "chamber pop", "baroque pop", "art pop", "teen pop", "k-pop", "kpop",
  "j-pop", "jpop", "c-pop", "mandopop", "latin pop", "tropical pop",
  "dance pop", "country pop", "folk pop", "pop punk", "pop rock",
  "power pop", "hyperpop", "bedroom pop", "alt pop",
  // R&B / Soul / Funk
  "r&b", "rnb", "rhythm and blues", "soul", "neo soul", "funk", "disco",
  "motown", "gospel", "quiet storm", "contemporary r&b", "alternative r&b",
  "pbr&b", "new jack swing", "electronic r&b",
  // Jazz / Blues
  "jazz", "smooth jazz", "bebop", "cool jazz", "free jazz", "fusion",
  "jazz fusion", "jazz funk", "swing", "big band", "latin jazz",
  "soul jazz", "modal jazz", "post bop", "hard bop", "blues", "delta blues",
  "chicago blues", "electric blues", "rhythm and blues", "blues rock",
  // Country / Folk
  "country", "country pop", "country rock", "outlaw country", "bluegrass",
  "americana", "alt country", "alternative country", "folk", "indie folk",
  "folk rock", "folk pop", "singer songwriter", "singer-songwriter",
  "acoustic", "acoustic pop",
  // Latin
  "latin", "latin pop", "reggaeton", "latin trap", "salsa", "bachata",
  "merengue", "cumbia", "bossa nova", "samba", "tango", "flamenco",
  "rumba", "mariachi", "banda", "norteño", "corrido",
  // Reggae / Caribbean
  "reggae", "dub", "ska", "rocksteady", "dancehall", "ragga", "roots reggae",
  "reggaeton", "moombahton", "moombahcore",
  // World / Traditional
  "world", "world music", "african", "afrobeats", "afrobeat", "afro pop",
  "highlife", "fuji", "kizomba", "soukous", "bollywood", "bhangra",
  "arabic", "middle eastern", "turkish", "greek", "celtic", "irish",
  "scottish", "nordic", "scandinavian", "japanese", "chinese", "korean",
  "russian", "russian rap", "russian rock", "russian pop", "shanson",
  "russian chanson", "soviet", "ukrainian", "ukrainian pop", "ukrainian rock",
  // Classical / Orchestral
  "classical", "orchestral", "symphony", "chamber music", "opera",
  "choral", "contemporary classical", "minimalism", "neoclassical",
  "neo-classical", "ambient classical", "film score", "soundtrack",
  "score", "movie soundtrack", "video game music", "vgm",
  // Other / Crossover
  "soundtrack", "musical", "spoken word", "comedy", "audio book",
  "podcast", "interview", "audio drama", "radio drama",
  "experimental", "avant garde", "avant-garde", "noise", "musique concrète",
  "field recording", "sound art",
  "christian", "gospel", "worship", "ccm", "contemporary christian",
  "praise", "hymn", "liturgical",
  "holiday", "christmas", "xmas", "halloween", "seasonal",
  // Moods / Energies (often used as genres on SoundCloud)
  "chill", "relax", "relaxing", "calm", "peaceful", "meditation",
  "focus", "study", "sleep", "ambient chill", "study music",
  "energetic", "hype", "epic", "motivational", "uplifting", "upbeat",
  "sad", "melancholy", "nostalgic", "dark", "moody", "atmospheric",
  "happy", "feel good", "feel-good", "summer", "beach", "sunny",
  "workout", "gym", "running", "cardio", "pump up",
  "cinematic", "trailer", "trailer music", "epic music",
]);

/**
 * Check if a string looks like a valid genre tag.
 * Returns the cleaned-up genre string, or null if invalid.
 *
 * Rejects:
 * - Empty / whitespace-only strings
 * - Strings longer than GENRE_MAX_LENGTH chars
 * - Strings with more than GENRE_MAX_WORDS words
 * - Strings that contain numbers/digits (likely typos or IDs)
 * - Strings with weird characters (URLs, emails, file paths)
 * - Strings that are all uppercase (likely abbreviations or shouted text)
 * - Cyrillic multi-word strings that aren't in the known-genres list
 *   (SoundCloud users often put artist names in the genre field)
 *
 * Returns the genre lowercased for consistent comparison.
 */
export function sanitizeGenre(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw.length < GENRE_MIN_LENGTH) return null;
  if (raw.length > GENRE_MAX_LENGTH) return null;
  // Reject strings with digits (likely IDs, years, etc.)
  if (/\d/.test(raw)) return null;
  // Reject strings with @, /, ., :, & (URLs, emails, paths, compound tags)
  if (/[\/@.:&]/.test(raw)) return null;
  // Reject strings with newlines or tabs
  if (/[\r\n\t]/.test(raw)) return null;
  // Reject strings with more than GENRE_MAX_WORDS words
  const words = raw.split(/\s+/);
  if (words.length > GENRE_MAX_WORDS) return null;
  // Reject strings that are all uppercase in the ORIGINAL (look like shouting or acronyms > 4 chars)
  // Allow known short abbreviations
  if (raw.length > 4 && raw === raw.toUpperCase() && /[a-zа-я]/i.test(raw)) {
    const lower = raw.toLowerCase();
    if (!["dnb", "edm", "idm", "rnb", "kpop", "jpop", "ccm", "vgm"].includes(lower)) {
      return null;
    }
  }
  const lower = raw.toLowerCase();
  // Reject strings where most chars are non-letter (punctuation/symbols)
  const letters = (lower.match(/[a-zа-яё]/gi) || []).length;
  if (letters < lower.length * 0.7) return null;
  // P2-genre: reject Cyrillic multi-word genres UNLESS they're in the known list
  // (SoundCloud users often put artist names like "уран гайсин" in the genre field)
  const hasCyrillic = /[а-яё]/i.test(raw);
  if (hasCyrillic && words.length > 1) {
    if (!KNOWN_GENRES.has(lower)) return null;
  }
  // P2-genre: reject Latin multi-word genres UNLESS they're in the known list
  // (filters out "Religion & Spirituality" — caught by & above, but also
  //  "New Age", "Adult Alternative" etc. that aren't real genres)
  if (!hasCyrillic && words.length > 1) {
    if (!KNOWN_GENRES.has(lower)) return null;
  }
  return lower;
}

/**
 * Normalize a genre for display — Title Case for multi-word, capitalize for single-word.
 * "tropical" → "Tropical", "drum and bass" → "Drum and Bass", "dnb" → "DNB"
 */
export function displayGenre(genre: string): string {
  const lower = genre.toLowerCase();
  // Known abbreviations — keep uppercase
  if (["dnb", "edm", "idm", "rnb", "kpop", "jpop", "ccm", "vgm"].includes(lower)) {
    return lower.toUpperCase();
  }
  // Known lowercase genres — keep as-is
  if (["lofi", "lo-fi", "phonk", "vaporwave", "synthwave", "retrowave",
       "outrun", "cyberpunk", "chillhop", "shoegaze"].includes(lower)) {
    return lower;
  }
  // Title Case for the rest
  return lower.split(/\s+/).map(word => {
    // Small words stay lowercase in Title Case
    if (["and", "or", "the", "a", "an", "of", "in", "on", "at", "to", "for", "via", "n"].includes(word)) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

/**
 * Extract a structured taste profile from raw store data.
 *
 * Pure function — no side effects, no React. Safe to call in
 * useMemo, useCallback, server route, or test.
 */
export function extractTasteProfile(input: TasteProfileInput): TasteProfile {
  const {
    history = [],
    likedTracksData = [],
    tasteGenres = {},
    tasteArtists = {},
    tasteMoods = {},
  } = input;

  // ── Explicit likes (from taste sliders) — sanitize each genre ──
  const topGenres = Object.entries(tasteGenres)
    .filter(([, v]) => v >= GENRE_LIKE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g)
    .map(g => sanitizeGenre(g))
    .filter((g): g is string => g !== null);

  const topArtists = Object.entries(tasteArtists)
    .filter(([, v]) => v >= GENRE_LIKE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([a]) => a);

  // ── History-derived signals — also sanitize ──
  const historyGenreCounts: Record<string, number> = {};
  const historyArtistCounts: Record<string, number> = {};
  for (const h of history.slice(0, HISTORY_SCAN_LIMIT)) {
    const rawGenre = (h.track.genre || "").trim();
    const genre = sanitizeGenre(rawGenre);
    const artist = (h.track.artist || "").trim();
    if (genre) historyGenreCounts[genre] = (historyGenreCounts[genre] || 0) + h.playCount;
    if (artist) historyArtistCounts[artist] = (historyArtistCounts[artist] || 0) + h.playCount;
  }
  const topHistoryGenres = Object.entries(historyGenreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);
  const topHistoryArtists = Object.entries(historyArtistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a]) => a);

  // ── Union of explicit + history ──
  const allGenres = [...new Set([...topGenres, ...topHistoryGenres])].slice(0, 6);
  const allArtists = [...new Set([...topArtists, ...topHistoryArtists])].slice(0, 5);

  // ── Moods ──
  const topMoods = Object.entries(tasteMoods)
    .filter(([, v]) => v >= MOOD_LIKE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);

  // ── Language detection (cyrillic vs latin) ──
  const langCounts: Record<string, number> = { russian: 0, english: 0 };
  for (const entry of [...likedTracksData, ...history.slice(0, 30)]) {
    const t: Track = "title" in entry && "artist" in entry ? (entry as Track) : (entry as HistoryEntry).track;
    const text = `${t.title || ""} ${t.artist || ""}`;
    const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    const total = cyrillic + latin;
    if (total === 0) continue;
    if (cyrillic / total > RUSSIAN_RATIO_THRESHOLD) langCounts.russian++;
    else if (latin / total > ENGLISH_RATIO_THRESHOLD) langCounts.english++;
  }
  const sortedLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  const language: TasteProfile["language"] =
    sortedLang[0]?.[1] > LANGUAGE_MIN_SIGNAL ? (sortedLang[0][0] as "russian" | "english") : "mixed";

  // ── Recent titles ──
  const recentTitles = history
    .slice(0, RECENT_TITLES_LIMIT)
    .map((h) => `${h.track.title} - ${h.track.artist}`);

  return {
    topGenres,
    topArtists,
    topHistoryGenres,
    topHistoryArtists,
    allGenres,
    allArtists,
    topMoods,
    language,
    recentTitles,
  };
}

/**
 * Build a single SoundCloud-friendly search query string from a taste profile.
 * Used by /api/music/radio as a fallback when LLM is unavailable.
 */
export function tasteProfileToSearchQuery(tp: TasteProfile): string {
  if (tp.allGenres.length === 0 && tp.allArtists.length === 0) {
    return "indie electronic chill";
  }
  const parts: string[] = [];
  if (tp.allGenres[0]) parts.push(tp.allGenres[0]);
  if (tp.allArtists[0]) parts.push(tp.allArtists[0]);
  if (parts.length === 0 && tp.allGenres[1]) parts.push(tp.allGenres[1]);
  return parts.join(" ").toLowerCase() || "indie chill";
}

/**
 * Human-readable summary of the user's taste for UI display.
 * Example: "Ваш вкус: lofi · chill · Mac DeMarco"
 */
export function tasteProfileToSummary(tp: TasteProfile): string {
  if (tp.allGenres.length === 0 && tp.allArtists.length === 0) {
    return "Слушайте больше музыки — AI изучит ваши предпочтения";
  }
  const parts: string[] = [];
  if (tp.allGenres.length > 0) parts.push(tp.allGenres.slice(0, 3).join(", "));
  if (tp.allArtists.length > 0) parts.push(tp.allArtists.slice(0, 2).join(", "));
  return `Ваш вкус: ${parts.join(" · ")}`;
}
