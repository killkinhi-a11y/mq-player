import { searchSCTracks } from "@/lib/soundcloud";
import type { Track } from "@/lib/musicApi";

/**
 * Spotify Top / Deezer chart fetcher — separated from route.ts.
 *
 * Returns up to 50 tracks. Each chart entry is searched on SoundCloud
 * to get a playable audio URL (Spotify/Deezer only provide 30s previews
 * or DRM-protected streams).
 */

const cache = new Map<string, { data: Track[]; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// ─── Spotify helpers ─────────────────────────────────────────────────────

async function getSpotifyToken(): Promise<string | null> {
  const cid = process.env.SPOTIFY_CLIENT_ID;
  const csec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!cid || !csec) return null;
  try {
    const basic = Buffer.from(`${cid}:${csec}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function fetchSpotifyChart(token: string): Promise<ChartEntry[]> {
  // "Today's Top Hits" — Spotify's flagship global chart playlist
  const playlistId = "37i9dQZEVXbMDoHDwVN2tF";
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=tracks(items(track(name,artists,duration_ms,album(images))))`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const items: any[] = data?.tracks?.items || [];
  const out: ChartEntry[] = [];
  for (const it of items) {
    const t = it?.track;
    if (!t) continue;
    const artist = (t.artists || []).map((a: any) => a.name).join(", ");
    const cover = (t.album?.images || [])[0]?.url;
    if (!t.name || !artist) continue;
    out.push({
      title: String(t.name),
      artist,
      cover: cover || undefined,
      duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
    });
  }
  return out;
}

// ─── Deezer helpers ──────────────────────────────────────────────────────

interface ChartEntry {
  title: string;
  artist: string;
  cover?: string;
  duration?: number;
  preview?: string;
}

async function fetchDeezerChart(): Promise<ChartEntry[]> {
  const res = await fetch("https://api.deezer.com/chart?limit=50", {
    headers: { "User-Agent": "MQPlayer/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const tracks: any[] = data?.tracks?.data || [];
  const out: ChartEntry[] = [];
  for (const t of tracks) {
    if (!t.title || !t.artist?.name) continue;
    out.push({
      title: String(t.title),
      artist: String(t.artist.name),
      cover: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || undefined,
      duration: typeof t.duration === "number" ? t.duration : undefined,
      preview: t.preview || undefined,
    });
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
// Falls back to the first result if no ALLOW candidate is found (so the
// user at least sees the track and can try Audius fallback in the player).

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
      id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `top_${Date.now()}_${Math.random()}`),
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

// ─── Main entry ──────────────────────────────────────────────────────────

export async function fetchSpotifyTop(country: string): Promise<Track[]> {
  const cacheKey = `spotify-top:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  // 1) Try Spotify
  let chart: ChartEntry[] = [];
  const spotifyToken = await getSpotifyToken();
  if (spotifyToken) {
    chart = await fetchSpotifyChart(spotifyToken);
  }

  // 2) Fallback to Deezer
  if (chart.length === 0) {
    chart = await fetchDeezerChart();
  }

  if (chart.length === 0) return [];

  // 3) Search each chart entry on SoundCloud in batches of 5
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
