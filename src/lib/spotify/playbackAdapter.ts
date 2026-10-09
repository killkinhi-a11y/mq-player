/**
 * SpotifyPlaybackAdapter — official Web Playback SDK wrapper (§13).
 *
 * Architecture (research-verified, download/v2-research/RESEARCH-REPORT.md):
 *   MQ PlayerController → this adapter → Spotify Web Playback SDK
 *   The SDK streams DRM-protected full tracks through its own sandboxed
 *   decoder — it never exposes raw PCM or a stream URL (Spotiamp README,
 *   Kopuz host.rs). MQ's UI drives playback through the control surface
 *   below and renders its own visual layer from the state snapshots.
 *
 * API: connect / disconnect / play / pause / resume / seek / next /
 *      previous / setVolume / setShuffle / setRepeat / getState.
 * Events: onReady / onState / onEnded / onError.
 *
 * Reference implementations: Spotiamp js/player.js (web, PKCE + SDK),
 * Kopuz crates/server/src/spotify/host.rs (desktop → browser SDK bridge),
 * official spotify-web-playback-sdk-example.
 */

import { spotifyAuth } from "./auth";
import type {
  SpotifyAdapterError,
  SpotifyAdapterErrorKind,
  SpotifyPlayerStateSnapshot,
} from "./types";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const API_BASE = "https://api.spotify.com/v1";

type SdkPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (payload: never) => void) => boolean;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  activateElement: () => Promise<void>;
  getCurrentState: () => SpotifySdkState | null;
};

type SpotifySdkState = {
  paused: boolean;
  position: number; // ms
  duration: number; // ms
  track_window?: {
    current_track?: {
      uri?: string;
      id?: string;
      name?: string;
      artists?: { name?: string }[];
      album?: { name?: string; images?: { url: string }[] };
    };
  };
};

type StateListener = (s: SpotifyPlayerStateSnapshot) => void;
type ErrorListener = (e: SpotifyAdapterError) => void;
type VoidListener = () => void;

/** Desktop Chromium/Firefox/Edge have the EME/Widevine the SDK needs. */
export function isSpotifyPlaybackBrowserSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Mobile browsers are not supported by the Web Playback SDK (official docs).
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|ARM/;
  if (isMobile.test(ua)) return false;
  // Safari (desktop) is not supported by the SDK.
  if (/^((?!chrome|android|crios|edg|fxios).)*safari/i.test(ua)) return false;
  // EME must exist for the DRM pipeline.
  if (!navigator.requestMediaKeySystemAccess) return false;
  return true;
}

class SpotifyPlaybackAdapter {
  private player: SdkPlayer | null = null;
  private deviceId: string | null = null;
  private sdkLoading: Promise<SdkPlayer> | null = null;
  private stateListeners = new Set<StateListener>();
  private errorListeners = new Set<ErrorListener>();
  private endedListeners = new Set<VoidListener>();
  private readyListeners = new Set<(deviceId: string) => void>();

  /** Last SDK state (raw) + interpolated clock anchors. */
  private lastState: SpotifySdkState | null = null;
  private lastStateAt = 0; // performance.now() when lastState arrived
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private lastError: SpotifyAdapterError | null = null;
  /** Session-level downgrade: after a hard SDK/DRM failure, stop offering
   *  official playback until the next connect (honest, prevents loops). */
  private sessionDisabled = false;
  private endedFiredFor: string | null = null;
  /** Monotonic play-command sequence — rapid A→B→C: only the LAST user
   *  choice may own the device (PHASE 11: no parallel play commands). */
  private playSeq = 0;

  // ── Availability (§16 priority gate) ───────────────────────────────────

  /**
   * True when official Spotify playback can be attempted:
   * connected (refresh token) + Premium + supported desktop browser +
   * not session-disabled. Refreshes /me when the product tier is unknown.
   */
  async isOfficialAvailable(): Promise<boolean> {
    if (this.sessionDisabled) return false;
    if (!isSpotifyPlaybackBrowserSupported()) return false;
    const status = spotifyAuth.getStatus();
    if (!status.connected) return false;
    if (!status.premium) {
      // Product tier may be stale (login on another device) — re-check once.
      const me = await spotifyAuth.fetchMe();
      if (!me || me.product !== "premium") return false;
    }
    return true;
  }

  get isActive(): boolean {
    return !!this.player && !!this.deviceId;
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  // ── SDK lifecycle ──────────────────────────────────────────────────────

  private loadSdk(): Promise<SdkPlayer> {
    if (this.player) return Promise.resolve(this.player);
    if (this.sdkLoading) return this.sdkLoading;

    this.sdkLoading = new Promise<SdkPlayer>((resolve, reject) => {
      const w = window as unknown as {
        Spotify?: { Player: new (opts: object) => SdkPlayer };
        onSpotifyWebPlaybackSDKReady?: () => void;
      };
      if (w.Spotify?.Player) {
        this.createPlayer(w.Spotify.Player, resolve, reject);
        return;
      }
      w.onSpotifyWebPlaybackSDKReady = () => {
        if (w.Spotify?.Player) this.createPlayer(w.Spotify.Player, resolve, reject);
        else reject(new Error("SDK_LOADED_NO_PLAYER"));
      };
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => reject(new Error("SDK_SCRIPT_LOAD_FAILED"));
      document.body.appendChild(script);
    });
    return this.sdkLoading;
  }

  private createPlayer(
    PlayerCtor: new (opts: object) => SdkPlayer,
    resolve: (p: SdkPlayer) => void,
    reject: (e: Error) => void,
  ): void {
    const player = new PlayerCtor({
      name: "MQ Player",
      volume: 0.8,
      getOAuthToken: async (cb: (token: string) => void) => {
        const token = await spotifyAuth.getValidToken();
        if (token) cb(token);
        else this.emitError("auth", "Spotify: сессия истекла — требуется повторный вход");
      },
    });

    player.addListener("ready", ((payload: { device_id: string }) => {
      this.deviceId = payload.device_id;
      this.lastError = null;
      this.startPolling();
      this.readyListeners.forEach((fn) => {
        try {
          fn(payload.device_id);
        } catch {}
      });
      resolve(player);
    }) as never);

    player.addListener("not_ready", (() => {
      // Device went offline (tab suspended, network) — stay honest.
      this.emitError("network", "Spotify: устройство ушло в офлайн");
    }) as never);

    player.addListener("player_state_changed", ((state: SpotifySdkState | null) => {
      if (state) this.applyState(state);
    }) as never);

    player.addListener("initialization_error", ((e: { message: string }) => {
      this.sessionDisabled = true;
      this.emitError("init", `Spotify SDK: ${e.message}`);
    }) as never);

    player.addListener("authentication_error", ((e: { message: string }) => {
      this.emitError("auth", `Spotify: ошибка авторизации (${e.message})`);
    }) as never);

    player.addListener("account_error", (() => {
      // Free account — the SDK refuses to stream. Official behaviour.
      this.sessionDisabled = true;
      this.emitError("account", "Spotify Premium требуется для официального воспроизведения");
    }) as never);

    player.addListener("playback_error", ((e: { message: string }) => {
      this.emitError("playback", `Spotify: ошибка воспроизведения (${e.message})`);
    }) as never);

    player.addListener("autoplay_failed", (async () => {
      // Autoplay policy — retry through the SDK's activation path once.
      try {
        await player.activateElement();
      } catch {}
    }) as never);

    player.connect().then((ok) => {
      if (!ok) reject(new Error("SDK_CONNECT_FALSE"));
    }).catch(reject);

    this.player = player;
  }

  /** Connect (idempotent). Resolves when the Connect device is ready. */
  async connect(): Promise<boolean> {
    if (this.isActive) return true;
    try {
      const token = await spotifyAuth.getValidToken();
      if (!token) return false;
      await this.loadSdk();
      // ready listener resolves loadSdk — isActive becomes true there.
      return this.isActive;
    } catch (e) {
      this.sessionDisabled = true;
      this.emitError("init", `Spotify SDK не загрузился (${e instanceof Error ? e.message : "?"})`);
      return false;
    }
  }

  disconnect(): void {
    this.stopPolling();
    try {
      this.player?.disconnect();
    } catch {}
    this.player = null;
    this.deviceId = null;
    this.lastState = null;
    this.sdkLoading = null;
  }

  /** Full reset on logout. */
  resetSession(): void {
    this.sessionDisabled = false;
    this.lastError = null;
    this.endedFiredFor = null;
    this.disconnect();
  }

  /** Public §3 lifecycle extras. activate(): unlock the audio pipeline after
   *  a browser autoplay policy block (wraps SDK activateElement — the same
   *  path the autoplay_failed listener uses internally). */
  async activate(): Promise<boolean> {
    try {
      await this.player?.activateElement();
      return true;
    } catch {
      return false;
    }
  }

  /** destroy(): full teardown — SDK disconnect + every listener dropped.
   *  The singleton stays reusable (connect() boots a fresh device). */
  destroy(): void {
    this.disconnect();
    this.stateListeners.clear();
    this.errorListeners.clear();
    this.endedListeners.clear();
    this.readyListeners.clear();
    this.sessionDisabled = false;
    this.lastError = null;
    this.endedFiredFor = null;
  }

  /** Transfer the user's active playback to THIS browser's Connect device
   *  (official `PUT /me/player` with device_ids). Used when the session
   *  reports another device owns playback. */
  async transferPlaybackHere(opts: { play?: boolean } = {}): Promise<boolean> {
    if (!(await this.connect()) || !this.deviceId) return false;
    try {
      const res = await this.api("/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [this.deviceId], play: !!opts.play }),
      });
      return res.status === 202 || res.status === 204;
    } catch {
      return false;
    }
  }

  /** Explicit §3 alias for onState (SDK player_state_changed subscription). */
  subscribeToPlayerState(fn: StateListener): () => void {
    return this.onState(fn);
  }

  // ── Web API helper ─────────────────────────────────────────────────────

  private async api(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await spotifyAuth.getValidToken();
    if (!token) throw new Error("NO_TOKEN");
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  }

  // ── §13 control surface ────────────────────────────────────────────────

  /** Start a full track on THIS browser's Connect device.
   *  Serialized: each call bumps playSeq — a superseded command (the user
   *  picked another track meanwhile) reports `false` WITHOUT touching the
   *  session error state, so a stale 4xx can never block the fresh choice. */
  async play(
    uri: string,
    opts: { positionSec?: number; volumePercent?: number } = {},
  ): Promise<boolean> {
    const seq = ++this.playSeq;
    if (!(await this.connect())) return false;
    if (!this.deviceId) return false;

    this.endedFiredFor = null;
    if (typeof opts.volumePercent === "number") {
      try {
        await this.player?.setVolume(Math.min(1, Math.max(0, opts.volumePercent / 100)));
      } catch {}
    }

    const body: { uris: string[]; position_ms?: number } = { uris: [uri] };
    if (opts.positionSec && opts.positionSec > 2) {
      body.position_ms = Math.round(opts.positionSec * 1000);
    }
    try {
      const res = await this.api(`/me/player/play?device_id=${this.deviceId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      // A newer play() superseded this command — its result owns the device.
      if (seq !== this.playSeq) return false;
      if (res.status === 202 || res.status === 204) return true;
      if (res.status === 404) {
        // Device not found (went offline) — one reconnect attempt.
        this.disconnect();
        if (!(await this.connect()) || !this.deviceId) return false;
        const retry = await this.api(`/me/player/play?device_id=${this.deviceId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (seq !== this.playSeq) return false;
        return retry.status === 202 || retry.status === 204;
      }
      if (res.status === 403) {
        // Premium required / forbidden (e.g. unknown market).
        this.sessionDisabled = true;
        this.emitError("account", "Spotify: воспроизведение недоступно для этого аккаунта");
        return false;
      }
      if (res.status === 401) {
        this.emitError("auth", "Spotify: сессия истекла — переподключите аккаунт");
        return false;
      }
      this.emitError("playback", `Spotify: API вернул ${res.status}`);
      return false;
    } catch (e) {
      if (seq !== this.playSeq) return false;
      this.emitError("network", `Spotify: сеть (${e instanceof Error ? e.message : "?"})`);
      return false;
    }
  }

  async pause(): Promise<void> {
    try {
      await this.player?.pause();
    } catch {}
  }

  async resume(): Promise<void> {
    try {
      await this.player?.resume();
    } catch {}
  }

  async seek(sec: number): Promise<void> {
    try {
      await this.player?.seek(Math.max(0, Math.round(sec * 1000)));
    } catch {}
  }

  async next(): Promise<void> {
    try {
      await this.player?.nextTrack();
    } catch {}
  }

  async previous(): Promise<void> {
    try {
      await this.player?.previousTrack();
    } catch {}
  }

  async setVolume(percent: number): Promise<void> {
    try {
      await this.player?.setVolume(Math.min(1, Math.max(0, percent / 100)));
    } catch {}
  }

  async setShuffle(state: boolean): Promise<void> {
    if (!this.deviceId) return;
    try {
      await this.api(`/me/player/shuffle?state=${state}&device_id=${this.deviceId}`, { method: "PUT" });
    } catch {}
  }

  async setRepeat(mode: "off" | "context" | "track"): Promise<void> {
    if (!this.deviceId) return;
    try {
      await this.api(`/me/player/repeat?state=${mode}&device_id=${this.deviceId}`, { method: "PUT" });
    } catch {}
  }

  getState(): SpotifyPlayerStateSnapshot | null {
    if (!this.lastState) return null;
    return this.snapshotFrom(this.lastState, this.interpolatedPositionSec());
  }

  // ── Position clock (interpolated between state events — RAF-smooth) ────

  private interpolatedPositionSec(): number {
    if (!this.lastState) return 0;
    const base = this.lastState.position / 1000;
    if (this.lastState.paused) return base;
    const elapsed = (performance.now() - this.lastStateAt) / 1000;
    const dur = this.lastState.duration / 1000;
    return Math.min(dur, base + elapsed);
  }

  getPositionSec(): number {
    return this.interpolatedPositionSec();
  }

  getDurationSec(): number {
    return this.lastState ? this.lastState.duration / 1000 : 0;
  }

  get isPlaying(): boolean {
    return !!this.lastState && !this.lastState.paused;
  }

  // ── State pipeline ─────────────────────────────────────────────────────

  private applyState(state: SpotifySdkState): void {
    const prev = this.lastState;
    this.lastState = state;
    this.lastStateAt = performance.now();

    const uri = state.track_window?.current_track?.uri || null;

    // ── End-of-track heuristics (Kopuz: SDK reports paused@0 after the
    // track window ends; some browsers never deliver that final event, so
    // a near-end playing position also counts) ──
    const posSec = state.position / 1000;
    const durSec = state.duration / 1000;
    const prevNearEnd =
      prev && !prev.paused && prev.duration > 10_000 && prev.position > prev.duration - 4000;
    const endedByPause = prevNearEnd && state.paused && state.position < 1500;
    const endedByNearEnd = !state.paused && durSec > 0 && posSec >= durSec - 1.2;
    if ((endedByPause || endedByNearEnd) && this.endedFiredFor !== uri) {
      this.endedFiredFor = uri;
      this.fireEnded();
    }

    this.stateListeners.forEach((fn) => {
      try {
        fn(this.snapshotFrom(state, this.interpolatedPositionSec()));
      } catch {}
    });
  }

  private snapshotFrom(
    state: SpotifySdkState,
    positionSec: number,
  ): SpotifyPlayerStateSnapshot {
    const t = state.track_window?.current_track;
    return {
      paused: state.paused,
      positionSec,
      durationSec: state.duration ? state.duration / 1000 : 0,
      trackUri: t?.uri || null,
      trackId: t?.id || null,
      title: t?.name || null,
      artist: (t?.artists || []).map((a) => a.name).filter(Boolean).join(", ") || null,
      albumName: t?.album?.name || null,
      artworkUrl: t?.album?.images?.[0]?.url || null,
    };
  }

  /** SDK state events are change-driven; poll at 1Hz to keep the position
   *  clock fresh and feed end-of-track detection (applyState). */
  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      try {
        const s = this.player?.getCurrentState();
        if (s) this.applyState(s);
      } catch {}
    }, 1000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private fireEnded(): void {
    this.endedListeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  private emitError(kind: SpotifyAdapterErrorKind, message: string): void {
    this.lastError = { kind, message, at: Date.now() };
    this.errorListeners.forEach((fn) => {
      try {
        fn(this.lastError!);
      } catch {}
    });
  }

  getLastError(): SpotifyAdapterError | null {
    return this.lastError;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onEnded(fn: VoidListener): () => void {
    this.endedListeners.add(fn);
    return () => this.endedListeners.delete(fn);
  }

  onError(fn: ErrorListener): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  onReady(fn: (deviceId: string) => void): () => void {
    this.readyListeners.add(fn);
    return () => this.readyListeners.delete(fn);
  }
}

/** Singleton — one Connect device per browser tab. */
export const spotifyPlaybackAdapter = new SpotifyPlaybackAdapter();
