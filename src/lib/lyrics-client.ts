"use client";

/**
 * Client-side lyrics pipeline — the single entry point every player view uses.
 *
 * Provider chain (each hop normalizes into `LyricsResult`; LRCLIB synced is
 * always preferred over an earlier hop's plain text):
 *   1. LRCLIB direct (CORS-enabled) — exact get (artist+title[+album+duration])
 *      → loose get → fuzzy searches. Bypasses Vercel serverless, which is
 *      IP-blocked by lrclib.net's WAF.
 *   2. lyrics.ovh — plain text only, used when LRCLIB found nothing.
 *   3. Server relay `/api/music/lyrics` — server-side LRCLIB (different egress
 *      IP) + its own ovh fallback; used when the client cannot reach LRCLIB
 *      (ISP block etc.) or found nothing.
 *
 * All results are cached (see lyricsCache) and normalized to the internal
 * ms-based format. Never throws — errors come back as `error: LyricsError`.
 */

import {
  parseLrc,
  searchLrclib,
  hasContent,
  type LrcLibRecord,
} from "@/lib/lyrics/lrclib";
import {
  normalizeLegacyLines,
  withEndMs,
  type LyricsError,
  type LyricsQuery,
  type LyricsResult,
} from "@/lib/lyrics/types";
import { getCached, setCached } from "@/lib/lyricsCache";

export type { LyricLine, LyricsError, LyricsQuery, LyricsResult } from "@/lib/lyrics/types";

function cleanArtist(s: string): string {
  // Take only the first artist (before comma, " & ", " feat ", " ft ")
  const first = s
    .split(/[,，]|\s+[&＆]\s+|\s+(?:feat|ft|featuring)\.?\s+/i)[0]
    .trim();
  return clean(first);
}

function clean(s: string): string {
  return s
    .replace(/\s*[\(\[]\s*(official\s+(music\s+)?video|official\s+audio|official\s+lyrics?|lyrics?|audio|music\s+video|visualizer|hd|hq|4k|explicit|clean)\s*[\)\]]/gi, "")
    .replace(/\s*[\(\[]\s*(feat|ft|featuring)\.?\s+[^)\]]+[\)\]]/gi, "")
    // Remove remix/mix/edit/slowed/sped up info in parentheses
    .replace(/\s*[\(\[]\s*(remix|mix|edit|remaster\w*|deluxe|bonus|extended|radio\s+edit|club\s+mix|dirty|clean\s+version|slowed|sped\s+up|nightcore|reverb|bass\s+boosted)\w*\s*[\)\]]/gi, "")
    // Remove " - Remix" / " - Slowed" / " - Radio Edit" suffixes
    .replace(/\s*-\s*(remix|mix|edit|remaster\w*|radio\s+edit|club\s+mix|instrumental|acoustic|live|cover|bootleg|slowed|sped\s+up|nightcore|reverb|bass\s+boosted)\b.*$/i, "")
    .replace(/\s*-\s*topic\s*$/i, "")
    .replace(/^official\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── lyrics.ovh (free, CORS-enabled, plain text only) ────────────────────────

async function fetchLyricsOvh(artist: string, title: string): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const lyrics = data?.lyrics;
    if (typeof lyrics === "string" && lyrics.trim().length > 10) {
      return lyrics.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Server relay fallback (server-side LRCLIB + ovh) ────────────────────────

async function fetchServerFallback(q: LyricsQuery): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({ artist: q.artist, title: q.title });
    if (q.album) params.set("album", q.album);
    if (q.duration && q.duration > 0) params.set("duration", String(Math.round(q.duration)));
    const res = await fetch(`/api/music/lyrics?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Accept both the new normalized shape and the legacy one.
    const lines = Array.isArray(data.lines) && data.lines.length > 0
      ? data.lines
      : normalizeLegacyLines(data.lyrics);
    if (data.plainText || lines.length > 0) {
      return {
        lines: withEndMs(lines, q.duration),
        lyrics: lines.map((l) => ({ time: (l.startMs ?? 0) / 1000, text: l.text })),
        plainText: data.plainText || "",
        synced: lines.length > 0,
        source: "server",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Result builders ─────────────────────────────────────────────────────────

function fromLrclibRecord(rec: LrcLibRecord, duration?: number): LyricsResult {
  const lines = rec.syncedLyrics?.trim() ? parseLrc(rec.syncedLyrics) : [];
  const synced = lines.some((l) => l.startMs !== undefined);
  const plainText = rec.plainLyrics?.trim() || "";
  const withEnds = withEndMs(
    synced ? lines.filter((l) => l.startMs !== undefined) : [],
    duration ?? rec.duration ?? undefined,
  );
  return {
    lines: withEnds,
    lyrics: withEnds.map((l) => ({ time: (l.startMs ?? 0) / 1000, text: l.text })),
    plainText,
    synced: withEnds.length > 0,
    source: "lrclib",
  };
}

function plainOnly(plainText: string, source: LyricsResult["source"]): LyricsResult {
  return {
    lines: [],
    lyrics: [],
    plainText,
    synced: false,
    source,
  };
}

function none(error?: LyricsError): LyricsResult {
  return { lines: [], lyrics: [], plainText: "", synced: false, source: "none", error };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch lyrics for a track. Accepts a full query (artist/title/album/duration)
 * or the legacy `(artist, title)` call form.
 */
export async function fetchLyrics(query: LyricsQuery): Promise<LyricsResult>;
export async function fetchLyrics(artist: string, title: string): Promise<LyricsResult>;
export async function fetchLyrics(
  arg: LyricsQuery | string,
  legacyTitle?: string,
): Promise<LyricsResult> {
  const q: LyricsQuery = typeof arg === "string"
    ? { artist: arg, title: legacyTitle ?? "" }
    : arg;

  if (!q.artist?.trim() || !q.title?.trim()) {
    return none("invalid_metadata");
  }

  const artistClean = cleanArtist(q.artist);
  const titleClean = clean(q.title);
  const albumClean = q.album ? clean(q.album) : "";
  const duration = q.duration && q.duration > 0 ? q.duration : 0;

  // Check cache first — instant return on cache hit (0ms vs 200-500ms).
  // Key includes album/duration so sharper lookups don't reuse looser entries.
  const key = [
    artistClean.toLowerCase(),
    titleClean.toLowerCase(),
    albumClean.toLowerCase(),
    duration ? Math.round(duration) : 0,
  ].join("|");
  const cached = getCached(key);
  if (cached) return cached;

  // ── Hop 1: LRCLIB direct (synced preferred, spec §1) ──
  const { record, error } = await searchLrclib({
    artist: artistClean,
    title: titleClean,
    album: albumClean || undefined,
    duration: duration || undefined,
  });
  if (hasContent(record)) {
    const result = fromLrclibRecord(record as LrcLibRecord, duration || undefined);
    setCached(key, result);
    return result;
  }

  // ── Hop 2: lyrics.ovh (plain text only) ──
  const ovh = await fetchLyricsOvh(artistClean, titleClean);
  if (ovh) {
    const result = plainOnly(ovh, "lyrics-ovh");
    setCached(key, result);
    return result;
  }

  // ── Hop 3: server relay (LRCLIB server-side + ovh server-side) ──
  // Skip only on rate-limit — the relay may still have its own cache.
  const server = error === "rate_limited" ? null : await fetchServerFallback(q);
  if (server && (server.lines.length > 0 || server.plainText)) {
    setCached(key, server);
    return server;
  }

  // ── Nothing anywhere — normalize the failure mode ──
  const notFound: LyricsResult =
    error === "provider_unavailable" || error === "rate_limited"
      ? none(error)
      : none("not_found");
  setCached(key, notFound);
  return notFound;
}
