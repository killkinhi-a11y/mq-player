/**
 * Yandex Music PUBLIC playlist URL parser (pure, client + server safe).
 *
 * Strict allow-list contract — the user's URL is NEVER fetched. We only
 * extract (ownerLogin, kind) or (playlistUuid) and hand them to the signed
 * server-side adapter which talks to api.music.yandex.net itself. Arbitrary
 * hosts, redirects and userinfo tricks are rejected before any network
 * activity (SSRF-safe by construction).
 *
 * Accepted shapes (query string and hash are ignored):
 *   https://music.yandex.ru/users/{login}/playlists/{kind}
 *   https://www.music.yandex.ru/users/{login}/playlists/{kind}/
 *   http://music.yandex.com/users/{login}/playlists/{kind}?anything=1
 *   music.yandex.ru/users/{login}/playlists/{kind}   (scheme optional)
 *   https://music.yandex.ru/playlist/{uuid}          (new-player UUID links)
 *   https://music.yandex.ru/playlists/{uuid}         (new-player alt UUID form)
 */

/** Official Yandex Music web hosts (exact-match, lowercase). */
export const YANDEX_MUSIC_HOSTS: ReadonlySet<string> = new Set([
  "music.yandex.ru",
  "www.music.yandex.ru",
  "music.yandex.com",
  "www.music.yandex.com",
]);

/** Yandex logins: letters, digits, dots, dashes, underscores. */
const LOGIN_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/** UUID of the new-player /playlist/{uuid} links. */
const PLAYLIST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedYandexPlaylistUrl {
  ownerLogin: string | null;
  kind: number | null;
  /** Present when the URL is a new-player UUID link (/playlist/{uuid}). */
  playlistUuid: string | null;
  /** Canonical share URL for metadata/description. */
  normalizedUrl: string;
}

export function parseYandexPlaylistUrl(raw: string): ParsedYandexPlaylistUrl | null {
  if (typeof raw !== "string") return null;
  let url = raw.trim();
  if (!url || url.length > 512) return null;

  // Accept scheme-less pastes; everything else must be an absolute URL.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    if (url.includes("://")) return null; // weird scheme (ftp://, file://, …)
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!YANDEX_MUSIC_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  // No port, no credentials — a real pasted music link never has them.
  if (parsed.port) return null;
  if (parsed.username || parsed.password) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);

  // New-player UUID links: /playlist/{uuid} or /playlists/{uuid} (exactly 2
  // segments; a numeric id in the uuid slot stays REJECTED — see tests).
  if (
    (segments[0] === "playlist" || segments[0] === "playlists") &&
    segments.length === 2
  ) {
    const uuid = segments[1];
    if (!PLAYLIST_UUID_RE.test(uuid)) return null;
    const lower = uuid.toLowerCase();
    return {
      ownerLogin: null,
      kind: null,
      playlistUuid: lower,
      normalizedUrl: `https://music.yandex.ru/playlist/${lower}`,
    };
  }

  // Path must be exactly /users/{login}/playlists/{kind} (trailing slash ok).
  if (segments.length !== 4) return null;
  const [usersSeg, login, playlistsSeg, kindSeg] = segments;
  if (usersSeg !== "users" || playlistsSeg !== "playlists") return null;
  if (!LOGIN_RE.test(login)) return null;
  if (!/^\d{1,10}$/.test(kindSeg)) return null;
  const kind = Number(kindSeg);
  if (!Number.isSafeInteger(kind) || kind <= 0) return null;

  return {
    ownerLogin: login,
    kind,
    playlistUuid: null,
    normalizedUrl: `https://music.yandex.ru/users/${login}/playlists/${kind}`,
  };
}

/** Is this URL a Yandex Music playlist URL? (Used to route the import flow.) */
export function isYandexPlaylistUrl(raw: string): boolean {
  return parseYandexPlaylistUrl(raw) !== null;
}
