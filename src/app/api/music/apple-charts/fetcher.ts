import { searchSCTracks } from "@/lib/soundcloud";
import type { Track } from "@/lib/musicApi";

/**
 * Apple Music Top chart fetcher — separated from route.ts.
 *
 * Uses Apple's public RSS feed:
 *   https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/50/songs.json
 *
 * Each chart entry is then searched on SoundCloud to get a playable audio URL
 * (Apple Music itself only provides 30s previews).
 */

const cache = new Map<string, { data: Track[]; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// ── Negative cache ──
// When Apple RSS is unreachable/timeout (e.g. cold start, upstream outage)
// the route used to re-probe on EVERY request — each burning the full 10s
// timeout. Cache the failure for 5 min so a dead upstream degrades fast
// instead of hanging the home page's trending request.
const failedCache = new Map<string, number>();
const FAILED_TTL = 5 * 60 * 1000; // 5 min

interface ChartEntry {
  title: string;
  artist: string;
  cover?: string;
}

async function fetchAppleChart(country: string): Promise<ChartEntry[]> {
  const rssUrl = `https://rss.applemarketingtools.com/api/v2/${country.toLowerCase()}/music/most-played/50/songs.json`;
  const rssRes = await fetch(rssUrl, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "MQPlayer/1.0" },
  });
  if (!rssRes.ok) {
    throw new Error(`Apple RSS failed: ${rssRes.status}`);
  }
  const rssData = await rssRes.json();
  const songs: any[] = rssData?.feed?.results || [];
  const out: ChartEntry[] = [];
  for (const s of songs) {
    const artist = s.artistName || "";
    const title = s.name || "";
    if (!title || !artist) continue;
    const cover = s.artworkUrl100 ? s.artworkUrl100.replace("100x100", "400x400") : undefined;
    out.push({ title, artist, cover });
  }
  return out;
}

// ─── SoundCloud search → playable Track ──────────────────────────────────
//
// Searches SoundCloud for up to 8 candidates per chart entry and picks
// the FIRST one whose stream policy is "ALLOW" (truly full playable).
// This is critical because most chart hits on SoundCloud are marked
// "MONETIZE" or "SNIP" (preview-only). Without this filter the player
// would show top tracks but be unable to play most of them.
//
// Falls back to the first result if no ALLOW candidate is found.

async function findPlayableTrack(entry: ChartEntry): Promise<Track | null> {
  try {
    const query = `${entry.artist} ${entry.title}`.trim();
    // Search up to 15 candidates — chart hits often have many SNIP/MONETIZE
    // duplicates on SoundCloud before finding a fully-playable ALLOW track.
    const results = await searchSCTracks(query, 15);
    if (!results || results.length === 0) return null;

    // Prefer ALLOW-policy tracks (fully playable)
    let t = results.find((r) => r.scIsFull) || results[0];

    return {
      id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `apple_${Date.now()}_${Math.random()}`),
      title: t.title || entry.title,
      artist: t.artist || entry.artist,
      album: t.album || "",
      cover: t.cover || entry.cover || "",
      duration: t.duration || 0,
      genre: t.genre || "",
      audioUrl: t.audioUrl || "",
      previewUrl: t.previewUrl || "",
      source: "soundcloud",
      scTrackId: t.scTrackId || undefined,
      scStreamPolicy: t.scStreamPolicy || "",
      scIsFull: t.scIsFull || false,
    };
  } catch {
    return null;
  }
}

export async function fetchAppleTop(country: string): Promise<Track[]> {
  const cacheKey = `apple-top:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  // Fast-path a recently failed probe (see negative cache note above).
  const failedAt = failedCache.get(cacheKey);
  if (failedAt && Date.now() - failedAt < FAILED_TTL) {
    return [];
  }

  let chart: ChartEntry[];
  try {
    chart = await fetchAppleChart(country);
  } catch (err) {
    failedCache.set(cacheKey, Date.now());
    // Surface the upstream error to logs but keep the route non-throwing —
    // the UI treats "no tracks" as "section hidden", which is the graceful
    // degradation we want (charts are optional content, not a blocker).
    console.warn(`[apple-charts] RSS fetch failed for ${country}:`,
      err instanceof Error ? err.message : err);
    return [];
  }
  if (chart.length === 0) return [];

  // Search each chart entry on SoundCloud in batches of 5
  const tracks: Track[] = [];
  const batchSize = 5;
  const maxToProcess = Math.min(chart.length, 50);

  for (let i = 0; i < maxToProcess; i += batchSize) {
    const batch = chart.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(findPlayableTrack));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        tracks.push(r.value);
      }
    }
    if (tracks.length >= 50) break;
  }

  cache.set(cacheKey, { data: tracks, expiry: Date.now() + CACHE_TTL });
  return tracks;
}
