/**
 * MQ Spotify integration — public surface.
 *
 * V2 architecture (research-verified, download/v2-research/RESEARCH-REPORT.md):
 *  - PKCE OAuth (no client secret anywhere) — auth.ts
 *  - Web Playback SDK for FULL Spotify track playback (Premium, desktop
 *    Chromium/Firefox/Edge — no Safari, no mobile browsers) — playbackAdapter.ts
 *  - USER catalog (browser, PKCE token): search/artist/album/playlist/library —
 *    userCatalog.ts (the SERVER catalog in ./catalog.ts is the anonymous
 *    client-credentials provider used by /api/spotify/* routes)
 *  - Source priority: Spotify Official first → PlaybackResolver (their
 *    multi-provider engine, /api/resolve) → SoundCloud/Audius
 */

export { spotifyAuth } from "./auth";
export { spotifyPlaybackAdapter, isSpotifyPlaybackBrowserSupported } from "./playbackAdapter";
export * from "./userCatalog";
export type {
  SpotifySessionStatus,
  SpotifyUserInfo,
  SpotifyPlayerStateSnapshot,
  SpotifyAdapterError,
  SpotifyAdapterErrorKind,
  SpotifyOfficialResult,
} from "./types";
