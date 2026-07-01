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

async function findPlayableTrack(entry: ChartEntry): Promise<Track | null> {
  try {
    const query = `${entry.artist} ${entry.title}`.trim();
    const results = await searchSCTracks(query, 1);
    if (!results || results.length === 0) return null;
    const t = results[0];
    return {
      id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `apple_${Date.now()}_${Math.random()}`),
      title: t.title || "",
      artist: t.artist || "",
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

  const chart = await fetchAppleChart(country);
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
