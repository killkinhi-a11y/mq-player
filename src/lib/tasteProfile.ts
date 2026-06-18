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

  // ── Explicit likes (from taste sliders) ──
  const topGenres = Object.entries(tasteGenres)
    .filter(([, v]) => v >= GENRE_LIKE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);

  const topArtists = Object.entries(tasteArtists)
    .filter(([, v]) => v >= GENRE_LIKE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([a]) => a);

  // ── History-derived signals ──
  const historyGenreCounts: Record<string, number> = {};
  const historyArtistCounts: Record<string, number> = {};
  for (const h of history.slice(0, HISTORY_SCAN_LIMIT)) {
    const genre = (h.track.genre || "").trim();
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
