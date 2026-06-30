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
    .replace(/\(?\s*(official\s+(music\s+)?video|official\s+audio|official\s+lyrics?|official|lyrics?|audio|music\s+video|visualizer|hd|hq|4k|explicit|clean)\s*\)?/gi, "")
    .replace(/\[(official|lyrics?|audio|video|visualizer|hd|hq)\]/gi, "")
    .replace(/\s*[\(\[]?\s*(feat|ft|featuring)\.?\s+[^)\]]+[\)\]]?/gi, "")
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
      headers: { "User-Agent": "mq/1.0 (lyrics fetcher)" },
      signal: AbortSignal.timeout(4000),
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

  // Run first 2 strategies in PARALLEL for speed
  const [r1, r2] = await Promise.all([
    fetchLrclib(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`),
    fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistRaw} ${titleRaw}`)}`),
  ]);

  const best = r1 || r2;

  // If first 2 failed, try one more search with cleaned query
  if (!best) {
    const r3 = await fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistClean} ${titleClean}`)}`);
    if (!r3) {
      const empty = { lyrics: [], plainText: "", synced: false };
      setCache(cacheKey, empty);
      return NextResponse.json(empty);
    }
    const lyrics = r3.syncedLyrics ? parseLRC(r3.syncedLyrics) : [];
    const plainText = r3.plainLyrics?.trim() || "";
    const responseData = { lyrics, plainText, synced: lyrics.length > 0 };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  }

  const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
  const plainText = best.plainLyrics?.trim() || "";
  const responseData = { lyrics, plainText, synced: lyrics.length > 0 };
  setCache(cacheKey, responseData);
  return NextResponse.json(responseData);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
