import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Lyrics API — fetches synced/plain lyrics from lrclib.net.
 *
 * GET /api/music/lyrics?artist=ARTIST&title=TITLE
 *
 * Returns: { lyrics: { time: number, text: string }[], plainText: string, synced: boolean }
 */

// ── In-memory cache (10 min TTL) ─────────────────────────────────────────────
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

// ── LRC format parser ────────────────────────────────────────────────────────
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

// ── Clean title / artist for better matching ────────────────────────────────
function clean(s: string): string {
  return s
    // Remove (Official Video/Audio/Lyrics/etc.)
    .replace(/\(?\s*(official\s+(music\s+)?video|official\s+audio|official\s+lyrics?|official|lyrics?|audio|music\s+video|visualizer|hd|hq|4k|explicit|clean)\s*\)?/gi, "")
    // Remove [Official...] / [...]
    .replace(/\[(official|lyrics?|audio|video|visualizer|hd|hq)\]/gi, "")
    // Remove feat./ft.
    .replace(/\s*[\(\[]?\s*(feat|ft|featuring)\.?\s+[^)\]]+[\)\]]?/gi, "")
    // Remove " - Topic" suffix (YouTube auto-generated artists)
    .replace(/\s*-\s*topic\s*$/i, "")
    // Remove "Official" prefix
    .replace(/^official\s+/i, "")
    // Collapse whitespace
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
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    // Could be a single object or array (for /api/search)
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed[0] : null;
      }
      // Single object from /api/get might have syncedLyrics=null
      if (parsed && typeof parsed === "object") return parsed as LrcLibResult;
      return null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artistRaw = searchParams.get("artist") || "";
  const titleRaw = searchParams.get("title") || "";

  if (!artistRaw || !titleRaw) {
    return NextResponse.json(
      { error: "Missing artist or title parameter" },
      { status: 400 }
    );
  }

  // Try multiple strategies in order:
  // 1. Exact: /api/get with cleaned artist + title
  // 2. Exact with raw: /api/get with raw artist + title
  // 3. Search: /api/search?q=artist+title (raw)
  // 4. Search: /api/search?q=artist+title (cleaned)
  // 5. Search: /api/search?q=title only

  const artistClean = clean(artistRaw);
  const titleClean = clean(titleRaw);

  const cacheKey = `lyrics:${artistClean.toLowerCase()}:${titleClean.toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  const tried = new Set<string>();
  const strategies: (() => Promise<LrcLibResult | null>)[] = [
    // 1. Exact cleaned
    async () => {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`;
      return fetchLrclib(url);
    },
    // 2. Exact raw
    async () => {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistRaw)}&track_name=${encodeURIComponent(titleRaw)}`;
      return fetchLrclib(url);
    },
    // 3. Search raw
    async () => {
      const q = `${artistRaw} ${titleRaw}`;
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      return fetchLrclib(url);
    },
    // 4. Search cleaned
    async () => {
      const q = `${artistClean} ${titleClean}`;
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      return fetchLrclib(url);
    },
    // 5. Search by artist_name + track_name (specific search)
    async () => {
      const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`;
      return fetchLrclib(url);
    },
    // 6. Search title only (last resort)
    async () => {
      const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(titleClean)}`;
      return fetchLrclib(url);
    },
  ];

  let best: LrcLibResult | null = null;
  for (const strategy of strategies) {
    const key = strategy.toString();
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      const result = await strategy();
      if (result && (result.syncedLyrics || result.plainLyrics)) {
        best = result;
        break;
      }
    } catch {
      // try next strategy
    }
  }

  if (!best) {
    const empty = { lyrics: [], plainText: "", synced: false };
    setCache(cacheKey, empty);
    return NextResponse.json(empty);
  }

  const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
  const plainText = best.plainLyrics?.trim() || "";
  const synced = lyrics.length > 0;

  const responseData = { lyrics, plainText, synced };
  setCache(cacheKey, responseData);
  return NextResponse.json(responseData);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
