/**
 * Yandex → MQ track matching engine (CRITICAL — Phase 4).
 *
 * Yandex track IDs are NEVER carried over. Every track is re-found in MQ's
 * catalog (SoundCloud-backed search) by metadata, then scored:
 *
 *   1. EXACT      — normalized artist + feat-stripped title equality
 *   2. SCORED     — weighted (artist, title, duration) similarity with
 *                   version-marker awareness (remix/live/acoustic/…)
 *   3. DECISION   — matched / ambiguous / unmatched with thresholds.
 *
 * Core principle from the spec: better to leave a track unmatched than to
 * silently import the WRONG song. Ambiguous matches are surfaced to the user
 * with candidates for manual resolution; nothing below threshold is imported
 * automatically.
 *
 * Pure functions only — no network, no DB (testable in isolation).
 * The engine also understands SoundCloud's "Artist - Title" title packing:
 * candidates are scored against both the uploader-artist and the split title.
 */

import type { Track } from "@/lib/musicApi";
import type { YandexTrackMeta } from "./types";

// ── Normalization ─────────────────────────────────────────────────────────────

/** Russian + Latin normalization: case, ё→е, quotes, dashes, whitespace. */
export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u00A0|\u2007|\u202F/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NOISE_PATTERNS: RegExp[] = [
  /\(?\[?\b(official\s+)?(music\s+)?(video|audio|visualizer|lyric(s|\s+video)?)\b\]?\.?\)?$/i,
  /\(?\[?\bofficial\b\]?\.?\)?$/i,
  /\(?\[?\b(hq|hd|4k|mv)\b\]?\.?\)?$/i,
  /\(?\[?\bexplicit\b\]?\.?\)?$/i,
];

/** Title normalization for comparison: norm() + noise removal. */
export function normTitle(s: string): string {
  let out = norm(s);
  for (const p of NOISE_PATTERNS) {
    out = out.replace(p, "");
  }
  // Trim stray punctuation — but NEVER brackets: stripping a trailing ')' or
  // ']' breaks balanced pairs like "Song (feat. X)" and defeats feat parsing.
  return out.replace(/[\s\-\u2013\u2014:.!?,;"']+$/g, "").replace(/^[\s\-\u2013\u2014:.!?,;"']+/g, "").trim();
}

export function normArtist(s: string): string {
  let out = norm(s);
  // Common SoundCloud suffix noise in uploader names.
  out = out.replace(/\s*[-–—]\s*(topic|official|music|sounds|beats)\s*$/g, "");
  return out.replace(/^the\s+/g, "").trim();
}

// ── Feat / version parsing ───────────────────────────────────────────────────

export interface ParsedTitle {
  clean: string;        // feat-stripped, normalized title
  featArtists: string[];// artists credited inside the title
  markers: Set<string>; // version markers found (remix, live, …)
}

const FEAT_PATTERN =
  /[\(\[\{]\s*(?:feat\.?|ft\.?|featuring|с уч\.?)\s*([^\)\]\}]+)[\)\]\}]/gi;
const FEAT_INLINE_PATTERN = /\b(?:feat\.?|ft\.?|featuring)\s+([^\(\)\[\]\-–—]+)$/i;

/** Words that make a bracket/dash segment a VERSION marker, not content.
 *  "(Remix)", "- Live", "(Radio Edit)", "(2011 Remaster)" are recording
 *  variants — captured as markers and stripped from the clean title. */
const MARKER_SEGMENT =
  /(remix|remixes|bootleg|refix|flip|live|концертная|вживую|acoustic|акустик\w*|instrumental|инструментал\w*|минус|radio\s+(edit|version|mix)|extended|расширенн\w*|remaster\w*|переиздан\w*|cover|кавер|karaoke|караоке|version|версия|edit|mix|mixes|dub|dubbed|a\s?cappella|acapella|а\s+капелла|deluxe|explicit|original|bonus|single|album|mono|stereo)/i;

const MARKERS: Array<[string, RegExp]> = [
  ["remix", /\b(remix|remixes|bootleg|refix|flip)\b/i],
  ["live", /\b(live|концертная|вживую)\b/i],
  ["acoustic", /\b(acoustic|акустик)\w*\b/i],
  ["instrumental", /\b(instrumental|минус|инструментал\w*)\b/i],
  ["radio", /\b(radio\s+edit|radio\s+version|radio\s+mix)\b/i],
  ["extended", /\b(extended|расширенн\w+)\b/i],
  ["remaster", /\b(remaster\w*|переиздан\w+)\b/i],
  ["cover", /\b(cover|кавер)\b/i],
  ["karaoke", /\b(karaoke|караоке)\b/i],
  ["version", /\b(version|версия|version|edit|mix|mixes|dub|dubbed)\b/i],
  ["acapella", /\b(a\s?cappella|acapella|а капелла|инструментал without vocals)\b/i],
];

export function parseTitle(rawTitle: string): ParsedTitle {
  let title = normTitle(rawTitle);
  const featArtists: string[] = [];

  // (feat. X), [ft. X] …
  title = title.replace(FEAT_PATTERN, (_m, inside: string) => {
    for (const a of inside.split(/,|&| и /)) {
      const t = a.trim();
      if (t) featArtists.push(normArtist(t));
    }
    return " ";
  });

  // trailing "feat. X" without brackets
  const inline = title.match(FEAT_INLINE_PATTERN);
  if (inline) {
    for (const a of (inline[1] as string).split(/,|&| и /)) {
      const t = a.trim();
      if (t) featArtists.push(normArtist(t));
    }
    title = title.slice(0, inline.index).trim();
  }

  // Detect version markers FIRST (on the full title), then strip the marker
  // segments from the clean title — "song (remix)" → markers={remix}, "song".
  const markers = new Set<string>();
  for (const [name, re] of MARKERS) {
    if (re.test(title)) markers.add(name);
  }
  title = title.replace(/[\(\[]([^\)\]]{1,40})[\)\]]/g, (full: string, inner: string) => {
    const words = inner.split(/\s+/).filter(Boolean);
    const isMarkerOnly = words.length > 0 && words.every((w) => MARKER_SEGMENT.test(w) || /^\d{2,4}$/.test(w));
    return isMarkerOnly ? " " : full;
  });
  const dashTail = title.match(/\s+-\s+([^-]{1,40})$/);
  if (dashTail && dashTail.index !== undefined) {
    const words = (dashTail[1] as string).split(/\s+/).filter(Boolean);
    const isMarkerOnly = words.length > 0 && words.every((w) => MARKER_SEGMENT.test(w) || /^\d{2,4}$/.test(w));
    if (isMarkerOnly) title = title.slice(0, dashTail.index);
  }

  return { clean: title.replace(/\s{2,}/g, " ").trim(), featArtists, markers };
}

// ── Similarity primitives ─────────────────────────────────────────────────────

/** Classic Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** 0..1 similarity via Levenshtein ratio. */
export function levRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

/** 0..1 similarity via token-set overlap (Jaccard). */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function artistPairScore(ya: string, mq: string): number {
  const a = normArtist(ya);
  const b = normArtist(mq);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Word-boundary containment for short handles ("kiss" vs "kiss official")
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 4 && (a.includes(b) || b.includes(a))) {
    const wordBoundary = new RegExp(`(^| )${minLen === a.length ? a : b}( |$)`);
    if (wordBoundary.test(minLen === a.length ? b : a)) return 0.94;
  }
  return Math.max(levRatio(a, b), tokenJaccard(a, b) * 0.96);
}

/** Best artist score across Yandex's credited artists (primary weighted higher). */
export function artistScore(yandexArtists: string[], mqArtist: string): number {
  const list = yandexArtists.map(normArtist).filter(Boolean);
  if (!list.length || !mqArtist) return 0;
  const scores = list.map((a) => artistPairScore(a, mqArtist));
  const primary = scores[0]!;
  const rest = scores.slice(1);
  const bestSecondary = rest.length ? Math.max(...rest) : 0;
  return Math.max(primary, bestSecondary * 0.92);
}

function markerPenalty(ya: Set<string>, mq: Set<string>): number {
  const significant = new Set(["remix", "live", "acoustic", "instrumental", "karaoke", "acapella", "cover"]);
  let penalty = 1;
  for (const m of significant) {
    const a = ya.has(m);
    const b = mq.has(m);
    if (a !== b) {
      // Live vs studio and remix vs original are DIFFERENT recordings —
      // importing the wrong one silently is the worst failure mode.
      if (m === "live") penalty *= 0.6;
      else if (m === "remix") penalty *= 0.72;
      else penalty *= 0.85;
    }
  }
  return penalty;
}

/** Title similarity 0..1 (feat-stripped, marker-aware). */
export function titleScore(yaParsed: ParsedTitle, mqParsed: ParsedTitle): number {
  const a = yaParsed.clean;
  const b = mqParsed.clean;
  if (!a || !b) return 0;
  // Equal clean titles STILL pay the marker penalty — "Song" vs "Song (Live)"
  // are different recordings even though the base titles match.
  if (a === b) return markerPenalty(yaParsed.markers, mqParsed.markers);
  let base: number;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (shorter && longer.includes(shorter)) {
    // SoundCloud titles often append extras ("… (Original Mix)"); containment is strong
    base = 0.93;
  } else {
    base = 0.55 * levRatio(a, b) + 0.45 * tokenJaccard(a, b);
  }
  return Math.min(1, base * markerPenalty(yaParsed.markers, mqParsed.markers));
}

/** Duration agreement 0..1 (both in seconds). Unknown duration is neutral. */
export function durationScore(yaSec: number, mqSec: number): number {
  if (!yaSec || !mqSec) return 0.75; // neutral — don't punish unknown
  const d = Math.abs(yaSec - mqSec);
  if (d <= 3) return 1;
  if (d <= 6) return 0.95;
  if (d <= 12) return 0.8;
  if (d <= 25) return 0.5;
  return 0.05; // very different length — almost certainly a different cut
}

// ── Candidate scoring ─────────────────────────────────────────────────────────

export interface ScoredCandidate {
  track: Track;
  score: number;
  artist: number;
  title: number;
  duration: number;
}

/**
 * Score one MQ candidate against a Yandex track.
 * SoundCloud packs "Artist - Title" into the track title half the time, so we
 * also try the split interpretation and take the best score.
 */
export function scoreCandidate(ya: YandexTrackMeta, cand: Track): ScoredCandidate {
  const yaParsed = parseTitle(ya.title);
  const yaArtists = ya.artists.length ? ya.artists : yaParsed.featArtists;

  const splitMatch = (cand.title || "").match(/^(.{2,80}?)\s+[-–—]\s+(.{2,})(?:\s+[-–—]\s+.+)?$/);
  const interpretations: Array<{ artist: string; title: string }> = [
    { artist: cand.artist || "", title: cand.title || "" },
  ];
  if (splitMatch && cand.artist) {
    // "Artist - Title" packing — treat the uploader as label-ish and prefer… no,
    // score BOTH and let the max win.
    interpretations.push({ artist: splitMatch[1] || "", title: splitMatch[2] || "" });
  }

  let best = { artist: 0, title: 0 };
  for (const it of interpretations) {
    const a = artistScore(yaArtists, it.artist);
    const t = titleScore(yaParsed, parseTitle(it.title));
    const combo = a * 0.47 + t * 0.53; // weight title slightly higher inside the interpretation
    const bestCombo = best.artist * 0.47 + best.title * 0.53;
    if (combo > bestCombo) best = { artist: a, title: t };
  }

  const dur = durationScore(Math.round((ya.durationMs || 0) / 1000), cand.duration || 0);
  const score = Math.min(1, 0.4 * best.artist + 0.46 * best.title + 0.14 * dur);
  return { track: cand, score, artist: best.artist, title: best.title, duration: dur };
}

export type MatchStatus = "matched" | "ambiguous" | "unmatched";

export interface MatchResult {
  status: MatchStatus;
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[]; // top alternatives for manual resolution
  exact: boolean;
}

export const THRESHOLDS = {
  /** overall score to auto-accept a match */
  MATCH_SCORE: 0.9,
  /** minimum artist agreement to auto-accept */
  MATCH_ARTIST: 0.84,
  /** top-2 gap below which we call it ambiguous */
  AMBIGUITY_GAP: 0.05,
  /** top-2 floor for the "two good candidates" ambiguity */
  AMBIGUOUS_SECOND: 0.82,
  /** single weak candidate → still offer manual resolution, never auto-import */
  MANUAL_FLOOR: 0.62,
} as const;

/** Decide matched / ambiguous / unmatched from scored candidates. */
export function decideMatch(ya: YandexTrackMeta, scored: ScoredCandidate[]): MatchResult {
  const yaParsed = parseTitle(ya.title);
  const yaArtists = (ya.artists.length ? ya.artists : yaParsed.featArtists).map(normArtist).filter(Boolean);
  const yaDurSec = Math.round((ya.durationMs || 0) / 1000);

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0] ?? null;
  const second = sorted[1] ?? null;

  const durOk = (dur: number) => durationScore(yaDurSec, dur) >= 0.5;

  // 1) EXACT: normalized artist + feat-stripped title both equal — and the
  //    durations agree (a 4-minute difference means a different cut, e.g.
  //    extended vs album version; never auto-accept those silently).
  for (const c of sorted) {
    const candParsed = parseTitle(c.track.title || "");
    const split = (c.track.title || "").match(/^(.{2,80}?)\s+[-\u2013\u2014]\s+(.{2,})/);
    const candArtists = [normArtist(c.track.artist || ""), split ? normArtist(split[1] || "") : ""].filter(Boolean);
    const candTitles = [candParsed.clean, split ? normTitle(split[2] || "") : ""].filter(Boolean);
    const artistExact = candArtists.some((a) => yaArtists.includes(a));
    const titleExact = candTitles.some((t) => t && t === yaParsed.clean);
    if (artistExact && titleExact && durOk(c.track.duration || 0)) {
      return { status: "matched", best: c, candidates: sorted.slice(0, 3), exact: true };
    }
  }

  if (!top) return { status: "unmatched", best: null, candidates: [], exact: false };

  // 2) TWO equally strong candidates → ambiguous: we cannot tell which
  //    recording is the right one, so the user decides (never silently pick).
  if (
    second &&
    top.score >= THRESHOLDS.AMBIGUOUS_SECOND &&
    second.score >= THRESHOLDS.AMBIGUOUS_SECOND &&
    top.score - second.score < THRESHOLDS.AMBIGUITY_GAP
  ) {
    return { status: "ambiguous", best: top, candidates: sorted.slice(0, 3), exact: false };
  }

  // 3) One strong, clearly ahead candidate
  if (top.artist >= THRESHOLDS.MATCH_ARTIST && top.score >= THRESHOLDS.MATCH_SCORE) {
    return { status: "matched", best: top, candidates: sorted.slice(0, 3), exact: false };
  }

  // 4) Decent but not confident → ambiguous (manual resolution), never silent
  if (top.score >= THRESHOLDS.MANUAL_FLOOR) {
    return { status: "ambiguous", best: top, candidates: sorted.slice(0, 3), exact: false };
  }

  // 5) Nothing close enough to even offer
  return { status: "unmatched", best: null, candidates: sorted.filter((c) => c.score >= 0.5).slice(0, 3), exact: false };
}

/** Full pipeline for one track. */
export function matchTrack(ya: YandexTrackMeta, candidates: Track[]): MatchResult {
  const scored = candidates.map((c) => scoreCandidate(ya, c));
  return decideMatch(ya, scored);
}

/** Case-preserving feat-stripped title for SEARCH queries (search engines
 *  benefit from original casing; normalization is for comparison only). */
export function searchTitle(rawTitle: string): string {
  let t = (rawTitle || "").trim();
  t = t.replace(/[\(\[\{]\s*(?:feat\.?|ft\.?|featuring|с уч\.?)\s*[^\)\]\}]+[\)\]\}]/gi, " ");
  const inline = t.match(/\b(?:feat\.?|ft\.?|featuring)\s+[^\(\)\[\]]+$/i);
  if (inline && inline.index !== undefined) t = t.slice(0, inline.index);
  return t.replace(/\s{2,}/g, " ").trim().slice(0, 120);
}

/** Search query variants for a Yandex track (primary artist first). */
export function searchQueries(ya: YandexTrackMeta): string[] {
  const title = searchTitle(ya.title) || ya.title;
  const parsed = parseTitle(ya.title);
  const artists = ya.artists.length ? ya.artists : parsed.featArtists;
  const queries: string[] = [];
  if (artists.length) {
    queries.push(`${artists[0]} ${title}`);
    if (artists.length > 1) queries.push(`${artists.slice(0, 2).join(" ")} ${title}`);
  }
  if (!queries.length || queries[0]!.length < 4) queries.push(title);
  // Dedup + cap
  return [...new Set(queries.map((q) => q.trim()))].slice(0, 2);
}

