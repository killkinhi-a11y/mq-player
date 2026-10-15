"use client";

/**
 * Word-level lyrics support — REAL per-word timings from industry formats.
 *
 * Legal note: this module uses `@braccato/parsers` (MIT, an independent
 * open-source project) for format parsing. No Liner code is involved — the
 * Liner desktop client and its private API are licensed Source-Available
 * NON-COMMERCIAL with an explicit prohibition on extracting lyrics-sync
 * mechanics into third-party products, so MQ implements its own pipeline on
 * MIT-licensed building blocks instead.
 *
 * Formats handled here (all industry standards, not vendor IP):
 *  - TTML (word-synced, Apple Music style): `<span begin end>` per word
 *  - QRC (QQ Music karaoke): `word(duration,)` per line
 *  - Enhanced LRC (word-by-word): `<mm:ss.xx>` tags inside lines
 *  - Plain LRC / SRT / plain text: line-level or unsynced (honest fallback)
 *
 * The honesty contract (types.SyncLevel): "word" is ONLY ever set when the
 * source itself states per-word timings. Line-level data is returned as
 * line-level — never dressed up as word-synced.
 */

import {
  detectFormat,
  parseLRC,
  parseTTMLContent,
  parseQRC,
  SRTParser,
} from "@braccato/parsers";
import type { Lyric as BraccatoLyric } from "@braccato/parsers";
import type { LyricLine, LyricWord, SyncLevel } from "./types";
import { syncLevelOf } from "./types";

/** A word with its spacing decision for rendering. */
export type WordToken = LyricWord & {
  /** True when the source text has a whitespace gap AFTER this token. */
  spaceAfter?: boolean;
};

/** Quick check: does an LRC body carry enhanced (word) timestamps? */
export function hasEnhancedLrcWordTags(lrcBody: string): boolean {
  return /<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/.test(lrcBody || "");
}

function collapse(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

/**
 * Attach spacing by walking the collapsed line text against the part texts.
 * Returns null when the walk fails (text mismatch) — callers then fall back
 * to conservative "space between every token" rendering.
 */
function spaceMapFromText(target: string, partTexts: string[]): boolean[] | null {
  const t = collapse(target);
  if (!t) return null;
  const out: boolean[] = [];
  let pos = 0;
  for (let i = 0; i < partTexts.length; i++) {
    const needle = collapse(partTexts[i]);
    if (!needle) {
      out.push(i > 0 ? out[i - 1] : false);
      continue;
    }
    const idx = t.indexOf(needle, pos);
    if (idx < 0) return null; // text mismatch — bail to the safe default
    const after = idx + needle.length;
    // Peek at the next non-empty part to decide the gap.
    let next = i + 1;
    while (next < partTexts.length && !collapse(partTexts[next])) next++;
    if (next >= partTexts.length) {
      out.push(false);
      pos = after;
      continue;
    }
    const nextNeedle = collapse(partTexts[next]);
    const nextIdx = t.indexOf(nextNeedle, after);
    const gap = nextIdx >= 0 ? t.slice(after, nextIdx) : "";
    out.push(/\s/.test(gap));
    pos = after;
  }
  return out;
}

/**
 * Convert one braccato `Lyric` (with optional `parts`) into an MQ
 * `LyricLine`. Word tokens carry REAL timings from the source; spacing is
 * recovered from the line text. `nextStartMs` bounds the line end when the
 * document does not state one.
 */
function fromBraccatoLine(
  b: BraccatoLyric,
  nextStartMs?: number,
  durationMs?: number,
): LyricLine {
  const lineText = collapse(b.words);
  const rawParts = (b.parts || []).filter(
    (p) => collapse(p.words || "").length > 0,
  );
  if (rawParts.length === 0) {
    // Line-level (plain LRC) or instrumental TTML line.
    return { text: lineText, startMs: b.startTimeMs };
  }

  // ── Recover missing prefix/suffix text (enhanced LRC drops the text
  //    before the first <word> tag into the line body; walk fixes it) ──
  const firstPartText = collapse(rawParts[0].words);
  const firstIdx = lineText.indexOf(firstPartText);
  const prefix = firstIdx > 0 ? lineText.slice(0, firstIdx).trim() : "";
  const lastPartText = collapse(rawParts[rawParts.length - 1].words);
  const lastIdx = lineText.lastIndexOf(lastPartText);
  const suffix =
    lastIdx >= 0 && lastIdx + lastPartText.length < lineText.length
      ? lineText.slice(lastIdx + lastPartText.length).trim()
      : "";

  // ── Line end: stated duration wins; else next line; else track bound ──
  let lineEndMs: number | undefined;
  const statedEnd = b.startTimeMs + Math.max(0, b.durationMs);
  if (b.durationMs > 0) {
    const bound = nextStartMs ?? durationMs ?? statedEnd;
    // LRC "duration" can run to the track end (padded) — accept it only
    // when it does not overlap the next line.
    lineEndMs = statedEnd <= bound + 250 ? statedEnd : undefined;
  }
  if (lineEndMs === undefined) {
    lineEndMs =
      nextStartMs !== undefined
        ? nextStartMs
        : durationMs && durationMs > b.startTimeMs + 50
          ? durationMs
          : b.startTimeMs + 5000;
  }

  // ── Word tokens from parts ──
  const tokens: WordToken[] = [];
  if (prefix) {
    tokens.push({
      text: prefix,
      startMs: b.startTimeMs,
      endMs: rawParts[0].startTimeMs,
      spaceAfter: true,
    });
  }
  const spacing = spaceMapFromText(lineText, rawParts.map((p) => p.words));
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i];
    const nextPart = rawParts[i + 1];
    let end = p.startTimeMs + Math.max(0, p.durationMs);
    if (end <= p.startTimeMs || end > (nextPart?.startTimeMs ?? Infinity)) {
      // Zero/absent duration, or overlap: end at the next token's start.
      end = nextPart ? nextPart.startTimeMs : lineEndMs;
    }
    if (end <= p.startTimeMs) end = Math.min(p.startTimeMs + 400, lineEndMs);
    tokens.push({
      text: collapse(p.words),
      startMs: p.startTimeMs,
      endMs: end,
      spaceAfter: spacing ? spacing[i] : true,
    });
  }
  if (suffix) {
    const last = tokens[tokens.length - 1];
    tokens.push({
      text: suffix,
      startMs: last?.endMs ?? lineEndMs,
      endMs: lineEndMs,
      spaceAfter: false,
    });
  }

  return {
    text: lineText,
    startMs: b.startTimeMs,
    endMs: lineEndMs,
    words: tokens,
  };
}

/** Convert a braccato `Lyric[]` document into MQ normalized lines. */
export function fromBraccato(
  doc: BraccatoLyric[],
  durationMs?: number,
): LyricLine[] {
  const out: LyricLine[] = [];
  for (let i = 0; i < doc.length; i++) {
    const next = doc[i + 1];
    out.push(
      fromBraccatoLine(
        doc[i],
        next ? next.startTimeMs : undefined,
        durationMs,
      ),
    );
  }
  return out;
}

/** Outcome of parsing a synced-lyrics document (file or provider payload). */
export interface ParsedSyncedDoc {
  lines: LyricLine[];
  syncLevel: SyncLevel;
  /** Detected source format id (for UI labels / debugging). */
  format: "ttml" | "lrc" | "qrc" | "srt" | "plain" | "unknown";
}

/**
 * Parse ANY synced-lyrics document into normalized MQ lines with the honest
 * sync level. Supported: TTML (word), QRC (word), enhanced LRC (word),
 * plain LRC (line), SRT (line), plain text. Never throws — an unparseable
 * document yields `{ lines: [], syncLevel: "plain" }`.
 */
export function parseSyncedDocument(
  raw: string,
  opts: { durationMs?: number } = {},
): ParsedSyncedDoc {
  const empty: ParsedSyncedDoc = { lines: [], syncLevel: "plain", format: "unknown" };
  if (!raw || !raw.trim()) return empty;
  const durationMs =
    opts.durationMs && opts.durationMs > 0 ? Math.round(opts.durationMs) : undefined;
  try {
    // QRC envelopes carry LRC-style timestamps inside their XML attribute
    // bodies, which the generic detector classifies as LRC — the envelope
    // marker wins (checked BEFORE detectFormat).
    const isQrcEnvelope =
      raw.includes("<QrcInfos>") || raw.includes("LyricContent=");
    const format = isQrcEnvelope ? "qrc" : detectFormat(raw);
    if (format === "ttml") {
      const { lyrics, isWordSynced } = parseTTMLContent(raw, {
        songDurationMs: durationMs,
      });
      const lines = fromBraccato(lyrics, durationMs);
      return {
        lines,
        // Only trust "word" when the parser saw per-word timing AND at
        // least one converted line actually carries word tokens.
        syncLevel:
          isWordSynced && lines.some((l) => l.words && l.words.length)
            ? "word"
            : syncLevelOf(lines),
        format: "ttml",
      };
    }
    if (format === "qrc") {
      const lyrics = parseQRC(raw, durationMs ?? 0);
      const lines = fromBraccato(lyrics, durationMs);
      return { lines, syncLevel: syncLevelOf(lines), format: "qrc" };
    }
    if (format === "lrc") {
      const lyrics = parseLRC(raw, durationMs ?? 0);
      const lines = fromBraccato(lyrics, durationMs);
      return { lines, syncLevel: syncLevelOf(lines), format: "lrc" };
    }
    if (format === "srt") {
      const lyrics = SRTParser.parse(raw, durationMs ?? 0);
      const lines = fromBraccato(lyrics, durationMs);
      return { lines, syncLevel: syncLevelOf(lines), format: "srt" };
    }
    if (format === "plain") {
      // Plain text carries no timings — the caller renders it honestly as
      // unsynced text (never a fake sync).
      return { lines: [], syncLevel: "plain", format: "plain" };
    }
    return empty;
  } catch {
    return empty;
  }
}

/**
 * Parse an LRCLIB `syncedLyrics` payload which MAY be enhanced (word-level)
 * LRC. Returns word-level lines when word tags are present, else null (the
 * caller keeps its own proven line-level parseLrc path).
 */
export function parseEnhancedLrc(
  syncedLyrics: string,
  durationMs?: number,
): LyricLine[] | null {
  if (!hasEnhancedLrcWordTags(syncedLyrics)) return null;
  try {
    const doc = parseLRC(syncedLyrics, durationMs ?? 0);
    const lines = fromBraccato(doc, durationMs);
    return lines.some((l) => l.words && l.words.length) ? lines : null;
  } catch {
    return null;
  }
}

export type { LyricWord };
