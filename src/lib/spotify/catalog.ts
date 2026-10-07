/**
 * Spotify Catalog Provider — server-side.
 *
 * ROLE IN THE ARCHITECTURE: metadata/catalog ONLY (search, artists, albums,
 * tracks, playlists, artwork). Audio playback is NEVER attempted here —
 * catalog tracks are resolved to playable sources (SoundCloud / Audius) by
 * the PlaybackResolver. Spotify 30s preview_url is a PREVIEW, not playback.
 *
 * SECURITY: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are read ONLY in this
 * server module. The token is cached in module scope; the secret never
 * appears in any response, log, or client bundle.
 *
 * GRACEFUL DEGRADATION: every export returns `null` / `{ configured: false }`
 * when credentials are missing or Spotify is unreachable — the caller shows
 * an honest "unavailable" state and the SoundCloud/Audius catalog keeps
 * working. No fake data, ever.
 */

import type {
  CatalogAlbumDTO,
  CatalogArtistDTO,
  CatalogPlaylistDTO,
  CatalogTrackDTO,
  SpotifyArtist,
  SpotifyPaged,
  SpotifyPlaylistBase,
  SpotifySimplifiedAlbum,
  SpotifyTrack,
} from "./types";

/* ── Config / token ────────────────────────────────────────────────── */

const SPOTIFY_API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}
let tokenCache: TokenCache | null = null;

/** Client-credentials token (cached until 60s before expiry). */
export async function getSpotifyToken(): Promise<string | null> {
  if (!isSpotifyConfigured()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  try {
    const cid = process.env.SPOTIFY_CLIENT_ID!;
    const csec = process.env.SPOTIFY_CLIENT_SECRET!;
    const basic = Buffer.from(`${cid}:${csec}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return tokenCache.token;
  } catch {
    return null;
  }
}

/** Authenticated GET with timeout; null on any failure. */
async function spGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const url = new URL(SPOTIFY_API + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) {
      tokenCache = null; // token revoked mid-flight — force refresh next call
      return null;
    }
    if (res.status === 429) return null; // rate limited — caller degrades
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ── Normalizers (Spotify → MQ DTOs) ───────────────────────────────── */

export function normalizeTrack(t: SpotifyTrack): CatalogTrackDTO {
  const album = t.album;
  return {
    id: `sp_${t.id}`,
    spotifyId: t.id,
    title: t.name || "Unknown",
    artist: (t.artists || []).map((a) => a.name).join(", ") || "Unknown Artist",
    artistId: t.artists?.[0]?.id,
    album: album?.name || "",
    albumId: album?.id,
    albumImage: album?.images?.[0]?.url || "",
    durationSec: Math.round((t.duration_ms || 0) / 1000),
    isrc: t.external_ids?.isrc,
    explicit: !!t.explicit,
    popularity: t.popularity ?? 0,
    previewUrl: t.preview_url || null,
    spotifyUrl: t.external_urls?.spotify,
    releaseDate: album?.release_date,
  };
}

export function normalizeArtist(a: SpotifyArtist): CatalogArtistDTO {
  return {
    id: `spa_${a.id}`,
    spotifyId: a.id,
    name: a.name || "Unknown Artist",
    image: a.images?.[0]?.url || "",
    followers: a.followers?.total,
    genres: a.genres || [],
    popularity: a.popularity,
    spotifyUrl: `https://open.spotify.com/artist/${a.id}`,
  };
}

export function normalizeAlbum(al: SpotifySimplifiedAlbum): CatalogAlbumDTO {
  const year = (al.release_date || "").slice(0, 4);
  return {
    id: `spl_${al.id}`,
    spotifyId: al.id,
    name: al.name || "Unknown Album",
    artist: (al.artists || []).map((a) => a.name).join(", ") || "Unknown Artist",
    artistId: al.artists?.[0]?.id,
    image: al.images?.[0]?.url || "",
    releaseDate: al.release_date,
    year: year || undefined,
    albumType: al.album_type || "album",
    totalTracks: al.total_tracks ?? 0,
    totalDurationSec: 0, // filled by album details when tracks are present
    spotifyUrl: `https://open.spotify.com/album/${al.id}`,
  };
}

function normalizePlaylist(p: SpotifyPlaylistBase): CatalogPlaylistDTO {
  const img = Array.isArray(p.images) ? p.images[0] : undefined;
  return {
    id: `spp_${p.id}`,
    spotifyId: p.id,
    name: p.name || "Playlist",
    description: p.description || "",
    image: img?.url || "",
    owner: p.owner?.display_name || p.owner?.id,
    trackCount: p.tracks?.total ?? 0,
    spotifyUrl: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
  };
}

/* ── Search ────────────────────────────────────────────────────────── */

export interface SpotifySearchResult {
  tracks: CatalogTrackDTO[];
  artists: CatalogArtistDTO[];
  albums: CatalogAlbumDTO[];
  playlists: CatalogPlaylistDTO[];
}

export async function spotifySearch(query: string, limit = 10): Promise<SpotifySearchResult | null> {
  const empty: SpotifySearchResult = { tracks: [], artists: [], albums: [], playlists: [] };
  if (!query.trim()) return empty;
  const data = await spGet<{
    tracks?: SpotifyPaged<SpotifyTrack>;
    artists?: SpotifyPaged<SpotifyArtist>;
    albums?: SpotifyPaged<SpotifySimplifiedAlbum>;
    playlists?: SpotifyPaged<SpotifyPlaylistBase>;
  }>("/search", {
    q: query,
    type: "track,artist,album,playlist",
    limit,
  });
  if (!data) return null;
  return {
    tracks: (data.tracks?.items || []).filter((t) => t && !t.is_local).map(normalizeTrack),
    artists: (data.artists?.items || []).filter(Boolean).map(normalizeArtist),
    albums: (data.albums?.items || []).filter(Boolean).map(normalizeAlbum),
    playlists: (data.playlists?.items || []).filter(Boolean).map(normalizePlaylist),
  };
}

/* ── Artist ────────────────────────────────────────────────────────── */

export interface SpotifyArtistFull {
  artist: CatalogArtistDTO;
  topTracks: CatalogTrackDTO[];
  albums: CatalogAlbumDTO[];
  singles: CatalogAlbumDTO[];
  eps: CatalogAlbumDTO[];
  appearsOn: CatalogAlbumDTO[];
  related: CatalogArtistDTO[];
}

export async function spotifyArtist(id: string): Promise<SpotifyArtistFull | null> {
  const [artist, top, albumsPage, related] = await Promise.all([
    spGet<SpotifyArtist>(`/artists/${id}`),
    spGet<SpotifyPaged<SpotifyTrack>>(`/artists/${id}/top-tracks`, { market: "US" }),
    spGet<SpotifyPaged<SpotifySimplifiedAlbum>>(`/artists/${id}/albums`, {
      include_groups: "album,single,appears_on",
      limit: 50,
      market: "US",
    }),
    spGet<{ artists: SpotifyArtist[] }>(`/artists/${id}/related-artists`),
  ]);
  if (!artist) return null;

  const topTracks = (top?.items || []).filter((t) => t && !t.is_local).slice(0, 10).map(normalizeTrack);
  const allAlbums = albumsPage?.items || [];
  const albums: CatalogAlbumDTO[] = [];
  const singles: CatalogAlbumDTO[] = [];
  const eps: CatalogAlbumDTO[] = [];
  const appearsOn: CatalogAlbumDTO[] = [];
  const seen = new Set<string>();
  for (const al of allAlbums) {
    if (!al || seen.has(al.id)) continue;
    seen.add(al.id);
    const dto = normalizeAlbum(al);
    if (al.album_type === "album") albums.push(dto);
    else if (al.album_type === "single") {
      // Spotify reports EPs as singles; EP = single with >1 track (or name hints).
      const isEp = al.total_tracks > 1 || /\bep\b/i.test(al.name || "");
      (isEp ? eps : singles).push(dto);
    } else if (al.album_type === "compilation") {
      // compilations the artist merely appears on:
      appearsOn.push(dto);
    } else if (al.album_type === "appears_on") {
      appearsOn.push(dto);
    }
  }
  // newest first
  const byDate = (a: CatalogAlbumDTO, b: CatalogAlbumDTO) =>
    (b.releaseDate || "").localeCompare(a.releaseDate || "");
  albums.sort(byDate);
  singles.sort(byDate);
  eps.sort(byDate);
  appearsOn.sort(byDate);

  return {
    artist: normalizeArtist(artist),
    topTracks,
    albums: albums.slice(0, 12),
    singles: singles.slice(0, 12),
    eps: eps.slice(0, 12),
    appearsOn: appearsOn.slice(0, 12),
    related: (related?.artists || []).slice(0, 12).map(normalizeArtist),
  };
}

/* ── Album ─────────────────────────────────────────────────────────── */

export interface SpotifyAlbumFull {
  album: CatalogAlbumDTO;
  tracks: CatalogTrackDTO[];
}

export async function spotifyAlbum(id: string): Promise<SpotifyAlbumFull | null> {
  const data = await spGet<SpotifySimplifiedAlbum & { tracks: SpotifyPaged<SpotifyTrack>; label?: string }>(
    `/albums/${id}`,
    { market: "US" },
  );
  if (!data) return null;
  const tracks = (data.tracks?.items || [])
    .filter((t) => t && !t.is_local)
    .map((t) => {
      const dto = normalizeTrack({ ...t, album: data });
      return dto;
    });
  const album = normalizeAlbum(data);
  album.label = data.label;
  album.totalDurationSec = tracks.reduce((s, t) => s + t.durationSec, 0);
  return { album, tracks };
}

/* ── Track ─────────────────────────────────────────────────────────── */

export interface SpotifyTrackFull {
  track: CatalogTrackDTO;
  album: CatalogAlbumDTO | null;
  albumTracks: CatalogTrackDTO[];
  artist: CatalogArtistDTO | null;
}

export async function spotifyTrack(id: string): Promise<SpotifyTrackFull | null> {
  const data = await spGet<SpotifyTrack>(`/tracks/${id}`, { market: "US" });
  if (!data) return null;
  const track = normalizeTrack(data);
  let album: CatalogAlbumDTO | null = null;
  let albumTracks: CatalogTrackDTO[] = [];
  if (data.album?.id) {
    const full = await spotifyAlbum(data.album.id);
    if (full) {
      album = full.album;
      albumTracks = full.tracks;
    }
  }
  let artist: CatalogArtistDTO | null = null;
  if (data.artists?.[0]?.id) {
    const a = await spGet<SpotifyArtist>(`/artists/${data.artists[0].id}`);
    if (a) artist = normalizeArtist(a);
  }
  return { track, album, albumTracks, artist };
}

/* ── Suggestions (search typeahead) ────────────────────────────────── */

export async function spotifySuggestions(query: string): Promise<string[] | null> {
  if (!query.trim()) return [];
  const data = await spGet<SpotifyPaged<SpotifyTrack>>("/search", {
    q: query,
    type: "track",
    limit: 8,
  });
  if (!data) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of data.items || []) {
    if (!t?.name) continue;
    const label = `${t.artists?.[0]?.name ?? ""} — ${t.name}`.replace(/^ — /, "");
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}
