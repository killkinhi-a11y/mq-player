/**
 * LRCLIB provider — https://lrclib.net (free, CORS-enabled, no API key).
 *
 * Search strategy (per MQ spec §1):
 *  1. `/api/get?artist_name&track_name[&album_name][&duration]` — EXACT
 *     match, sharpened by album + duration when the player knows them.
 *  2. `/api/get` without album/duration (metadata-light fallback).
 *  3. `/api/search?q=…` fuzzy searches (title-only, artist+title, short title).
 *
 * Preferrence: synced (LRC) over plain — LRCLIB synced beats any plain-only
 * result from an earlier hop (spec: "если основной provider дал только plain
 * text, а LRCLIB имеет synced lyrics — предпочесть synced").
 *
 * Error mapping is normalized at this boundary:
 *  - HTTP 404/empty  → "not_found" (provider REACHABLE, track unknown)
 *  - HTTP 429        → "rate_limited"
 *  - abort/network   → "provider_unavailable"
 */

import type { LyricLine, LyricsError } from "./types";

const LRCLIB_BASE = "https://lrclib.net/api";

/** Raw LRCLIB record (subset we consume). */
export interface LrcLibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Provider hop outcome: distinguishes "reached but no match" from "unreachable". */
export type LrclibHop =
  | { kind: "ok"; record: LrcLibRecord | null }
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" };

/** Parse LRC text into normalized ms-based lines. Tolerates malformed input:
 *  lines without a valid [mm:ss.xx] tag are skipped (never fake a timestamp). */
export function parseLrc(lrcText: string): LyricLine[] {
  const out: LyricLine[] = [];
  if (!lrcText) return out;
  // Multiple timestamps per line "[00:12.00][00:15.00]text" are valid LRC —
  // emit one entry per tag.
  const lineRe = /((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)/g;
  const tagRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrcText.split(/\r?\n/)) {
    lineRe.lastIndex = 0;
    const m = lineRe.exec(raw);
    if (!m) continue;
    const text = m[2].trim();
    let tag: RegExpExecArray | null;
    let tagged = false;
    while ((tag = tagRe.exec(m[1])) !== null) {
      tagged = true;
      const minutes = parseInt(tag[1], 10);
      const seconds = parseInt(tag[2], 10);
      const fracRaw = tag[3] ?? "0";
      const frac = parseInt(fracRaw, 10) * Math.pow(10, 3 - fracRaw.length);
      if (!isFinite(minutes) || !isFinite(seconds)) continue;
      out.push({
        text,
        startMs: Math.round((minutes * 60 + seconds) * 1000 + frac),
      });
    }
    if (!tagged && text) {
      // Untagged content line inside a "synced" payload — treat as unsynced
      // filler: keep the text without inventing a timestamp.
      out.push({ text });
    }
  }
  // Sort by start time; unsynced fillers (no startMs) sink to the end.
  out.sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  return out;
}

/** True when the record carries actual lyrics content. */
export function hasContent(rec: LrcLibRecord | null | undefined): boolean {
  return !!rec && (!!rec.syncedLyrics || !!rec.plainLyrics) && rec.instrumental !== true;
}

/** Best record by spec preference: synced > plain. */
export function pickBest(records: (LrcLibRecord | null)[]): LrcLibRecord | null {
  const real = records.filter(hasContent) as LrcLibRecord[];
  return real.find((r) => r.syncedLyrics?.trim()) ?? real[0] ?? null;
}

async function fetchJson(url: string, timeoutMs: number): Promise<LrclibHop> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      // NOTE (historic): lrclib.net's WAF blocks UAs with parentheses.
      headers: { "User-Agent": "MQPlayer/1.0" },
    });
    if (res.status === 429) return { kind: "rate_limited" };
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "not_found" };
    const text = await res.text();
    if (!text) return { kind: "not_found" };
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return { kind: "ok", record: parsed.length > 0 ? (parsed[0] as LrcLibRecord) : null };
      }
      if (parsed && typeof parsed === "object") return { kind: "ok", record: parsed as LrcLibRecord };
      return { kind: "not_found" };
    } catch {
      return { kind: "not_found" };
    }
  } catch {
    return { kind: "unavailable" };
  }
}

export interface LrclibSearchArgs {
  artist: string;
  title: string;
  album?: string;
  /** Track duration in seconds. LRCLIB tolerates ±2s-ish; we round. */
  duration?: number;
  timeoutMs?: number;
}

/**
 * Run the LRCLIB strategy chain for one lookup. Returns the best record and
 * a normalized error when nothing was found. Never throws.
 */
export async function searchLrclib(
  args: LrclibSearchArgs,
): Promise<{ record: LrcLibRecord | null; error?: LyricsError }> {
  const { artist, title, album, duration } = args;
  const timeout = args.timeoutMs ?? 6000;
  const hops: LrclibHop[] = [];

  // ── Strategy 1+2 in parallel: exact /api/get (with and without album+duration)
  const getParams = new URLSearchParams({
    artist_name: artist,
    track_name: title,
  });
  if (album) getParams.set("album_name", album);
  if (duration && duration > 0) getParams.set("duration", String(Math.round(duration)));

  const [exact, exactLoose] = await Promise.all([
    album || duration
      ? fetchJson(`${LRCLIB_BASE}/get?${getParams.toString()}`, timeout)
      : null,
    fetchJson(
      `${LRCLIB_BASE}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
      timeout,
    ),
  ]);
  // Only REAL network hops count toward reachability (a skipped strategy
  // must not fake "provider reached").
  if (exact) hops.push(exact);
  if (exactLoose) hops.push(exactLoose);

  let best = pickBest([
    exact?.kind === "ok" ? exact.record : null,
    exactLoose.kind === "ok" ? exactLoose.record : null,
  ]);
  if (best?.syncedLyrics?.trim()) {
    return { record: best };
  }

  // ── Strategy 3: fuzzy searches (parallel). Prefer a synced hit over an
  // earlier plain-only hit (spec preference).
  const [byTitle, byBoth] = await Promise.all([
    fetchJson(`${LRCLIB_BASE}/search?q=${encodeURIComponent(title)}`, timeout),
    fetchJson(`${LRCLIB_BASE}/search?q=${encodeURIComponent(`${artist} ${title}`)}`, timeout),
  ]);
  hops.push(byTitle, byBoth);

  best = pickBest([
    best,
    byTitle.kind === "ok" ? byTitle.record : null,
    byBoth.kind === "ok" ? byBoth.record : null,
  ]);
  if (best) return { record: best };

  // ── Strategy 4: short title (first 3 words) — helps long subtitled names.
  if (title.includes(" ")) {
    const short = title.split(" ").slice(0, 3).join(" ");
    const shortHop = await fetchJson(`${LRCLIB_BASE}/search?q=${encodeURIComponent(short)}`, timeout);
    hops.push(shortHop);
    const rec = shortHop.kind === "ok" ? shortHop.record : null;
    if (hasContent(rec)) {
      // Only accept when it plausibly matches the artist too (search is fuzzy).
      if (!artist || (rec as LrcLibRecord).artistName?.toLowerCase().includes(artist.split(/\s+/)[0].toLowerCase())) {
        return { record: rec as LrcLibRecord };
      }
    }
  }

  // ── Normalize the failure mode ──
  if (hops.some((h) => h.kind === "rate_limited")) return { record: null, error: "rate_limited" };
  const reached = hops.some((h) => h.kind === "ok" || h.kind === "not_found");
  if (!reached) return { record: null, error: "provider_unavailable" };
  return { record: null, error: "not_found" };
}

/** Exported for tests / the server relay. */
export const lrclibFetchJson = fetchJson;
