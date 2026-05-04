/**
 * Spotify Web API Client
 *
 * Uses the Client Credentials flow (server-side only).
 * Provides search, artist/album/playlist lookups, and 30-second preview URLs.
 *
 * Token is cached in memory and auto-refreshed before expiry.
 */

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/* ─── Token cache ─── */
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[Spotify] SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set");
    return null;
  }

  // Return cached token if still valid (with 60s safety margin)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error("[Spotify] Token request failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    cachedToken = data.access_token;
    // Spotify tokens last 3600s; expire slightly early for safety
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  } catch (err) {
    console.error("[Spotify] Token request error:", err);
    return null;
  }
}

/* ─── Generic fetch wrapper ─── */
async function spotifyFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const url = new URL(`${SPOTIFY_API_BASE}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) {
      // Token expired unexpectedly — clear cache and retry once
      cachedToken = null;
      tokenExpiresAt = 0;
      const newToken = await getAccessToken();
      if (!newToken) return null;
      const retry = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${newToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!retry.ok) return null;
      return retry.json() as T;
    }
    if (!res.ok) return null;
    return res.json() as T;
  } catch (err) {
    console.error(`[Spotify] Fetch error ${endpoint}:`, err);
    return null;
  }
}

/* ─── Simple in-memory cache ─── */
const apiCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  apiCache.delete(key);
  return null;
}

function setApiCache(key: string, data: unknown): void {
  apiCache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

/* ─── Interfaces ─── */

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  duration: number; // seconds
  cover: string;
  coverSmall: string;
  previewUrl: string;
  spotifyUri: string;
  genre: string;
  releaseDate: string;
  popularity: number;
  explicit: boolean;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  avatar: string;
  avatarSmall: string;
  followers: number;
  genres: string[];
  popularity: number;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  cover: string;
  coverSmall: string;
  releaseDate: string;
  totalTracks: number;
  type: "album" | "single" | "compilation";
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  cover: string;
  coverSmall: string;
  owner: string;
  totalTracks: number;
  tracks: SpotifyTrack[];
}

/* ─── API Functions ─── */

/**
 * Search Spotify for tracks, artists, albums, or playlists.
 */
export async function searchSpotify(
  query: string,
  types: ("tracks" | "artists" | "albums" | "playlists")[] = ["tracks"],
  limit = 20,
  offset = 0
): Promise<{
  tracks: SpotifyTrack[];
  artists: SpotifyArtist[];
  albums: SpotifyAlbum[];
  playlists: SpotifyAlbum[]; // simplified — same shape needed for UI cards
}> {
  const cacheKey = `search:${query.toLowerCase()}:${types.join(",")}:${limit}:${offset}`;
  const cached = getCached<{
    tracks: SpotifyTrack[];
    artists: SpotifyArtist[];
    albums: SpotifyAlbum[];
    playlists: SpotifyAlbum[];
  }>(cacheKey);
  if (cached) return cached;

  const type = types.join(",");
  const data = await spotifyFetch<{
    tracks?: { items: SpotifyRawTrack[] };
    artists?: { items: SpotifyRawArtist[] };
    albums?: { items: SpotifyRawAlbum[] };
    playlists?: { items: SpotifyRawPlaylist[] };
  }>("/search", { q: query, type, limit: String(limit), offset: String(offset) });

  if (!data) return { tracks: [], artists: [], albums: [], playlists: [] };

  const result = {
    tracks: (data.tracks?.items || []).map(mapSpotifyTrack),
    artists: (data.artists?.items || []).map(mapSpotifyArtist),
    albums: (data.albums?.items || []).map(mapSpotifyAlbum),
    playlists: (data.playlists?.items || []).map(mapSpotifyPlaylistToAlbum),
  };

  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get an artist's details, top tracks, and related artists.
 */
export async function getSpotifyArtist(artistId: string): Promise<{
  artist: SpotifyArtist | null;
  topTracks: SpotifyTrack[];
  albums: SpotifyAlbum[];
  relatedArtists: SpotifyArtist[];
} | null> {
  const cacheKey = `artist:${artistId}`;
  const cached = getCached<ReturnType<typeof getSpotifyArtist>>(cacheKey);
  if (cached) return cached;

  const [artistData, topTracksData, albumsData, relatedData] = await Promise.all([
    spotifyFetch<SpotifyRawArtist>(`/artists/${artistId}`),
    spotifyFetch<{ tracks: SpotifyRawTrack[] }>(`/artists/${artistId}/top-tracks`, { market: "US" }),
    spotifyFetch<{ items: SpotifyRawAlbum[] }>(`/artists/${artistId}/albums`, { limit: "20", include_groups: "album,single" }),
    spotifyFetch<{ artists: SpotifyRawArtist[] }>(`/artists/${artistId}/related-artists`),
  ]);

  const result = {
    artist: artistData ? mapSpotifyArtist(artistData) : null,
    topTracks: (topTracksData?.tracks || []).map(mapSpotifyTrack),
    albums: (albumsData?.items || []).map(mapSpotifyAlbum),
    relatedArtists: (relatedData?.artists || []).map(mapSpotifyArtist),
  };

  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get a playlist's details and tracks.
 */
export async function getSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylist | null> {
  const cacheKey = `playlist:${playlistId}`;
  const cached = getCached<SpotifyPlaylist>(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetch<{
    id: string;
    name: string;
    description: string;
    images: Array<{ url: string; width?: number; height?: number }>;
    owner?: { display_name?: string; id: string };
    tracks?: {
      items: Array<{
        track?: SpotifyRawTrack;
        is_local?: boolean;
      }>;
      next: string | null;
      total: number;
    };
  }>(`/playlists/${playlistId}`);

  if (!data) return null;

  const images = data.images || [];
  const cover = images[0]?.url || "";
  const coverSmall = (images.find(i => i.width && i.width < 300) || images[0] || {}).url || "";

  const tracks = (data.tracks?.items || [])
    .filter(item => item.track && !item.is_local)
    .map(item => mapSpotifyTrack(item.track!));

  const result: SpotifyPlaylist = {
    id: data.id,
    name: data.name,
    description: data.description || "",
    cover,
    coverSmall,
    owner: data.owner?.display_name || "Spotify",
    totalTracks: data.tracks?.total || tracks.length,
    tracks,
  };

  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get an album's details and tracks.
 */
export async function getSpotifyAlbum(albumId: string): Promise<{
  album: SpotifyAlbum;
  tracks: SpotifyTrack[];
  artist: SpotifyArtist;
} | null> {
  const cacheKey = `album:${albumId}`;
  const cached = getCached<ReturnType<typeof getSpotifyAlbum>>(cacheKey);
  if (cached) return cached;

  const [albumData, artistData] = await Promise.all([
    spotifyFetch<{
      id: string;
      name: string;
      artists: Array<{ id: string; name: string }>;
      images: Array<{ url: string; width?: number; height?: number }>;
      release_date: string;
      total_tracks: number;
      album_type: string;
      tracks?: { items: SpotifyRawTrack[] };
    }>(`/albums/${albumId}`),
    // Get artist info for the first artist
    (() => {
      // We'll need to fetch artist after getting album data
      return Promise.resolve(null);
    })(),
  ]);

  if (!albumData) return null;

  const images = albumData.images || [];
  const cover = images[0]?.url || "";
  const coverSmall = (images.find(i => i.width && i.width < 300) || images[0] || {}).url || "";

  // Fetch artist
  const artistId = albumData.artists[0]?.id;
  let artist: SpotifyArtist | null = null;
  if (artistId) {
    const a = await spotifyFetch<SpotifyRawArtist>(`/artists/${artistId}`);
    if (a) artist = mapSpotifyArtist(a);
  }

  const album: SpotifyAlbum = {
    id: albumData.id,
    name: albumData.name,
    artist: albumData.artists[0]?.name || "Unknown",
    artistId: albumData.artists[0]?.id || "",
    cover,
    coverSmall,
    releaseDate: albumData.release_date,
    totalTracks: albumData.total_tracks,
    type: (albumData.album_type as "album" | "single" | "compilation") || "album",
  };

  const tracks = (albumData.tracks?.items || [])
    .map(mapSpotifyTrack);

  const result = { album, tracks, artist: artist || { id: "", name: album.artist, avatar: "", avatarSmall: "", followers: 0, genres: [], popularity: 0 } };
  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get new releases from Spotify.
 */
export async function getSpotifyNewReleases(limit = 20): Promise<SpotifyAlbum[]> {
  const cacheKey = `new-releases:${limit}`;
  const cached = getCached<SpotifyAlbum[]>(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetch<{
    albums: { items: SpotifyRawAlbum[] };
  }>("/browse/new-releases", { limit: String(limit), country: "US" });

  const result = (data?.albums?.items || []).map(mapSpotifyAlbum);
  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get featured playlists from Spotify.
 */
export async function getSpotifyFeaturedPlaylists(limit = 12): Promise<SpotifyAlbum[]> {
  const cacheKey = `featured-playlists:${limit}`;
  const cached = getCached<SpotifyAlbum[]>(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetch<{
    playlists: { items: SpotifyRawPlaylist[] };
  }>("/browse/featured-playlists", { limit: String(limit), country: "US" });

  const result = (data?.playlists?.items || []).map(mapSpotifyPlaylistToAlbum);
  setApiCache(cacheKey, result);
  return result;
}

/**
 * Get several artists by IDs.
 */
export async function getSpotifyArtists(artistIds: string[]): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) return [];
  const cacheKey = `artists:${artistIds.join(",")}`;
  const cached = getCached<SpotifyArtist[]>(cacheKey);
  if (cached) return cached;

  const data = await spotifyFetch<{ artists: SpotifyRawArtist[] }>(
    `/artists`,
    { ids: artistIds.join(",") }
  );

  const result = (data?.artists || []).map(mapSpotifyArtist);
  setApiCache(cacheKey, result);
  return result;
}

/* ─── Raw Spotify API types ─── */

interface SpotifyRawTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; width?: number; height?: number }>;
    release_date: string;
  };
  duration_ms: number;
  preview_url: string | null;
  popularity: number;
  explicit: boolean;
}

interface SpotifyRawArtist {
  id: string;
  name: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  followers: number;
  genres: string[];
  popularity: number;
}

interface SpotifyRawAlbum {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  images: Array<{ url: string; width?: number; height?: number }>;
  release_date: string;
  total_tracks: number;
  album_type: string;
}

interface SpotifyRawPlaylist {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  owner?: { display_name?: string };
  tracks?: { total: number };
}

/* ─── Mappers: Raw → App interfaces ─── */

function getImageUrl(
  images: Array<{ url: string; width?: number; height?: number }>,
  preferredMaxSize = 300
): { cover: string; coverSmall: string } {
  if (!images || images.length === 0) return { cover: "", coverSmall: "" };
  const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
  const cover = sorted[0]?.url || "";
  const small = sorted.find(i => i.width && i.width <= preferredMaxSize);
  const coverSmall = small?.url || sorted[sorted.length - 1]?.url || cover;
  return { cover, coverSmall };
}

function mapSpotifyTrack(raw: SpotifyRawTrack): SpotifyTrack {
  const { cover, coverSmall } = getImageUrl(raw.album?.images);
  return {
    id: `sp_${raw.id}`,
    title: raw.name,
    artist: raw.artists?.[0]?.name || "Unknown Artist",
    artistId: raw.artists?.[0]?.id || "",
    album: raw.album?.name || "",
    albumId: raw.album?.id || "",
    duration: Math.round(raw.duration_ms / 1000),
    cover,
    coverSmall,
    previewUrl: raw.preview_url || "",
    spotifyUri: `spotify:track:${raw.id}`,
    genre: "",
    releaseDate: raw.album?.release_date || "",
    popularity: raw.popularity || 0,
    explicit: raw.explicit || false,
  };
}

function mapSpotifyArtist(raw: SpotifyRawArtist): SpotifyArtist {
  const { cover, coverSmall } = getImageUrl(raw.images);
  return {
    id: raw.id,
    name: raw.name,
    avatar: cover,
    avatarSmall: coverSmall,
    followers: raw.followers || 0,
    genres: raw.genres || [],
    popularity: raw.popularity || 0,
  };
}

function mapSpotifyAlbum(raw: SpotifyRawAlbum): SpotifyAlbum {
  const { cover, coverSmall } = getImageUrl(raw.images);
  return {
    id: raw.id,
    name: raw.name,
    artist: raw.artists?.[0]?.name || "Unknown",
    artistId: raw.artists?.[0]?.id || "",
    cover,
    coverSmall,
    releaseDate: raw.release_date || "",
    totalTracks: raw.total_tracks || 0,
    type: (raw.album_type as "album" | "single" | "compilation") || "album",
  };
}

function mapSpotifyPlaylistToAlbum(raw: SpotifyRawPlaylist): SpotifyAlbum {
  const { cover, coverSmall } = getImageUrl(raw.images);
  return {
    id: raw.id,
    name: raw.name,
    artist: raw.owner?.display_name || "Spotify",
    artistId: raw.owner?.display_name || "",
    cover,
    coverSmall,
    releaseDate: "",
    totalTracks: raw.tracks?.total || 0,
    type: "compilation",
  };
}

/* ─── Convert SpotifyTrack → app Track (for PlayerBar / Queue) ─── */

export function spotifyTrackToAppTrack(sp: SpotifyTrack): import("./musicApi").Track {
  return {
    id: sp.id,
    title: sp.title,
    artist: sp.artist,
    album: sp.album,
    duration: sp.duration,
    cover: sp.cover,
    genre: sp.genre || sp.releaseDate ? "" : "",
    // audioUrl is empty — full playback handled via Spotify Web Playback SDK
    // previewUrl is kept as fallback for when SDK is unavailable
    audioUrl: "",
    previewUrl: sp.previewUrl || "",
    source: "spotify",
    spotifyTrackId: sp.id.replace("sp_", ""),
    spotifyArtistId: sp.artistId,
    spotifyAlbumId: sp.albumId,
  };
}
