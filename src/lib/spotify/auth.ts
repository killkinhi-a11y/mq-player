/**
 * SpotifyAuth — Authorization Code + PKCE session manager (browser only).
 *
 * Official flow, no client secret (research §9: «Если secret вообще не нужен
 * при PKCE — не создавать его»). The Client ID comes from MQ's public config
 * endpoint (`/api/spotify/config`) — it reads the server-side env var and
 * returns ONLY the public ID; the SECRET never leaves the server.
 *
 * Token exchange happens browser → accounts.spotify.com directly (CORS is
 * officially supported; proven by Spotiamp/Lumen reference implementations).
 */

import {
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_URL,
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateOAuthState,
  getStoredAccess,
  getStoredClientId,
  getStoredProduct,
  getStoredRefresh,
  spotifyRedirectUri,
  storeOAuthState,
  storeProduct,
  storeTokens,
  storeVerifier,
  storedAccessIsValid,
  takeOAuthState,
  takeVerifier,
  setStoredClientId,
  clearAllSpotifyStorage,
} from "./pkce";
import type { SpotifySessionStatus, SpotifyUserInfo } from "./types";

type Listener = (status: SpotifySessionStatus) => void;

class SpotifyAuthManager {
  private configClientId: string | null = null;
  private configLoaded = false;
  private user: SpotifyUserInfo | null = null;
  private refreshInFlight: Promise<string | null> | null = null;
  private listeners = new Set<Listener>();

  // ── Config (public Client ID) ──────────────────────────────────────────

  /** Load the public Client ID from MQ's server env (cached in memory). */
  async loadConfig(): Promise<string | null> {
    if (this.configLoaded) return this.configClientId;
    try {
      const res = await fetch("/api/spotify/config", { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        this.configClientId = data?.clientId || null;
        if (this.configClientId && !getStoredClientId()) {
          setStoredClientId(this.configClientId);
        }
      }
    } catch {
      // Network hiccup — stay unconfigured; UI shows honest state.
    }
    this.configLoaded = true;
    return this.configClientId;
  }

  getClientId(): string | null {
    return this.configClientId || getStoredClientId();
  }

  // ── Status ─────────────────────────────────────────────────────────────

  getStatus(): SpotifySessionStatus {
    return {
      configured: !!this.getClientId(),
      connected: !!getStoredRefresh(),
      premium: getStoredProduct() === "premium",
      user: this.user,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const status = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch {}
    });
  }

  // ── OAuth ──────────────────────────────────────────────────────────────

  /** Begin the OAuth redirect (PKCE S256 + single-use state). Caller: user gesture. */
  async beginLogin(): Promise<void> {
    const clientId = (await this.loadConfig()) || getStoredClientId();
    if (!clientId) throw new Error("SPOTIFY_NOT_CONFIGURED");

    const verifier = generateCodeVerifier(64);
    storeVerifier(verifier);
    const state = generateOAuthState();
    storeOAuthState(state);
    const challenge = await codeChallengeFromVerifier(verifier);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: spotifyRedirectUri(),
      scope: SPOTIFY_SCOPES,
      state,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    window.location.href = `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Exchange ?code= for tokens (called by /spotify/callback page).
   *  `state` from the redirect is validated against the single-use stored
   *  value — a mismatch (or missing) state is rejected BEFORE any token
   *  exchange is attempted. */
  async handleCallback(code: string, state?: string | null): Promise<{ ok: boolean; error?: string }> {
    const clientId = this.getClientId();
    const expectedState = takeOAuthState();
    const verifier = takeVerifier();
    if (!clientId || !verifier) return { ok: false, error: "PKCE_STATE_LOST" };
    if (!state || !expectedState || state !== expectedState) {
      return { ok: false, error: "OAUTH_STATE_MISMATCH" };
    }

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
      code_verifier: verifier,
    });
    try {
      const res = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = await res.json();
      if (!res.ok || !json.access_token) {
        return { ok: false, error: json?.error_description || json?.error || `HTTP ${res.status}` };
      }
      storeTokens(json.access_token, json.expires_in ?? 3600, json.refresh_token);
      // Fetch /me right away so the premium flag is known before redirect.
      await this.fetchMe();
      this.notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "NETWORK" };
    }
  }

  /** Valid access token (auto-refresh when expired). Null when logged out. */
  async getValidToken(): Promise<string | null> {
    if (storedAccessIsValid()) return getStoredAccess();
    if (!getStoredRefresh()) return null;
    return this.refresh();
  }

  private refresh(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const clientId = this.getClientId();
    const refreshToken = getStoredRefresh();
    if (!clientId || !refreshToken) return Promise.resolve(null);

    this.refreshInFlight = (async () => {
      try {
        const body = new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        });
        const res = await fetch(SPOTIFY_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const json = await res.json();
        if (res.ok && json.access_token) {
          storeTokens(json.access_token, json.expires_in ?? 3600, json.refresh_token || refreshToken);
          return json.access_token as string;
        }
        // Refresh rejected (revoked/expired) → honest logout.
        if (res.status === 400 || res.status === 401) {
          this.logout(false);
        }
        return null;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  // ── /me (product detection: premium gating, §28) ───────────────────────

  async fetchMe(): Promise<SpotifyUserInfo | null> {
    const token = await this.getValidToken();
    if (!token) return null;
    try {
      const res = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const me = await res.json();
      this.user = {
        id: me.id,
        displayName: me.display_name || me.id,
        email: me.email ?? null,
        product: me.product || "unknown",
        country: me.country,
        images: me.images,
      };
      storeProduct(this.user.product);
      this.notify();
      return this.user;
    } catch {
      return null;
    }
  }

  logout(notify = true): void {
    clearAllSpotifyStorage();
    this.user = null;
    if (notify) this.notify();
  }
}

/** Singleton — one session per browser tab group. */
export const spotifyAuth = new SpotifyAuthManager();
