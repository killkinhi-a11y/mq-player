import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { parseLrc, hasContent, type LrcLibRecord } from "@/lib/lyrics/lrclib";
import { withEndMs } from "@/lib/lyrics/types";

/**
 * Lyrics API — server-side relay for lrclib.net (+ lyrics.ovh fallback).
 *
 * Supports the full MQ lyrics query: artist + title + album (optional) +
 * duration (optional) — all passed to LRCLIB's exact `/api/get` to sharpen
 * matching. Response carries BOTH the normalized shape (`source`, `lines`
 * with ms timings) and the legacy shape (`lyrics` in seconds) for older
 * clients.
 *
 * NOTE: the web client calls lrclib.net DIRECTLY first (CORS-enabled) —
 * this relay is the last-hop fallback when the client cannot reach LRCLIB
 * (its WAF blocks some Vercel IPs / user ISPs).
 */

const cache = new Map<
  string,
  { data: Record<string, unknown>; expiry: number }
>();
const CACHE_TTL = 10 * 60 * 1000;

function getFromCache(key: string) {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: Record<string, unknown>) {
  if (cache.size >= 200) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
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

async function fetchLrclib(url: string): Promise<{ record: LrcLibRecord | null; status: "ok" | "not_found" | "unavailable" }> {
  try {
    const res = await fetch(url, {
      // NOTE: lrclib.net blocks User-Agents with parentheses (WAF rule).
      // "mq/1.0 (lyrics fetcher)" → timeout; "MQPlayer/1.0" → works.
      headers: { "User-Agent": "MQPlayer/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { record: null, status: res.status === 404 || res.status === 429 ? "not_found" : "not_found" };
    const text = await res.text();
    if (!text) return { record: null, status: "not_found" };
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return { record: parsed.length > 0 ? (parsed[0] as LrcLibRecord) : null, status: "ok" };
      if (parsed && typeof parsed === "object") return { record: parsed as LrcLibRecord, status: "ok" };
      return { record: null, status: "not_found" };
    } catch { return { record: null, status: "not_found" }; }
  } catch { return { record: null, status: "unavailable" }; }
}

// ─── Fallback: lyrics.ovh (free, no API key, plain text only) ─────────────
// Used when lrclib.net is unreachable (blocks Vercel IPs or times out).
// Returns plain text lyrics, no sync timestamps.

async function fetchLyricsOvh(artist: string, title: string): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "MQPlayer/1.0" },
    });
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

/** Normalize an LRCLIB record into the dual-shape response body. */
function buildBody(rec: LrcLibRecord, durationSec: number): Record<string, unknown> {
  const parsed = rec.syncedLyrics?.trim() ? parseLrc(rec.syncedLyrics) : [];
  const syncedLines = withEndMs(
    parsed.filter((l) => l.startMs !== undefined),
    durationSec > 0 ? durationSec : (rec.duration ?? 0) || undefined,
  );
  const plainText = rec.plainLyrics?.trim() || "";
  return {
    // Normalized shape (MQ internal format, ms timings)
    source: "lrclib",
    synced: syncedLines.length > 0,
    lines: syncedLines,
    // Legacy shape (seconds) — older clients / mocks
    lyrics: syncedLines.map((l) => ({ time: (l.startMs ?? 0) / 1000, text: l.text })),
    plainText,
  };
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artistRaw = searchParams.get("artist") || "";
  const titleRaw = searchParams.get("title") || "";
  const albumRaw = searchParams.get("album") || "";
  const durationSec = Math.round(parseFloat(searchParams.get("duration") || "0")) || 0;

  if (!artistRaw || !titleRaw) {
    return NextResponse.json({ error: "Missing artist or title parameter" }, { status: 400 });
  }

  const artistClean = clean(artistRaw);
  const titleClean = clean(titleRaw);
  const albumClean = clean(albumRaw);

  const cacheKey = [
    "lyrics",
    artistClean.toLowerCase(),
    titleClean.toLowerCase(),
    albumClean.toLowerCase(),
    durationSec,
  ].join(":");
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Exact match sharpened by album + duration (spec §1), plus the loose
  // variant and two fuzzy searches — all in parallel.
  const getParams = new URLSearchParams({
    artist_name: artistClean,
    track_name: titleClean,
  });
  if (albumClean) getParams.set("album_name", albumClean);
  if (durationSec > 0) getParams.set("duration", String(durationSec));

  const tasks: Promise<{ record: LrcLibRecord | null; status: string }>[] = [
    albumClean || durationSec > 0
      ? fetchLrclib(`https://lrclib.net/api/get?${getParams.toString()}`)
      : Promise.resolve({ record: null, status: "skipped" }),
    fetchLrclib(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(titleClean)}`,
    ),
    fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistRaw} ${titleRaw}`)}`),
    fetchLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistClean} ${titleClean}`)}`),
  ];
  const results = await Promise.all(tasks);

  const candidates = results.map((r) => r.record).filter(hasContent) as LrcLibRecord[];
  // Prefer synced lyrics, then plain, from any of the results.
  const best =
    candidates.find((r) => r.syncedLyrics?.trim()) ||
    candidates.find((r) => r.plainLyrics) ||
    candidates[0] ||
    null;

  if (best && hasContent(best)) {
    const body = buildBody(best, durationSec);
    setCache(cacheKey, body);
    return NextResponse.json(body);
  }

  // ── Fallback: try lyrics.ovh if lrclib returned nothing ──
  // lrclib.net may block Vercel IPs or not have this track.
  const ovhLyrics = await fetchLyricsOvh(artistClean, titleClean);
  if (ovhLyrics) {
    const body = {
      source: "lyrics-ovh",
      synced: false,
      lines: [],
      lyrics: [],
      plainText: ovhLyrics,
    };
    setCache(cacheKey, body);
    return NextResponse.json(body);
  }

  const empty = {
    source: "none",
    synced: false,
    lines: [],
    lyrics: [],
    plainText: "",
    // Normalized error for API consumers; 200 keeps legacy clients happy.
    error: results.every((r) => r.status === "unavailable")
      ? "provider_unavailable"
      : "not_found",
  };
  // Short TTL for negative cache — lyrics may appear later
  cache.set(cacheKey, { data: empty, expiry: Date.now() + 60000 });
  return NextResponse.json(empty);
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
