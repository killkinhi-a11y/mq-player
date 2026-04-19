import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Lyrics API — fetches synced/plain lyrics from lrclib.net.
 *
 * GET /api/music/lyrics?artist=ARTIST&title=TITLE
 *
 * Returns: { lyrics: { time: number, text: string }[], plainText: string }
 */

// ── In-memory cache (10 min TTL) ─────────────────────────────────────────────
const cache = new Map<string, { data: { lyrics: { time: number; text: string }[]; plainText: string }; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getFromCache(key: string) {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: { lyrics: { time: number; text: string }[]; plainText: string }) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ── LRC format parser ────────────────────────────────────────────────────────
// Parses lines like: [00:12.34] First line of lyrics
// Regex handles both [mm:ss.xx] and [mm:ss.xxx] formats
function parseLRC(lrcText: string): { time: number; text: string }[] {
  const lines: { time: number; text: string }[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    let msStr = match[3];
    // Normalize to 3-digit ms: "34" → "340", "345" → "345"
    if (msStr.length === 2) msStr += "0";
    const ms = parseInt(msStr, 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    lines.push({ time, text });
  }

  // Sort by time in case the LRC file is out of order
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

// ── lrclib.net response shape (partial) ──────────────────────────────────────
interface LrcLibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  trackName?: string;
  artistName?: string;
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Missing artist or title parameter" },
      { status: 400 }
    );
  }

  const cacheKey = `lyrics:${artist.trim().toLowerCase()}:${title.trim().toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Search lrclib.net
    const query = `${encodeURIComponent(artist.trim())} ${encodeURIComponent(title.trim())}`;
    const res = await fetch(`https://lrclib.net/api/search?q=${query}`, {
      headers: {
        "User-Agent": "MQPlayer/1.0 (lyrics fetcher)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ lyrics: [], plainText: "" });
    }

    const results: LrcLibResult[] = await res.json();

    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ lyrics: [], plainText: "" });
    }

    // Best match is the first result
    const best = results[0];

    // Parse synced lyrics if available
    const lyrics = best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
    const plainText = best.plainLyrics?.trim() || "";

    const responseData = { lyrics, plainText };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    // lrclib.net unreachable or parsing error
    return NextResponse.json({ lyrics: [], plainText: "" });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
