/**
 * Deezer Catalog Provider — server-side, no authentication required.
 *
 * ROLE: metadata/catalog fallback when the Spotify app lacks Web API access
 * (development mode → 403 on all endpoints). Deezer's public API offers the
 * full catalog surface: search, artists, top tracks, albums, album tracks,
 * related artists — plus ISRC on track objects (a strong resolver signal).
 *
 * SECURITY: no credentials at all — the Deezer public API needs none.
 *
 * GRACEFUL DEGRADATION: every export returns null / empty on failure; the
 * catalog routes fall back honestly and the UI keeps working with the
 * SoundCloud/Audius catalog.
 */

import type {
  CatalogAlbumDTO,
  CatalogArtistDTO,
  CatalogTrackDTO,
} from "@/lib/spotify/types";

const DEEZER_API = "https://api.deezer.com";

async function dzGet<T>(path: string, params?: Record<string, string | number | undefined>, timeoutMs = 8000): Promise<T | null> {
  try {
    const url = new URL(DEEZER_API + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "MQPlayer/2.0", Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T & { error?: { code: number; message: string; type: string } };
    if (data && typeof data === "object" && "error" in data && data.error) return null;
    return data;
  } catch {
    return null;
  }
}

/* ── Raw shapes (fields MQ consumes only) ──────────────────────────── */

interface DzTrack {
  id: number;
  title: string;
  title_short?: string;
  duration: number; // seconds
  preview?: string;
  isrc?: string;
  explicit_lyrics?: number | boolean;
  rank?: number;
  artist?: { id?: number; name?: string; picture_medium?: string; picture_xl?: string };
  album?: { id?: number; title?: string; cover_medium?: string; cover_xl?: string; cover_big?: string };
  release_date?: string;
}

interface DzArtist {
  id: number;
  name: string;
  picture_medium?: string;
  picture_xl?: string;
  picture_big?: string;
  nb_fan?: number;
  nb_album?: number;
}

interface DzAlbum {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  artist?: { id?: number; name?: string };
  release_date?: string;
  nb_tracks?: number;
  record_type?: string;
  duration?: number;
  nb_disk?: number;
}

/* ── Normalizers (Deezer → shared catalog DTOs) ────────────────────── */

export function dzNormalizeTrack(t: DzTrack): CatalogTrackDTO {
  return {
    provider: "deezer",
    id: `dz_${t.id}`,
    catalogId: String(t.id),
    title: t.title || "Unknown",
    artist: t.artist?.name || "Unknown Artist",
    artistId: t.artist?.id != null ? String(t.artist.id) : undefined,
    album: t.album?.title || "",
    albumId: t.album?.id != null ? String(t.album.id) : undefined,
    albumImage: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || "",
    durationSec: t.duration || 0,
    isrc: t.isrc || undefined,
    explicit: !!t.explicit_lyrics,
    popularity: t.rank || 0,
    previewUrl: t.preview || null,
    releaseDate: t.release_date,
  };
}

export function dzNormalizeArtist(a: DzArtist): CatalogArtistDTO {
  return {
    provider: "deezer",
    id: `dza_${a.id}`,
    catalogId: String(a.id),
    name: a.name || "Unknown Artist",
    image: a.picture_xl || a.picture_big || a.picture_medium || "",
    followers: a.nb_fan,
    genres: [],
    trackCount: a.nb_album,
    externalUrl: `https://www.deezer.com/artist/${a.id}`,
  };
}

export function dzNormalizeAlbum(al: DzAlbum): CatalogAlbumDTO {
  const year = (al.release_date || "").slice(0, 4);
  return {
    provider: "deezer",
    id: `dzl_${al.id}`,
    catalogId: String(al.id),
    name: al.title || "Unknown Album",
    artist: al.artist?.name || "Unknown Artist",
    artistId: al.artist?.id != null ? String(al.artist.id) : undefined,
    image: al.cover_xl || al.cover_big || al.cover_medium || "",
    releaseDate: al.release_date,
    year: year || undefined,
    albumType: al.record_type === "single" ? "single" : al.record_type === "ep" ? "ep" : "album",
    totalTracks: al.nb_tracks ?? 0,
    totalDurationSec: al.duration ?? 0,
    externalUrl: `https://www.deezer.com/album/${al.id}`,
  };
}

/* ── Search ────────────────────────────────────────────────────────── */

export interface DeezerSearchResult {
  tracks: CatalogTrackDTO[];
  artists: CatalogArtistDTO[];
  albums: CatalogAlbumDTO[];
}

export async function deezerSearch(query: string, limit = 10): Promise<DeezerSearchResult | null> {
  if (!query.trim()) return { tracks: [], artists: [], albums: [] };
  const [tracksRes, artistsRes, albumsRes] = await Promise.all([
    dzGet<{ data: DzTrack[] }>("/search/track", { q: query, limit }),
    dzGet<{ data: DzArtist[] }>("/search/artist", { q: query, limit: Math.min(limit, 8) }),
    dzGet<{ data: DzAlbum[] }>("/search/album", { q: query, limit: Math.min(limit, 8) }),
  ]);
  if (!tracksRes && !artistsRes && !albumsRes) return null;
  return {
    tracks: (tracksRes?.data || []).map(dzNormalizeTrack),
    artists: (artistsRes?.data || []).map(dzNormalizeArtist),
    albums: (albumsRes?.data || []).map(dzNormalizeAlbum),
  };
}

/* ── Artist ────────────────────────────────────────────────────────── */

export interface DeezerArtistFull {
  artist: CatalogArtistDTO;
  topTracks: CatalogTrackDTO[];
  albums: CatalogAlbumDTO[];
  singles: CatalogAlbumDTO[];
  eps: CatalogAlbumDTO[];
  appearsOn: CatalogAlbumDTO[];
  related: CatalogArtistDTO[];
}

export async function deezerArtist(id: string): Promise<DeezerArtistFull | null> {
  const [artist, top, albumsPage, related] = await Promise.all([
    dzGet<DzArtist>(`/artist/${id}`),
    dzGet<{ data: DzTrack[] }>(`/artist/${id}/top`, { limit: 10 }),
    dzGet<{ data: DzAlbum[] }>(`/artist/${id}/albums`, { limit: 60 }),
    dzGet<{ data: DzArtist[] }>(`/artist/${id}/related`, { limit: 12 }),
  ]);
  if (!artist) return null;

  const topTracks = (top?.data || []).slice(0, 10).map(dzNormalizeTrack);
  const albums: CatalogAlbumDTO[] = [];
  const singles: CatalogAlbumDTO[] = [];
  const eps: CatalogAlbumDTO[] = [];
  // Dedup by id AND by normalized name (Deezer lists some releases twice
  // under different regional ids — the user should see one JACKBOYS 2).
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  for (const al of albumsPage?.data || []) {
    if (!al || seenIds.has(al.id)) continue;
    const nameKey = `${(al.title || "").toLowerCase().trim()}|${al.artist?.name || ""}`.replace(/\s+/g, " ");
    if (seenNames.has(nameKey)) continue;
    seenIds.add(al.id);
    seenNames.add(nameKey);
    const dto = dzNormalizeAlbum(al);
    if (al.record_type === "single") singles.push(dto);
    else if (al.record_type === "ep") eps.push(dto);
    else albums.push(dto);
  }
  const byDate = (a: CatalogAlbumDTO, b: CatalogAlbumDTO) =>
    (b.releaseDate || "").localeCompare(a.releaseDate || "");
  albums.sort(byDate);
  singles.sort(byDate);
  eps.sort(byDate);

  return {
    artist: dzNormalizeArtist(artist),
    topTracks,
    albums: albums.slice(0, 12),
    singles: singles.slice(0, 12),
    eps: eps.slice(0, 12),
    appearsOn: [],
    related: (related?.data || []).slice(0, 12).map(dzNormalizeArtist),
  };
}

/* ── Album ─────────────────────────────────────────────────────────── */

export async function deezerAlbum(id: string): Promise<{ album: CatalogAlbumDTO; tracks: CatalogTrackDTO[] } | null> {
  const data = await dzGet<DzAlbum & { tracks?: { data: DzTrack[] }; artist?: { id?: number; name?: string } }>(`/album/${id}`);
  if (!data) return null;
  const album = dzNormalizeAlbum(data);
  const tracks = (data.tracks?.data || []).map((t) => {
    const full: DzTrack = {
      ...t,
      artist: t.artist || data.artist,
      album: { id: data.id, title: data.title, cover_xl: data.cover_xl, cover_big: data.cover_big, cover_medium: data.cover_medium },
    };
    return dzNormalizeTrack(full);
  });
  album.totalTracks = album.totalTracks || tracks.length;
  album.totalDurationSec = album.totalDurationSec || tracks.reduce((s, t) => s + t.durationSec, 0);
  return { album, tracks };
}

/* ── Track ─────────────────────────────────────────────────────────── */

export interface DeezerTrackFull {
  track: CatalogTrackDTO;
  album: CatalogAlbumDTO | null;
  albumTracks: CatalogTrackDTO[];
  artist: CatalogArtistDTO | null;
}

export async function deezerTrack(id: string): Promise<DeezerTrackFull | null> {
  const data = await dzGet<DzTrack>(`/track/${id}`);
  if (!data) return null;
  const track = dzNormalizeTrack(data);
  let album: CatalogAlbumDTO | null = null;
  let albumTracks: CatalogTrackDTO[] = [];
  if (data.album?.id != null) {
    const full = await deezerAlbum(String(data.album.id));
    if (full) {
      album = full.album;
      albumTracks = full.tracks;
    }
  }
  let artist: CatalogArtistDTO | null = null;
  if (data.artist?.id != null) {
    const a = await dzGet<DzArtist>(`/artist/${data.artist.id}`);
    if (a) artist = dzNormalizeArtist(a);
  }
  return { track, album, albumTracks, artist };
}
