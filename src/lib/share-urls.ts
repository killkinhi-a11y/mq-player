/**
 * Canonical share URLs — the web mirror of Android's DeepLinkParser
 * (android/.../deeplink/DeepLinkParser.kt). ONE builder per content type,
 * ONE canonical origin. Every share surface (ShareSheet QR, copy link,
 * native share, context menus) must go through these — web and Android
 * links stay byte-identical (§25.8 share link consistency).
 *
 * Routes (verified by Android App Links assetlinks.json):
 * - Track:    {APP_URL}/track/{scTrackId}   → public /track/[id] page + app
 * - Artist:   {APP_URL}/play?artist={name} → AppShell deep link + app
 * - Playlist: {APP_URL}/play?pl={id}       → AppShell deep link + app
 */
import { APP_URL } from "@/lib/config";

/** Track share link — null when the track has no publicly resolvable id
 *  (demo/local tracks: /api/tracks/share resolves SoundCloud ids only). */
export function shareTrackUrl(track: { scTrackId?: number; id: string }): string | null {
  if (!track.scTrackId) return null;
  return `${APP_URL}/track/${track.scTrackId}`;
}

/** Artist share link (artist id IS the name — same as Android). */
export function shareArtistUrl(artistName: string): string {
  return `${APP_URL}/play?artist=${encodeURIComponent(artistName)}`;
}

/** Playlist share link (public playlists resolve on /play?pl=). */
export function sharePlaylistUrl(playlistId: string): string {
  return `${APP_URL}/play?pl=${encodeURIComponent(playlistId)}`;
}
