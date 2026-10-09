/**
 * Spotify Official Playback — THE NO-SUBSTITUTION CONTRACT (spec 2026-10-09).
 *
 * These tests pin the core acceptance criterion of the official-playback
 * spec §8: a SPOTIFY track (real Spotify identity — catalogProvider
 * "spotify" + spotifyUri) is ONLY ever played through the official Web
 * Playback SDK. Unavailability opens an honest gate; the track is never
 * handed to the SoundCloud/Audius resolver.
 *
 * Also covers: OAuth state validation, retry semantics, queue identity
 * preservation, and the store gate actions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  decideSpotifyPlayback,
  isSpotifyOfficialTrack,
  spotifyGateCopy,
} from "@/lib/spotify/gate";
import { generateOAuthState, base64UrlEncode } from "@/lib/spotify/pkce";

/* ────────────────────────────────────────────────────────────────────────
 * 1. Pure gate decision — every branch, deterministic order.
 * ──────────────────────────────────────────────────────────────────────── */

describe("decideSpotifyPlayback — the honest gate", () => {
  it("plays officially when connected + Premium + supported browser", () => {
    expect(
      decideSpotifyPlayback({
        isSpotifyTrack: true,
        connected: true,
        premium: true,
        playbackSupported: true,
      }),
    ).toEqual({ action: "play-official" });
  });

  it("not connected → gate(not_connected) — «Connect Spotify to play full tracks»", () => {
    const d = decideSpotifyPlayback({
      isSpotifyTrack: true,
      connected: false,
      premium: true,
      playbackSupported: true,
    });
    expect(d).toEqual({ action: "gate", reason: "not_connected" });
  });

  it("connected but Free → gate(not_premium) — Premium required (Developer Policy §IV)", () => {
    const d = decideSpotifyPlayback({
      isSpotifyTrack: true,
      connected: true,
      premium: false,
      playbackSupported: true,
    });
    expect(d).toEqual({ action: "gate", reason: "not_premium" });
  });

  it("connected + Premium but Safari/mobile → gate(unsupported_browser)", () => {
    const d = decideSpotifyPlayback({
      isSpotifyTrack: true,
      connected: true,
      premium: true,
      playbackSupported: false,
    });
    expect(d).toEqual({ action: "gate", reason: "unsupported_browser" });
  });

  it("premium outranks browser: connected Free on unsupported browser gates on PREMIUM first", () => {
    const d = decideSpotifyPlayback({
      isSpotifyTrack: true,
      connected: true,
      premium: false,
      playbackSupported: false,
    });
    expect(d).toEqual({ action: "gate", reason: "not_premium" });
  });

  it("not-connected outranks everything (even Free + Safari)", () => {
    const d = decideSpotifyPlayback({
      isSpotifyTrack: true,
      connected: false,
      premium: false,
      playbackSupported: false,
    });
    expect(d).toEqual({ action: "gate", reason: "not_connected" });
  });

  it("non-Spotify input never gates (caller owns that path)", () => {
    expect(
      decideSpotifyPlayback({
        isSpotifyTrack: false,
        connected: false,
        premium: false,
        playbackSupported: false,
      }),
    ).toEqual({ action: "play-official" });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 2. Track classification — what is (and is NOT) a Spotify-official track.
 * ──────────────────────────────────────────────────────────────────────── */

describe("isSpotifyOfficialTrack — substitution scope", () => {
  it("a Spotify catalog track with its real URI is official-only", () => {
    expect(
      isSpotifyOfficialTrack({
        catalogProvider: "spotify",
        spotifyUri: "spotify:track:4uLU6hMCjRPg2dcdP6M6f6",
      }),
    ).toBe(true);
  });

  it("a Deezer catalog track (anonymous fallback, no spotifyUri) is NOT gated — its own resolver path", () => {
    expect(
      isSpotifyOfficialTrack({ catalogProvider: "deezer" }),
    ).toBe(false);
  });

  it("a Spotify track that somehow lost its URI is not routed as official (no silent playback of something else)", () => {
    expect(
      isSpotifyOfficialTrack({ catalogProvider: "spotify" }),
    ).toBe(false);
  });

  it("native SoundCloud/Audius tracks are never gated", () => {
    expect(isSpotifyOfficialTrack({ catalogProvider: undefined })).toBe(false);
    expect(isSpotifyOfficialTrack({ catalogProvider: "deezer", spotifyUri: "spotify:track:x" })).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 3. Honest gate copy — the exact user-facing messages (§7).
 * ──────────────────────────────────────────────────────────────────────── */

describe("spotifyGateCopy — honest user-facing states", () => {
  it("not_connected asks to connect and mentions the official SDK, not previews", () => {
    const c = spotifyGateCopy("not_connected");
    expect(c.title).toContain("Spotify");
    expect(c.primaryAction).toBe("connect");
    expect(c.message).not.toMatch(/soundcloud|audius|deezer/i);
  });

  it("not_premium states the Premium requirement (no preview masking)", () => {
    const c = spotifyGateCopy("not_premium");
    expect(c.title).toMatch(/premium/i);
    expect(c.message).not.toMatch(/превью|preview/i);
  });

  it("unsupported_browser names the supported desktop browsers", () => {
    const c = spotifyGateCopy("unsupported_browser");
    expect(c.message).toMatch(/Chrome/i);
    expect(c.message).toMatch(/Firefox/i);
  });

  it("sdk_error carries the adapter's message when provided", () => {
    const c = spotifyGateCopy("sdk_error", "Spotify: DRM failure");
    expect(c.title).toMatch(/недоступно|недоступн/i);
    expect(c.message).toContain("DRM failure");
    expect(c.primaryAction).toBe("retry");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 4. OAuth state validation (§PHASE 1) — single-use state.
 * ──────────────────────────────────────────────────────────────────────── */

describe("OAuth state (PKCE defense-in-depth)", () => {
  it("generateOAuthState is URL-safe, 22-24 chars (128 bits base64url) and unguessable", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22,24}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22,24}$/);
    expect(a).not.toBe(b);
  });

  it("base64UrlEncode produces the S7636-safe alphabet", () => {
    const enc = base64UrlEncode(new TextEncoder().encode("héllo wörld"));
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("handleCallback rejects a state mismatch BEFORE any token exchange", async () => {
    vi.resetModules();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { spotifyAuth } = await import("@/lib/spotify/auth");
    // Session initiated elsewhere: verifier + state stored.
    storage.set("mq_spotify_code_verifier", "v".repeat(64));
    storage.set("mq_spotify_oauth_state", "the-right-state");
    storage.set("mq_spotify_client_id", "cid");

    const bad = await spotifyAuth.handleCallback("auth-code", "wrong-state");
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("OAUTH_STATE_MISMATCH");
    // CRITICAL: no token request was ever sent.
    expect(fetchMock).not.toHaveBeenCalled();
    // Single-use: the stored state was consumed.
    expect(storage.has("mq_spotify_oauth_state")).toBe(false);

    vi.unstubAllGlobals();
  });

  it("handleCallback with the correct state proceeds to the token exchange", async () => {
    vi.resetModules();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { spotifyAuth } = await import("@/lib/spotify/auth");
    storage.set("mq_spotify_code_verifier", "v".repeat(64));
    storage.set("mq_spotify_oauth_state", "s1");
    storage.set("mq_spotify_client_id", "cid");

    const ok = await spotifyAuth.handleCallback("auth-code", "s1");
    expect(ok.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://accounts.spotify.com/api/token",
      expect.objectContaining({ method: "POST" }),
    );

    vi.unstubAllGlobals();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 5. Source contract — the engine routes Spotify tracks to the SDK ONLY.
 *    (Static contract test: the loadTrack source contains no resolver call
 *    inside the official-only branch — regression guard for §8.)
 * ──────────────────────────────────────────────────────────────────────── */

describe("engine source contract (§8 no-substitution)", () => {
  const engineSrc = () => readFileSync("src/components/mq/useAudioEngine.ts", "utf8");

  it("the official-only branch returns before any resolver call (no fall-through)", () => {
    const src = engineSrc();
    const officialStart = src.indexOf("SPOTIFY OFFICIAL PATH (no substitution, ever)");
    const officialEnd = src.indexOf("DEEZER CATALOG PATH");
    expect(officialStart).toBeGreaterThan(-1);
    expect(officialEnd).toBeGreaterThan(officialStart);
    const officialBlock = src.slice(officialStart, officialEnd);
    // The official branch must terminate every failure with a gate + return,
    // never continue into resolveCatalogTrack.
    expect(officialBlock).not.toContain("resolveCatalogTrack");
    expect(officialBlock).toContain('decision.action === "gate"');
    expect(officialBlock).toContain('openSpotifyGate');
  });

  it("the mid-play error handler opens the gate instead of the resolver", () => {
    const src = engineSrc();
    const handlerStart = src.indexOf("Only mid-play failures land here");
    const handlerEnd = src.indexOf("return () => { offState(); offEnded(); offError(); };");
    expect(handlerStart).toBeGreaterThan(-1);
    const block = src.slice(handlerStart, handlerEnd);
    expect(block).not.toContain("forceSpotifyFallback");
    expect(block).not.toContain("resolveCatalogTrack");
    expect(block).toContain('reason: "sdk_error"');
  });

  it("queue persistence keeps the Spotify identity fields", () => {
    const storeSrc = readFileSync("src/store/useAppStore.ts", "utf8");
    expect(storeSrc).toContain("spotifyUri: t.spotifyUri");
    expect(storeSrc).toContain("spotifyTrackId: t.spotifyTrackId");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 6. Store gate actions — honest stop + retry nonce.
 * ──────────────────────────────────────────────────────────────────────── */

describe("store gate actions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function freshStore() {
    vi.doMock("@/lib/audioEngine", () => ({
      getAudioElement: () => ({}),
      getInactiveAudio: () => null,
      resumeAudioContext: () => {},
      enableEQ: () => {}, disableEQ: () => {}, setEQBand: () => {},
      setAllEQBands: () => {}, resetEQBands: () => {}, setAudioPlaybackRate: () => {},
      setCrossfadeEnabled: () => {},
    }));
    const { useAppStore } = await import("@/store/useAppStore");
    return useAppStore;
  }

  it("openSpotifyGate stops playback honestly (isPlaying false, no buffering)", async () => {
    const store = await freshStore();
    store.setState({ isPlaying: true, playbackState: "playing", isBuffering: true });
    store.getState().openSpotifyGate({
      reason: "not_premium",
      trackId: "sp_1",
      trackTitle: "Song",
      trackArtist: "Artist",
      spotifyUri: "spotify:track:1",
    });
    const s = store.getState();
    expect(s.spotifyGate?.reason).toBe("not_premium");
    expect(s.isPlaying).toBe(false);
    expect(s.isBuffering).toBe(false);
    expect(s.catalogResolving).toBe(false);
  });

  it("retrySpotifyPlayback bumps the nonce so the engine re-attempts the OFFICIAL path", async () => {
    const store = await freshStore();
    store.getState().openSpotifyGate({ reason: "sdk_error", trackId: "t1" });
    const before = store.getState().spotifyRetryNonce;
    store.getState().retrySpotifyPlayback();
    const s = store.getState();
    expect(s.spotifyRetryNonce).toBe(before + 1);
    expect(s.spotifyGate).toBeNull();
    expect(s.isPlaying).toBe(true);
    expect(s.playbackState).toBe("loading");
  });

  it("dismissSpotifyGate only closes the sheet", async () => {
    const store = await freshStore();
    store.getState().openSpotifyGate({ reason: "not_connected", trackId: "t1" });
    store.getState().dismissSpotifyGate();
    expect(store.getState().spotifyGate).toBeNull();
  });

  it("openSpotifyGate drops the spotify mode — the Official badge cannot claim playback while stopped", async () => {
    const store = await freshStore();
    store.setState({ playbackMode: "spotify", isPlaying: true, playbackState: "playing" });
    store.getState().openSpotifyGate({ reason: "sdk_error", trackId: "t1" });
    const s = store.getState();
    expect(s.playbackMode).toBe("idle");
    expect(s.isPlaying).toBe(false);
    expect(s.playbackState).toBe("error");
  });

  it("openSpotifyGate pauses the SDK device — no residual official audio under the gate", async () => {
    const store = await freshStore();
    const { spotifyPlaybackAdapter } = await import("@/lib/spotify/playbackAdapter");
    const pauseSpy = vi.spyOn(spotifyPlaybackAdapter, "pause");
    store.getState().openSpotifyGate({ reason: "sdk_error", trackId: "t1" });
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    pauseSpy.mockRestore();
  });

  it("togglePlay on a STOPPED official-only track re-attempts the official path (not a dead element resume)", async () => {
    const store = await freshStore();
    const officialTrack = {
      id: "sp_official_1", title: "Song", artist: "Artist", duration: 200,
      source: "spotify", catalogId: "cat1",
      catalogProvider: "spotify", spotifyUri: "spotify:track:abc",
    } as any;
    store.setState({
      currentTrack: officialTrack,
      isPlaying: false,
      playbackState: "error",
      playbackMode: "idle",
      spotifyGate: null,
    });
    const before = store.getState().spotifyRetryNonce;
    store.getState().togglePlay();
    const s = store.getState();
    expect(s.spotifyRetryNonce).toBe(before + 1);
    expect(s.isPlaying).toBe(true);
    expect(s.playbackState).toBe("loading");
  });

  it("togglePlay on a PAUSED official track (mode spotify) keeps the normal SDK resume", async () => {
    const store = await freshStore();
    const officialTrack = {
      id: "sp_official_1", title: "Song", artist: "Artist", duration: 200,
      source: "spotify", catalogId: "cat1",
      catalogProvider: "spotify", spotifyUri: "spotify:track:abc",
    } as any;
    store.setState({
      currentTrack: officialTrack,
      isPlaying: false,
      playbackState: "paused",
      playbackMode: "spotify",
    });
    const before = store.getState().spotifyRetryNonce;
    store.getState().togglePlay();
    const s = store.getState();
    // Normal toggle: no re-attempt, just the isPlaying flip the transport
    // effect turns into adapter.resume().
    expect(s.spotifyRetryNonce).toBe(before);
    expect(s.isPlaying).toBe(true);
  });

  it("togglePlay on a Deezer-catalog track (no spotifyUri) keeps the normal element resume", async () => {
    const store = await freshStore();
    const deezerTrack = {
      id: "dz_1", title: "Song", artist: "Artist", duration: 200,
      source: "spotify", catalogId: "dz_cat1",
      catalogProvider: "deezer",
    } as any;
    store.setState({
      currentTrack: deezerTrack,
      isPlaying: false,
      playbackState: "paused",
      playbackMode: "idle",
    });
    const before = store.getState().spotifyRetryNonce;
    store.getState().togglePlay();
    const s = store.getState();
    expect(s.spotifyRetryNonce).toBe(before);
    expect(s.isPlaying).toBe(true);
  });
});
