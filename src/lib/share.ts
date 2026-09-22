/*
 * share.ts — ONE canonical share-URL builder for the whole app.
 *
 * Before this module, four different surfaces built share links inline and
 * two of them produced DEAD formats (PlaylistActionsMenu: /playlist/{id},
 * ArtistActionsMenu: /artist/{name} — both 404). This module is now the
 * single source of truth; the canonical routes are exactly the ones the
 * app can actually resolve:
 *
 *   track    → {origin}/track/{scTrackId || id}   (standalone share page)
 *   playlist → {origin}/play?pl={id}              (AppShell deep link)
 *   artist   → {origin}/play?artist={name}        (AppShell deep link)
 *
 * The track page additionally hands off into the app via /play?track={id}
 * (see AppShell deep-link parsing), so QR scans land on a page that can
 * both preview the track and open it inside MQ Player.
 */

export type ShareKind = "track" | "playlist" | "artist";

export interface ShareableTrack {
  id: string | number;
  scTrackId?: string | number | null;
}

export function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://mq1.vercel.app";
}

/** Track: /track/{scTrackId || id} — the canonical, public, SEO-indexed page. */
export function shareTrackUrl(track: ShareableTrack): string {
  const id = track.scTrackId || track.id;
  return `${appOrigin()}/track/${encodeURIComponent(String(id))}`;
}

/** Playlist: /play?pl={id} — deep link resolved by AppShell. */
export function sharePlaylistUrl(id: string | number): string {
  return `${appOrigin()}/play?pl=${encodeURIComponent(String(id))}`;
}

/** Artist: /play?artist={name} — deep link resolved by AppShell. */
export function shareArtistUrl(name: string): string {
  return `${appOrigin()}/play?artist=${encodeURIComponent(name)}`;
}

/** Hand-off used by the /track page: open this exact track inside the app. */
export function openInAppTrackUrl(track: ShareableTrack): string {
  const id = track.scTrackId || track.id;
  return `${appOrigin()}/play?track=${encodeURIComponent(String(id))}`;
}
