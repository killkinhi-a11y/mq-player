import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Track } from "@/lib/musicApi";
import { searchSCTracks } from "@/lib/soundcloud";

/**
 * GET /api/music/auto-playlists
 *
 * Generates Spotify-like auto-playlists based on user's taste profile:
 *   - 6 "Daily Mix" playlists (each ~25 tracks, focused on one top artist/genre)
 *   - 1 "Discover Weekly" playlist (~30 tracks, deeper exploration)
 *
 * Sources:
 *   - User's top liked artists (from likedTracksData query param)
 *   - User's top genres (from genres query param)
 *   - SoundCloud search for each artist/genre combination
 *
 * Returns: { playlists: Array<{ id, name, description, cover, tracks: Track[] }> }
 */

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — auto-playlists don't need to be fresh
const cache = new Map<string, { data: any; expiry: number }>();

async function findPlayableTrack(query: string): Promise<Track | null> {
  try {
    const results = await searchSCTracks(query, 10);
    if (!results || results.length === 0) return null;
    const t = results.find((r) => r.scIsFull) || results[0];
    return {
      id: t.id || `sc_${t.scTrackId}`,
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

async function buildDailyMix(name: string, seedArtist: string, genres: string[], cover: string): Promise<{ id: string; name: string; description: string; cover: string; tracks: Track[] }> {
  const tracks: Track[] = [];
  const seen = new Set<string>();

  // Mix of artist-specific and genre-based queries
  const queries = [
    seedArtist,
    `${seedArtist} ${genres[0] || ""}`.trim(),
    genres[0] ? `${genres[0]} music` : "",
    seedArtist,
    genres[1] ? `${genres[1]} mix` : "",
  ].filter(Boolean);

  for (const q of queries) {
    if (tracks.length >= 25) break;
    const t = await findPlayableTrack(q);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      tracks.push(t);
    }
  }

  return {
    id: `daily_mix_${name.toLowerCase().replace(/\s+/g, "_")}`,
    name,
    description: `Микс на основе ${seedArtist}`,
    cover,
    tracks,
  };
}

async function buildDiscoverWeekly(genres: string[], artists: string[]): Promise<{ id: string; name: string; description: string; cover: string; tracks: Track[] }> {
  const tracks: Track[] = [];
  const seen = new Set<string>();

  // Explore unexplored genres + deep cuts from known artists
  const exploreQueries = [
    ...genres.map((g) => `${g} deep cuts`),
    ...artists.map((a) => `${a} rare`),
    ...genres.slice(0, 2).map((g) => `${g} underground`),
    ...genres.slice(2, 4).map((g) => `${g} 2024`),
  ].filter(Boolean);

  for (const q of exploreQueries) {
    if (tracks.length >= 30) break;
    const t = await findPlayableTrack(q);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      tracks.push(t);
    }
  }

  return {
    id: "discover_weekly",
    name: "Discover Weekly",
    description: "Новые треки каждый понедельник",
    cover: "",
    tracks,
  };
}

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artists = (searchParams.get("artists") || "").split(",").filter(Boolean).slice(0, 6);
  const genres = (searchParams.get("genres") || "").split(",").filter(Boolean).slice(0, 6);

  const cacheKey = `auto:${artists.join(",")}|${genres.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const playlists: any[] = [];

    // Build up to 6 Daily Mixes — one per top artist
    const dailyMixPromises = artists.slice(0, 6).map((artist, i) =>
      buildDailyMix(`Daily Mix ${i + 1}`, artist, genres, "")
    );
    const dailyMixes = await Promise.all(dailyMixPromises);
    playlists.push(...dailyMixes.filter((p) => p.tracks.length >= 5));

    // Build Discover Weekly
    if (genres.length > 0 || artists.length > 0) {
      const dw = await buildDiscoverWeekly(genres, artists);
      if (dw.tracks.length >= 5) playlists.push(dw);
    }

    const responseData = { playlists, generatedAt: new Date().toISOString() };
    cache.set(cacheKey, { data: responseData, expiry: Date.now() + CACHE_TTL });

    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ playlists: [], error: "failed" });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
