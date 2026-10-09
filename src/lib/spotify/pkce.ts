/**
 * Spotify PKCE helpers — Authorization Code + PKCE, no client secret.
 *
 * Reference-verified against (download/v2-research/):
 *  - Spotiamp js/auth.js (working browser PKCE, no server)
 *  - Lumen README («PKCE doesn't need a client secret — don't add one»)
 *  - Official Spotify PKCE guide.
 *
 * Token storage keys are MQ-namespaced in localStorage. The Client ID is
 * public by OAuth design (it is NOT a secret in the PKCE flow); the client
 * SECRET never exists in the browser at all.
 */

const LS = {
  clientId: "mq_spotify_client_id",
  access: "mq_spotify_access_token",
  refresh: "mq_spotify_refresh_token",
  expires: "mq_spotify_token_expires",
  verifier: "mq_spotify_code_verifier",
  state: "mq_spotify_oauth_state",
  product: "mq_spotify_product",
} as const;

export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

/** Scopes: streaming (SDK) + playback state + catalog/library (Web API). */
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-recently-played",
].join(" ");

// ── PKCE primitives (pure, unit-tested) ──────────────────────────────────

/** Random code_verifier charset per RFC 7636 §4.1. */
export function generateCodeVerifier(length = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += chars[random[i] % chars.length];
  return out;
}

/** base64url(SHA256(verifier)) — the S256 code_challenge. */
export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Random OAuth state (cryptographic, 128 bits base64url). Paired with
 *  the verifier as CSRF defense-in-depth per the official PKCE guide. */
export function generateOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(bytes);
}

// ── Redirect URI ──────────────────────────────────────────────────────────

/**
 * The OAuth redirect target: `<origin>/spotify/callback`.
 * Derived from the current origin so local, preview and production hosts all
 * work — but each EXACT URI must be registered in the Spotify Developer
 * Dashboard (owner action; Spotify requires exact match, HTTPS or 127.0.0.1).
 */
export function spotifyRedirectUri(): string {
  if (typeof window === "undefined") return "https://mq1.vercel.app/spotify/callback";
  return `${window.location.origin}/spotify/callback`;
}

// ── Storage (Client ID + tokens) ─────────────────────────────────────────

export function getStoredClientId(): string | null {
  try {
    return localStorage.getItem(LS.clientId);
  } catch {
    return null;
  }
}

export function setStoredClientId(id: string): void {
  try {
    localStorage.setItem(LS.clientId, id.trim());
  } catch {}
}

export function getStoredAccess(): string | null {
  try {
    return localStorage.getItem(LS.access);
  } catch {
    return null;
  }
}

export function getStoredRefresh(): string | null {
  try {
    return localStorage.getItem(LS.refresh);
  } catch {
    return null;
  }
}

export function getStoredExpiry(): number {
  try {
    return Number(localStorage.getItem(LS.expires) || 0);
  } catch {
    return 0;
  }
}

export function getStoredProduct(): string | null {
  try {
    return localStorage.getItem(LS.product);
  } catch {
    return null;
  }
}

export function storeTokens(access: string, expiresInSec: number, refresh?: string | null): void {
  try {
    localStorage.setItem(LS.access, access);
    localStorage.setItem(LS.expires, String(Date.now() + expiresInSec * 1000));
    if (refresh) localStorage.setItem(LS.refresh, refresh);
  } catch {}
}

export function storeProduct(product: string): void {
  try {
    localStorage.setItem(LS.product, product);
  } catch {}
}

export function storeVerifier(verifier: string): void {
  try {
    localStorage.setItem(LS.verifier, verifier);
  } catch {}
}

export function takeVerifier(): string | null {
  try {
    const v = localStorage.getItem(LS.verifier);
    localStorage.removeItem(LS.verifier);
    return v;
  } catch {
    return null;
  }
}

export function storeOAuthState(state: string): void {
  try {
    localStorage.setItem(LS.state, state);
  } catch {}
}

/** Read + drop the stored OAuth state (single-use). */
export function takeOAuthState(): string | null {
  try {
    const s = localStorage.getItem(LS.state);
    localStorage.removeItem(LS.state);
    return s;
  } catch {
    return null;
  }
}

/** Full logout — clears every Spotify key (tokens minted for this client id). */
export function clearAllSpotifyStorage(): void {
  try {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/** True when a stored access token is still valid (with a 30s safety margin). */
export function storedAccessIsValid(now = Date.now()): boolean {
  const token = getStoredAccess();
  const expires = getStoredExpiry();
  return !!token && now < expires - 30_000;
}
