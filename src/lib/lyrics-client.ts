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
    // Remove remix/mix/edit info in parentheses
    .replace(/\s*[\(\[]\s*(remix|mix|edit|remaster\w*|deluxe|bonus|extended|radio\s+edit|club\s+mix|dirty|clean\s+version)\w*\s*[\)\]]/gi, "")
    // Remove " - Remix" / " - Radio Edit" suffixes
    .replace(/\s*-\s*(remix|mix|edit|remaster\w*|radio\s+edit|club\s+mix|instrumental|acoustic|live|cover|bootleg)\b.*$/i, "")
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

  // Strategy 1-3: Try lrclib.net directly (CORS-enabled, client-side)
  const [r1, r2, r3] = await Promise.all([
    fetchLrclib(`${LRCLIB_BASE}/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`),
    fetchLrclib(`${LRCLIB_BASE}/search?q=${encodeURIComponent(`${artistClean} ${titleClean}`)}`),
    fetchLrclib(`${LRCLIB_BASE}/search?q=${encodeURIComponent(`${titleClean}`)}`),
  ]);

  const candidates = [r1, r2, r3].filter(Boolean) as LrcLibResult[];
  const best =
    candidates.find((r) => r.syncedLyrics) ||
    candidates.find((r) => r.plainLyrics);

  if (best) {
    const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
    const plainText = best.plainLyrics?.trim() || "";
    if (lyrics.length > 0 || plainText) {
      return { lyrics, plainText, synced: lyrics.length > 0, source: "lrclib" };
    }
  }

  // Fallback 1: try lyrics.ovh (client-side, CORS-enabled, plain text only)
  const ovhLyrics = await fetchLyricsOvh(artistClean, titleClean);
  if (ovhLyrics) {
    return { lyrics: [], plainText: ovhLyrics, synced: false, source: "lrclib" };
  }

  // Fallback 2: try server-side endpoint (may work if lrclib blocks client IP)
  const serverResult = await fetchServerFallback(artist, title);
  if (serverResult) return serverResult;

  return { lyrics: [], plainText: "", synced: false, source: "none" };
}
