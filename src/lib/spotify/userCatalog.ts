/**
 * Spotify User Catalog — client-side Web API access with the USER's PKCE
 * token (V2 §7/§17: Spotify Official Playback + personal library).
 *
 * Difference from ./catalog (server, client-credentials, metadata-only):
 * THIS module runs in the browser with the user's OAuth token and returns
 * queue-Ready Tracks that carry the FULL V2 identity — catalogProvider/
 * catalogId (resolver attribution) AND spotifyUri (official playback).
 *
 * Priority (§16): the engine tries spotifyUri via the Web Playback SDK
 * FIRST (Premium + supported browser), then falls back to the
 * PlaybackResolver (SoundCloud/Audius) — never the other way around.
 */

import { spotifyAuth } from "./auth";
import type { Track } from "@/lib/musicApi";

const API = "https://api.spotify.com/v1";

async function apiGet<T>(path: string, timeoutMs = 10000): Promise<T | null> {
  const token = await spotifyAuth.getValidToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Spotify API shapes (minimal) ─────────────────────────────────────────

interface SpArtist {
  id: string;
  name: string;
  images?: { url: string }[];
  followers?: { total?: number };
  genres?: string[];
}

interface SpAlbum {
  id: string;
  name: string;
  images: { url: string; width?: number; height?: number }[];
  release_date?: string;
  album_type?: string;
  total_tracks?: number;
  artists?: { id: string; name: string }[];
}

interface SpTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  preview_url?: string | null;
  artists?: { id: string; name: string }[];
  album?: SpAlbum;
  is_playable?: boolean;
}

interface SpPlaylistSimplified {
  id: string;
  uri: string;
  name: string;
  images?: { url: string }[];
  tracks?: { total?: number };
  owner?: { display_name?: string };
}

// ── Mapping → V2 Track (catalog identity + spotifyUri for Mode A) ───────

/**
 * The output shape matches the server catalogToTrack contract
 * (source "spotify" = lazy-resolve marker) PLUS spotifyUri so the engine
 * can attempt Spotify Official Playback before the resolver runs.
 * previewUrl stays undefined — MQ never plays Spotify previews (§2).
 */
export function spTrackToTrack(t: SpTrack): Track {
  const artists = (t.artists || []).map((a) => a.name).join(", ");
  const images = t.album?.images || [];
  const best = images.find((i) => i.width && i.width >= 300) || images[0];
  return {
    id: `sp_${t.id}`,
    title: t.name,
    artist: artists,
    album: t.album?.name || "",
    duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : 0,
    cover: best?.url || "",
    genre: "",
    audioUrl: "",
    previewUrl: undefined,
    // V2 multi-provider identity: catalog attribution for the resolver,
    // spotifyUri for the Web Playback SDK (official playback).
    source: "spotify",
    catalogProvider: "spotify",
    catalogId: t.id,
    spotifyUri: t.uri,
    spotifyTrackId: t.id,
  } as Track;
}

// ── Search (§17) ─────────────────────────────────────────────────────────

export interface SpotifySearchResults {
  tracks: Track[];
  artists: { id: string; name: string; image?: string; followers?: number; genres?: string[] }[];
  albums: { id: string; uri: string; name: string; image?: string; year?: string; artist?: string; totalTracks?: number }[];
  playlists: { id: string; uri: string; name: string; image?: string; totalTracks?: number; owner?: string }[];
}

export async function searchAll(
  query: string,
  limit = 20,
): Promise<SpotifySearchResults | null> {
  const data = await apiGet<{
    tracks?: { items: SpTrack[] };
    artists?: { items: SpArtist[] };
    albums?: { items: SpAlbum[] };
    playlists?: { items: SpPlaylistSimplified[] };
  }>(
    `/search?q=${encodeURIComponent(query)}&type=track,artist,album,playlist&limit=${limit}`,
  );
  if (!data) return null;
  return {
    tracks: (data.tracks?.items || []).filter((t) => t && t.id).map(spTrackToTrack),
    artists: (data.artists?.items || []).map((a) => ({
      id: a.id,
      name: a.name,
      image: a.images?.[0]?.url,
      followers: a.followers?.total,
      genres: a.genres,
    })),
    albums: (data.albums?.items || []).map((a) => ({
      id: a.id,
      uri: `spotify:album:${a.id}`,
      name: a.name,
      image: a.images?.[0]?.url,
      year: a.release_date?.slice(0, 4),
      artist: (a.artists || []).map((x) => x.name).join(", "),
      totalTracks: a.total_tracks,
    })),
    playlists: (data.playlists?.items || []).map((p) => ({
      id: p.id,
      uri: `spotify:playlist:${p.id}`,
      name: p.name,
      image: p.images?.[0]?.url,
      totalTracks: p.tracks?.total,
      owner: p.owner?.display_name,
    })),
  };
}

// ── Artist (§19) ─────────────────────────────────────────────────────────

export async function getArtist(
  artistId: string,
): Promise<{ id: string; name: string; image?: string; followers?: number; genres?: string[] } | null> {
  const a = await apiGet<SpArtist>(`/artists/${artistId}`);
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    followers: a.followers?.total,
    genres: a.genres,
  };
}

export async function getArtistTopTracks(artistId: string): Promise<Track[]> {
  const data = await apiGet<{ tracks: SpTrack[] }>(`/artists/${artistId}/top-tracks`);
  return (data?.tracks || []).filter((t) => t && t.id).map(spTrackToTrack);
}

export async function getArtistAlbums(
  artistId: string,
): Promise<{ id: string; uri: string; name: string; image?: string; year?: string; totalTracks?: number; albumType?: string }[]> {
  const data = await apiGet<{ items: SpAlbum[] }>(
    `/artists/${artistId}/albums?include_groups=album,single&limit=30`,
  );
  return (data?.items || []).map((a) => ({
    id: a.id,
    uri: `spotify:album:${a.id}`,
    name: a.name,
    image: a.images?.[0]?.url,
    year: a.release_date?.slice(0, 4),
    totalTracks: a.total_tracks,
    albumType: a.album_type,
  }));
}

// ── Album / Playlist (§19) ───────────────────────────────────────────────

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const data = await apiGet<{
    name?: string;
    artists?: { name: string }[];
    images?: { url: string }[];
    tracks?: { items: SpTrack[] };
  }>(`/albums/${albumId}`);
  const items = data?.tracks?.items || [];
  const albumName = data?.name || "";
  const artistNames = (data?.artists || []).map((a) => a.name).join(", ");
  const cover = data?.images?.[0]?.url || "";
  return items
    .filter((t) => t && t.id)
    .map((t) =>
      spTrackToTrack({
        ...t,
        album: { id: albumId, name: albumName, images: [{ url: cover }] } as SpAlbum,
        artists: t.artists?.length ? t.artists : [{ id: "", name: artistNames }],
      }),
    );
}

export async function getPlaylistTracks(playlistId: string, limit = 100): Promise<Track[]> {
  const data = await apiGet<{
    name?: string;
    images?: { url: string }[];
    tracks?: { items: { track: SpTrack | null }[] };
  }>(`/playlists/${playlistId}/tracks?limit=${limit}&fields=name,images,tracks.items(track(id,uri,name,duration_ms,artists,album(id,name,images)))`);
  const cover = data?.images?.[0]?.url || "";
  return (data?.tracks?.items || [])
    .map((it) => it.track)
    .filter((t): t is SpTrack => !!t && !!t.id)
    .map((t) =>
      spTrackToTrack({
        ...t,
        album: t.album?.images?.length
          ? t.album
          : { ...t.album, images: cover ? [{ url: cover }] : [] } as SpAlbum,
      }),
    );
}

// ── Library (§18) ────────────────────────────────────────────────────────

export async function getSavedTracks(limit = 50): Promise<Track[]> {
  const data = await apiGet<{ items: { track: SpTrack | null }[] }>(
    `/me/tracks?limit=${limit}`,
  );
  return (data?.items || [])
    .map((it) => it.track)
    .filter((t): t is SpTrack => !!t && !!t.id)
    .map(spTrackToTrack);
}

export async function getSavedAlbums(limit = 30): Promise<
  { id: string; uri: string; name: string; image?: string; year?: string; artist?: string; totalTracks?: number }[]
> {
  const data = await apiGet<{ items: { album: SpAlbum }[] }>(`/me/albums?limit=${limit}`);
  return (data?.items || []).map(({ album: a }) => ({
    id: a.id,
    uri: `spotify:album:${a.id}`,
    name: a.name,
    image: a.images?.[0]?.url,
    year: a.release_date?.slice(0, 4),
    artist: (a.artists || []).map((x) => x.name).join(", "),
    totalTracks: a.total_tracks,
  }));
}

export async function getFollowedArtists(limit = 30): Promise<
  { id: string; name: string; image?: string; followers?: number }[]
> {
  const data = await apiGet<{ artists?: { items: SpArtist[] } }>(
    `/me/following?type=artist&limit=${limit}`,
  );
  return (data?.artists?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    followers: a.followers?.total,
  }));
}

export async function getUserPlaylists(limit = 50): Promise<
  { id: string; uri: string; name: string; image?: string; totalTracks?: number; owner?: string }[]
> {
  const data = await apiGet<{ items: SpPlaylistSimplified[] }>(`/me/playlists?limit=${limit}`);
  return (data?.items || []).map((p) => ({
    id: p.id,
    uri: `spotify:playlist:${p.id}`,
    name: p.name,
    image: p.images?.[0]?.url,
    totalTracks: p.tracks?.total,
    owner: p.owner?.display_name,
  }));
}

export async function getRecentlyPlayed(limit = 50): Promise<Track[]> {
  const data = await apiGet<{ items: { track: SpTrack | null }[] }>(
    `/me/player/recently-played?limit=${limit}`,
  );
  return (data?.items || [])
    .map((it) => it.track)
    .filter((t): t is SpTrack => !!t && !!t.id)
    .map(spTrackToTrack);
}

export async function getTopTracks(limit = 30): Promise<Track[]> {
  const data = await apiGet<{ items: SpTrack[] }>(`/me/top/tracks?limit=${limit}`);
  return (data?.items || []).filter((t) => t && t.id).map(spTrackToTrack);
}

export async function getTopArtists(limit = 20): Promise<
  { id: string; name: string; image?: string; followers?: number; genres?: string[] }[]
> {
  const data = await apiGet<{ items: SpArtist[] }>(`/me/top/artists?limit=${limit}`);
  return (data?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    followers: a.followers?.total,
    genres: a.genres,
  }));
}

// ── Library actions ──────────────────────────────────────────────────────

/** Save/unsave the CURRENT track (needs user-library-modify scope). */
export async function setSavedTrack(spotifyTrackId: string, save: boolean): Promise<boolean> {
  const token = await spotifyAuth.getValidToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API}/me/tracks`, {
      method: save ? "PUT" : "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [spotifyTrackId] }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
