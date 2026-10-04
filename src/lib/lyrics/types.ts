/**
 * Lyrics domain types — the single normalized internal format for MQ.
 *
 * Every lyrics provider (LRCLIB direct, LRCLIB via server relay, lyrics.ovh,
 * future ones) normalizes into `Lyrics`/`LyricLine` BEFORE reaching the UI.
 * Line timings are milliseconds (`startMs`/`endMs`) — precise enough for
 * karaoke line progress even on long tracks, and source-agnostic.
 *
 * Legacy shape `{ time: number; text: string }` (seconds) is still accepted
 * at the boundaries (old caches, older API responses, test fixtures) via
 * `normalizeLegacyLines`.
 */

/** One lyrics line. `startMs`/`endMs` in MILLISECONDS. */
export type LyricLine = {
  text: string;
  /** Line start, ms from track start. Undefined on plain (unsynced) lines. */
  startMs?: number;
  /** Line end, ms from track start. LRCLIB is line-level only: endMs is the
   *  next line's start (or the track duration bound for the last line). */
  endMs?: number;
};

/** Normalized lyrics payload used across the whole app. */
export type Lyrics = {
  /** Provider id: "lrclib" | "lyrics-ovh" | "server" | "none". */
  source: string;
  synced: boolean;
  lines: LyricLine[];
};

/** Normalized lyrics error — NEVER a raw exception in the UI. */
export type LyricsError =
  | "not_found"
  | "provider_unavailable"
  | "invalid_metadata"
  | "rate_limited";

/** Query for a lyrics lookup. album/duration improve LRCLIB precision. */
export interface LyricsQuery {
  artist: string;
  title: string;
  /** Album name, when known — sharpens LRCLIB /api/get exact matching. */
  album?: string;
  /** Track duration in SECONDS, when known — LRCLIB matches near-durations. */
  duration?: number;
}

/** Result of the client lyrics pipeline (normalized). */
export interface LyricsResult {
  /** Normalized synced lines (empty when only plain text is available). */
  lines: LyricLine[];
  /** Legacy synced lines in seconds — kept for older consumers/mocks. */
  lyrics: { time: number; text: string }[];
  /** Plain (unsynced) lyrics text, when the provider only has that. */
  plainText: string;
  synced: boolean;
  source: "lrclib" | "lyrics-ovh" | "server" | "none";
  /** Normalized error code (absent on success). */
  error?: LyricsError;
}

/** Human-readable RU message for a normalized lyrics error. */
export function lyricsErrorMessage(error: LyricsError | undefined): string {
  switch (error) {
    case "not_found":
      return "Текст не найден";
    case "provider_unavailable":
      return "Сервис текстов недоступен. Попробуйте позже";
    case "invalid_metadata":
      return "Недостаточно данных о треке";
    case "rate_limited":
      return "Слишком много запросов. Попробуйте позже";
    default:
      return "Текст не найден";
  }
}

const LYRICS_ERROR_CODES: ReadonlySet<string> = new Set([
  "not_found",
  "provider_unavailable",
  "invalid_metadata",
  "rate_limited",
]);

/**
 * Normalize ANY error value the UI receives — a typed LyricsError code, a
 * string that IS such a code (legacy callers), or a custom human message.
 * Never returns a raw error object into the DOM (spec §12).
 */
export function lyricsErrorText(
  error: string | LyricsError | null | undefined,
): string | null {
  if (!error) return null;
  if (typeof error === "string") {
    return LYRICS_ERROR_CODES.has(error) ? lyricsErrorMessage(error as LyricsError) : error;
  }
  return lyricsErrorMessage(error);
}

/** Convert legacy second-based lines `{time, text}` into the ms format. */
export function normalizeLegacyLines(
  legacy: { time: number; text: string }[] | undefined | null,
): LyricLine[] {
  if (!legacy || !legacy.length) return [];
  return legacy.map((l) => ({ text: l.text, startMs: Math.round(l.time * 1000) }));
}

/**
 * Compute `endMs` for synced lines. EXISTING endMs values are preserved
 * when valid (they carry the provider's more precise timing — spec §1
 * "если LRCLIB предоставляет более точные тайминги, сохранить их"); missing
 * ones are derived: each line ends where the next starts; the last line is
 * bounded by the track duration when known. Returns a NEW array.
 */
export function withEndMs(lines: LyricLine[], durationSec?: number): LyricLine[] {
  if (!lines.length) return lines;
  const durationMs =
    durationSec && durationSec > 0 ? Math.round(durationSec * 1000) : 0;
  return lines.map((line, i) => {
    const startMs = line.startMs ?? 0;
    let endMs: number | undefined;
    if (typeof line.endMs === "number" && line.endMs >= startMs) {
      // Provider's own (more precise) timing wins.
      endMs = line.endMs;
    } else {
      endMs = i + 1 < lines.length ? (lines[i + 1].startMs ?? startMs) : undefined;
      if (endMs === undefined && durationMs > startMs + 50) {
        endMs = durationMs;
      }
    }
    if (endMs !== undefined && endMs < startMs) endMs = startMs;
    return { ...line, startMs, endMs };
  });
}

/** Seconds helper: line start in seconds (0 when unsynced). */
export function lineStartSec(line: LyricLine): number {
  return (line.startMs ?? 0) / 1000;
}
