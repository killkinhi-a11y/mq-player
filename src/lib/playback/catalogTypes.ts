// Shared catalog / candidate shapes for the playback resolver and the
// full-length validator (moved verbatim from ./resolver).
import type { TrackVersion } from "./versions";

/** A catalog track from any metadata provider (Spotify, …). */
export interface CatalogTrack {
  /** Provider track id (e.g. Spotify base62 id). */
  catalogId: string;
  title: string;
  artist: string;
  /** Primary artist only — used for exact artist matching. */
  album?: string;
  durationSec: number;
  /** International Standard Recording Code, when exposed by the provider. */
  isrc?: string;
  /** Version detected on the CATALOG side (usually "original"). */
  version?: TrackVersion;
}

/** A playable candidate from an audio provider. */
export interface PlaybackCandidate {
  provider: "soundcloud" | "audius";
  /** Provider-native track id (scTrackId / audius id — no prefix). */
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artwork?: string;
  /** Preview-only stream (SoundCloud SNIP policy). */
  isPreview?: boolean;
  isrc?: string;
  popularity?: number;
}
