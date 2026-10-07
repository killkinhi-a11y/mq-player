/**
 * Spotify Web API types — only the fields MQ consumes.
 * Server-side only; the client secret never crosses this boundary.
 */

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  images?: SpotifyImage[];
  followers?: { total: number };
  genres?: string[];
  popularity?: number;
  type: "artist";
}

export interface SpotifySimplifiedArtist {
  id: string;
  name: string;
  uri: string;
  type: "artist";
}

export interface SpotifySimplifiedAlbum {
  id: string;
  name: string;
  uri: string;
  album_type: "album" | "single" | "compilation" | "appears_on";
  total_tracks: number;
  images: SpotifyImage[];
  release_date: string;
  release_date_precision: string;
  artists: SpotifySimplifiedArtist[];
  album_group?: "album" | "single" | "compilation" | "appears_on";
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  is_playable?: boolean;
  is_local?: boolean;
  track_number: number;
  disc_number: number;
  popularity?: number;
  preview_url: string | null;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  artists: SpotifySimplifiedArtist[];
  album?: SpotifySimplifiedAlbum;
}

export interface SpotifyPlaylistBase {
  id: string;
  name: string;
  uri: string;
  description: string;
  images: SpotifyImage[] | Array<{ url: string }>;
  owner: { id: string; display_name?: string };
  public: boolean;
  tracks: { href: string; total: number };
  external_urls?: { spotify?: string };
}

export interface SpotifyPlaylistTrackItem {
  added_at: string;
  track: SpotifyTrack | null;
}

export interface SpotifyPaged<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

/* ── Normalized MQ shapes (what the API routes return) ─────────────── */

/** Catalog track — metadata identity, playable via PlaybackResolver. */
export interface CatalogTrackDTO {
  id: string; // "sp_<spotifyId>"
  spotifyId: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  albumImage?: string;
  durationSec: number;
  isrc?: string;
  explicit: boolean;
  popularity: number;
  previewUrl: string | null;
  spotifyUrl?: string;
  releaseDate?: string;
}

export interface CatalogArtistDTO {
  id: string; // "spa_<spotifyId>"
  spotifyId: string;
  name: string;
  image?: string;
  followers?: number;
  genres: string[];
  popularity?: number;
  spotifyUrl?: string;
}

export interface CatalogAlbumDTO {
  id: string; // "spl_<spotifyId>"
  spotifyId: string;
  name: string;
  artist: string;
  artistId?: string;
  image?: string;
  releaseDate?: string;
  year?: string;
  albumType: string;
  totalTracks: number;
  totalDurationSec: number;
  spotifyUrl?: string;
  label?: string;
}

export interface CatalogPlaylistDTO {
  id: string; // "spp_<spotifyId>"
  spotifyId: string;
  name: string;
  description: string;
  image?: string;
  owner?: string;
  trackCount: number;
  spotifyUrl?: string;
}
