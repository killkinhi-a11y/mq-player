import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Track } from "@/lib/musicApi";

// Force dynamic — this route must always be a serverless function, never
// statically rendered. Without this, Vercel may not register the route
// when the build does not see it referenced from any page's data fetches.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/music/spotify-top?country=RU
 *
 * Returns Top 50 tracks from a global / regional chart service.
 *
 * Source priority:
 *   1. Spotify Web API (if SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET are set)
 *      — uses Client Credentials flow, hits /v1/playlists/37i9dQZEVXbMDoHDwVN2tF
 *      (Today's Top Hits, refreshed daily by Spotify)
 *   2. Deezer Chart API (no key needed) — https://api.deezer.com/chart?limit=50
 *      — returns global top tracks
 *
 * In both cases, each chart entry is then searched on SoundCloud to get
 * a playable audio URL (since neither Spotify nor Deezer provide direct
 * audio streams without DRM / 30s preview restrictions).
 */

const cache = new Map<string, { data: Track[]; source: string; expiry: number }>();
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

async function fetchSpotifyTop(token: string): Promise<{ title: string; artist: string; cover?: string; duration?: number }[]> {
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
  return items
    .map((it): { title: string; artist: string; cover?: string; duration?: number } | null => {
      const t = it?.track;
      if (!t) return null;
      const artist = (t.artists || []).map((a: any) => a.name).join(", ");
      const cover = (t.album?.images || [])[0]?.url;
      return {
        title: t.name || "",
        artist: artist || "",
        cover: cover || undefined,
        duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
      };
    })
    .filter((x): x is { title: string; artist: string; cover?: string; duration?: number } => !!x && !!x.title && !!x.artist);
}

// ─── Deezer helpers ──────────────────────────────────────────────────────

interface DeezerTrack {
  title: string;
  artist: { name: string };
  album: { cover_big?: string; cover_medium?: string; cover_xl?: string };
  duration: number;
  preview: string;
}

async function fetchDeezerTop(): Promise<{ title: string; artist: string; cover?: string; duration?: number; preview?: string }[]> {
  const res = await fetch("https://api.deezer.com/chart?limit=50", {
    headers: { "User-Agent": "MQPlayer/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const tracks: DeezerTrack[] = data?.tracks?.data || [];
  return tracks.map((t) => ({
    title: t.title || "",
    artist: t.artist?.name || "",
    cover: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || undefined,
    duration: t.duration || undefined,
    preview: t.preview || undefined,
  })).filter((t) => t.title && t.artist);
}

// ─── SoundCloud search → playable Track ──────────────────────────────────

async function findPlayableTrack(query: string): Promise<Track | null> {
  try {
    const results = await searchSCTracks(query, 1);
    if (!results || results.length === 0) return null;
    const t = results[0];
    return {
      id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `top_${Date.now()}_${Math.random()}`),
      title: t.title || "",
      artist: t.artist || "",
      album: t.album || "",
      cover: t.cover || "",
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

// ─── Handler ─────────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "RU").toUpperCase();

  const cacheKey = `spotify-top:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ tracks: cached.data, source: cached.source, country });
  }

  try {
    // 1) Try Spotify
    let chart: { title: string; artist: string; cover?: string; duration?: number; preview?: string }[] = [];
    let source = "";

    const spotifyToken = await getSpotifyToken();
    if (spotifyToken) {
      chart = await fetchSpotifyTop(spotifyToken);
      source = "spotify";
    }

    // 2) Fallback to Deezer
    if (chart.length === 0) {
      chart = await fetchDeezerTop();
      source = "deezer";
    }

    if (chart.length === 0) {
      return NextResponse.json({ tracks: [], source: "none", country });
    }

    // 3) Search each chart entry on SoundCloud in batches of 5
    const tracks: Track[] = [];
    const batchSize = 5;
    const maxToProcess = Math.min(chart.length, 50);

    for (let i = 0; i < maxToProcess; i += batchSize) {
      const batch = chart.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const query = `${entry.artist} ${entry.title}`.trim();
          const track = await findPlayableTrack(query);
          if (!track) return null;
          // Prefer chart cover if SC search didn't return one
          if (!track.cover && entry.cover) track.cover = entry.cover;
          return track;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          tracks.push(r.value);
        }
      }

      if (tracks.length >= 50) break;
    }

    cache.set(cacheKey, { data: tracks, source, expiry: Date.now() + CACHE_TTL });

    return NextResponse.json({ tracks, source, country });
  } catch {
    return NextResponse.json({ tracks: [], source: "error", country });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
