"use client";

/**
 * Client-side lyrics fetcher — fetches directly from lrclib.net (CORS-enabled).
 * Bypasses Vercel serverless which is IP-blocked by lrclib.net's WAF.
 *
 * Tries 3 strategies in parallel:
 * 1. GET /api/get?artist_name=...&track_name=... (exact match)
 * 2. GET /api/search?q=artist+title (fuzzy search)
 * 3. Same as #2 but with cleaned artist/title
 *
 * Falls back to /api/music/lyrics (server-side) if lrclib.net is unreachable
 * from the client (e.g. user's ISP blocks it).
 */

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  lyrics: LyricLine[];
  plainText: string;
  synced: boolean;
  source: "lrclib" | "server" | "none";
}

const LRCLIB_BASE = "https://lrclib.net/api";
import { getCached, setCached } from "@/lib/lyricsCache";

function cleanArtist(s: string): string {
  // Take only the first artist (before comma, " & ", " feat ", " ft ")
  let result = s
    .split(/[,，]|\s+[&＆]\s+|\s+(?:feat|ft|featuring)\.?\s+/i)[0]
    .trim();
  // Also apply general clean rules
  return clean(result);
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

function parseLRC(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    let msStr = match[3];
    if (msStr.length === 2) msStr += "0";
    const ms = parseInt(msStr, 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    lines.push({ time, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

interface LrcLibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

async function fetchLrclib(url: string): Promise<LrcLibResult | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.length > 0 ? parsed[0] : null;
      if (parsed && typeof parsed === "object") return parsed as LrcLibResult;
      return null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function fetchServerFallback(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    const res = await fetch(
      `/api/music/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.plainText || (data.lyrics && data.lyrics.length > 0)) {
      return { ...data, source: "server" as const };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Fallback 2: lyrics.ovh (free, CORS-enabled, plain text only) ─────────
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

export async function fetchLyrics(artist: string, title: string): Promise<LyricsResult> {
  const artistClean = cleanArtist(artist);
  const titleClean = clean(title);

  // Check cache first — instant return on cache hit (0ms vs 200-500ms)
  const key = `${artistClean.toLowerCase()}|${titleClean.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;

  // Strategy 1+2: Parallel — exact match + title-only search
  const [r1, r2] = await Promise.all([
    fetchLrclib(`${LRCLIB_BASE}/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`),
    fetchLrclib(`${LRCLIB_BASE}/search?q=${encodeURIComponent(titleClean)}`),
  ]);

  let candidates = [r1, r2].filter(Boolean) as LrcLibResult[];
  let best = candidates.find((r) => r.syncedLyrics) || candidates.find((r) => r.plainLyrics);

  // Strategy 3: If no result, try cleaned artist + cleaned title search
  if (!best) {
    const r3 = await fetchLrclib(`${LRCLIB_BASE}/search?q=${encodeURIComponent(`${artistClean} ${titleClean}`)}`);
    if (r3) {
      best = r3;
    }
  }

  // Strategy 4: If still no result, try title-only with just first word
  if (!best && titleClean.includes(" ")) {
    const shortTitle = titleClean.split(" ").slice(0, 3).join(" ");
    const r4 = await fetchLrclib(`${LRCLIB_BASE}/search?q=${encodeURIComponent(shortTitle)}`);
    if (r4) {
      best = r4;
    }
  }

  if (best) {
    const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
    const plainText = best.plainLyrics?.trim() || "";
    if (lyrics.length > 0 || plainText) {
      const result: LyricsResult = { lyrics, plainText, synced: lyrics.length > 0, source: "lrclib" };
      setCached(key, result);
      return result;
    }
  }

  // Fallback 1: lyrics.ovh
  const ovhLyrics = await fetchLyricsOvh(artistClean, titleClean);
  if (ovhLyrics) {
    const result: LyricsResult = { lyrics: [], plainText: ovhLyrics, synced: false, source: "lrclib" };
    setCached(key, result);
    return result;
  }

  // Fallback 2: server endpoint
  const serverResult = await fetchServerFallback(artist, title);
  if (serverResult) {
    setCached(key, serverResult);
    return serverResult;
  }

  const noResult: LyricsResult = { lyrics: [], plainText: "", synced: false, source: "none" };
  setCached(key, noResult);
  return noResult;
}
