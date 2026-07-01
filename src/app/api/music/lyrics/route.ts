import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Lyrics API — fetches synced/plain lyrics from lrclib.net.
 * Optimized: parallel first 2 strategies, 4s timeout per request, max 3 strategies.
 */

const cache = new Map<string, { data: { lyrics: { time: number; text: string }[]; plainText: string; synced: boolean }; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getFromCache(key: string) {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: { lyrics: { time: number; text: string }[]; plainText: string; synced: boolean }) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

function parseLRC(lrcText: string): { time: number; text: string }[] {
  const lines: { time: number; text: string }[] = [];
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

function clean(s: string): string {
  return s
    // Only strip keywords inside parentheses/brackets — not standalone words
    .replace(/\s*[\(\[]\s*(official\s+(music\s+)?video|official\s+audio|official\s+lyrics?|lyrics?|audio|music\s+video|visualizer|hd|hq|4k|explicit|clean)\s*[\)\]]/gi, "")
    .replace(/\s*[\(\[]\s*(feat|ft|featuring)\.?\s+[^)\]]+[\)\]]/gi, "")
    .replace(/\s*-\s*topic\s*$/i, "")
    .replace(/^official\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface LrcLibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  trackName?: string;
  artistName?: string;
  duration?: number | null;
}

async function fetchLrclib(url: string): Promise<LrcLibResult | null> {
  try {
    const res = await fetch(url, {
      // NOTE: lrclib.net blocks User-Agents with parentheses (WAF rule).
      // "mq/1.0 (lyrics fetcher)" → timeout; "MQPlayer/1.0" → works.
      headers: { "User-Agent": "MQPlayer/1.0" },
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
    } catch { return null; }
  } catch { return null; }
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artistRaw = searchParams.get("artist") || "";
  const titleRaw = searchParams.get("title") || "";

  if (!artistRaw || !titleRaw) {
    return NextResponse.json({ error: "Missing artist or title parameter" }, { status: 400 });
  }

  const artistClean = clean(artistRaw);
  const titleClean = clean(titleRaw);

  const cacheKey = `lyrics:${artistClean.toLowerCase()}:${titleClean.toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Run ALL 3 strategies in PARALLEL for speed (was sequential, up to 8s)
  const [r1, r2, r3] = await Promise.all([
    fetchLrclib(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`),
    fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistRaw} ${titleRaw}`)}`),
    fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistClean} ${titleClean}`)}`),
  ]);

  // Check for actual lyrics content, not just object existence
  const hasLyrics = (r: LrcLibResult | null): r is LrcLibResult =>
    !!r && (!!r.syncedLyrics || !!r.plainLyrics);

  // Prefer synced lyrics, then plain, from any of the 3 results
  const candidates = [r1, r2, r3].filter(Boolean) as LrcLibResult[];
  const best =
    candidates.find(r => r.syncedLyrics)   // synced wins
    || candidates.find(r => r.plainLyrics) // then plain
    || candidates.find(hasLyrics);         // then any with content

  if (!best || !hasLyrics(best)) {
    const empty = { lyrics: [], plainText: "", synced: false };
    // Short TTL for negative cache — lyrics may appear later
    cache.set(cacheKey, { data: empty, expiry: Date.now() + 60000 });
    return NextResponse.json(empty);
  }

  const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
  const plainText = best.plainLyrics?.trim() || "";
  const responseData = { lyrics, plainText, synced: lyrics.length > 0 };
  setCache(cacheKey, responseData);
  return NextResponse.json(responseData);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
