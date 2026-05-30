/**
 * PlaybackEngine — Persistent Singleton Playback State Machine
 *
 * Wraps audioEngine.ts into a playback state machine that survives
 * component remounts, route changes, and UI rerenders.
 * Zero React dependencies — emits typed events only.
 */

import type { Track } from "@/lib/musicApi";
import {
  getAudioElement, getInactiveAudio, initAudioEngine, resumeAudioContext,
  resetCorsState, crossfadeTo, cancelCrossfade, crossfadeToGapless,
  preloadTrack as audioEnginePreloadTrack, clearGaplessPreload,
  getGaplessPreloadedTrackId, isGaplessEnabled, setGaplessPreloadedTrackId,
  onAudioElementReplaced, isCrossfadeEnabled,
} from "@/lib/audioEngine";
import {
  resolveSoundCloudStream, buildEmeHlsConfig, prepareEncryptedElement,
  ensureWebAudioConnected, createManifestInterceptor, shouldProxyUrl,
  type StreamResult,
} from "@/lib/streamResolver";
import Hls from "hls.js";

// ── Types ──

export type PlaybackState =
  | "idle" | "loading" | "buffering" | "playing"
  | "paused" | "seeking" | "error" | "ended";

export interface PlaybackMemory {
  lastTrackId: string | null;
  lastPosition: number;
  lastVolume: number;
  lastQueue: string[];
  lastQueueIndex: number;
  timestamp: number;
}

// ── Typed Event Emitter ──

type Listener<T> = (event: T) => void;

class TypedEventEmitter<M extends Record<string, any>> {
  private ls = new Map<keyof M, Set<Listener<any>>>();

  on<K extends keyof M>(e: K, fn: Listener<M[K]>): () => void {
    if (!this.ls.has(e)) this.ls.set(e, new Set());
    this.ls.get(e)!.add(fn);
    return () => { this.ls.get(e)?.delete(fn); };
  }

  once<K extends keyof M>(e: K, fn: Listener<M[K]>): () => void {
    const unsub = this.on(e, (d) => { unsub(); fn(d); });
    return unsub;
  }

  emit<K extends keyof M>(e: K, d: M[K]): void {
    this.ls.get(e)?.forEach((fn) => { try { fn(d); } catch (err) { console.error("[PlaybackEngine] listener error:", err); } });
  }

  removeAllListeners(): void { this.ls.clear(); }
}

export interface PlaybackEventMap {
  state_change: { from: PlaybackState; to: PlaybackState };
  track_change: { track: Track | null };
  time_update: { currentTime: number; duration: number };
  buffer_update: { buffered: number };
  volume_change: { volume: number };
  error: { error: string; recoverable: boolean };
  queue_update: { queue: Track[]; index: number };
  loading_progress: { progress: number };
  restore_available: { memory: PlaybackMemory };
}

// ── Constants ──

const MEMORY_KEY = "mq-playback-memory";
const MAX_RETRIES = 3;
const STALL_TIMEOUT_MS = 2000;
const PRELOAD_THRESHOLD = 0.8;

// ── Playback Engine ──

class PlaybackEngine {
  private static instance: PlaybackEngine | null = null;

  // State
  private _state: PlaybackState = "idle";
  private _currentTrack: Track | null = null;
  private _queue: Track[] = [];
  private _queueIndex = -1;
  private _volume = 30;
  private _muted = false;
  private _previousVolume = 30;
  private _currentTime = 0;
  private _duration = 0;
  private _buffered = 0;

  // Retry
  private _retryCount = 0;
  private _retrying = false;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  // Stall detection
  private _stallTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastTimeUpdateTs = 0;

  // Race-condition guard
  private _loadGeneration = 0;

  // Stream state
  private _fallbackStreams: StreamResult["fallbackStreams"] = undefined;
  private _currentHls: Hls | null = null;

  // Crossfade / gapless
  private _prevTrackIdForCrossfade: string | null = null;
  private _crossfadeActive = false;
  private _gaplessPreloadStarted = false;
  private _gaplessPreloadedTrack: Track | null = null;

  // Audio listeners
  private _cleanupFns: (() => void)[] = [];
  private _listenersAttached = false;
  private _elementReplacedUnsub: (() => void) | null = null;
  private _memoryChecked = false;

  private _events = new TypedEventEmitter<PlaybackEventMap>();

  // ── Singleton ──

  private constructor() { this._checkRestoreFromMemory(); }

  static getInstance(): PlaybackEngine {
    if (!PlaybackEngine.instance) PlaybackEngine.instance = new PlaybackEngine();
    return PlaybackEngine.instance;
  }

  // ── Accessors ──

  get state(): PlaybackState { return this._state; }
  get currentTrack(): Track | null { return this._currentTrack; }
  get currentTime(): number { const a = this._audio(); return a?.currentTime ?? this._currentTime; }
  get duration(): number { const a = this._audio(); const d = a?.duration; return d && isFinite(d) ? d : this._duration; }
  get volume(): number { return this._volume; }
  get isPlaying(): boolean { return this._state === "playing"; }
  get isLoading(): boolean { return this._state === "loading" || this._state === "buffering"; }
  get buffered(): number { return this._buffered; }
  get retrying(): boolean { return this._retrying; }
  get retryCount(): number { return this._retryCount; }
  get events(): TypedEventEmitter<PlaybackEventMap> { return this._events; }

  // ── State machine ──

  private _transition(to: PlaybackState): void {
    if (this._state === to) return;
    const from = this._state;
    this._state = to;
    this._events.emit("state_change", { from, to });
  }

  // ── Playback control ──

  async play(track?: Track, queue?: Track[]): Promise<void> {
    this._ensureAudioEngine();
    if (track) {
      if (queue) {
        this._queue = [...queue];
        this._queueIndex = Math.max(0, queue.findIndex((t) => t.id === track.id));
        this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
      }
      this._currentTrack = track;
      this._events.emit("track_change", { track });
      await this._loadTrack(track);
    } else if (this._currentTrack) {
      await this._resumePlayback();
    }
  }

  pause(): void {
    this._audio()?.pause();
    this._transition("paused");
    this._saveMemory();
  }

  resume(): void { this._resumePlayback(); }

  togglePlayPause(): void { this._state === "playing" ? this.pause() : this.resume(); }

  seek(time: number): void {
    const a = this._audio();
    if (!a) return;
    const clampedTime = Math.max(0, Math.min(isFinite(a.duration) ? a.duration : time, time));
    const prev = this._state;
    // Only enter seeking state when audio is playing; if paused, setting currentTime
    // still works but the browser may not fire a seeked event reliably on all platforms.
    if (prev === "playing" || prev === "buffering") {
      this._transition("seeking");
    }
    a.currentTime = clampedTime;
    this._currentTime = clampedTime;
    // Emit time_update immediately so UI reflects new position without waiting for seeked/timeupdate
    const dur = isFinite(a.duration) ? a.duration : this._duration;
    this._events.emit("time_update", { currentTime: clampedTime, duration: dur });
    // Restore state if we were already paused (seeked event may not fire)
    if (prev !== "playing" && prev !== "buffering" && prev !== "seeking") {
      this._transition(prev);
    }
  }

  next(): void {
    if (!this._queue.length) return;
    this._queueIndex = (this._queueIndex + 1) % this._queue.length;
    this._advanceQueue();
  }

  previous(): void {
    const a = this._audio();
    if (a && a.currentTime > 3) { this.seek(0); return; }
    if (!this._queue.length) return;
    this._queueIndex = (this._queueIndex - 1 + this._queue.length) % this._queue.length;
    this._advanceQueue();
  }

  private _advanceQueue(): void {
    const track = this._queue[this._queueIndex];
    if (!track) return;
    this._currentTrack = track;
    this._events.emit("track_change", { track });
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._ensureAudioEngine();
    this._loadTrack(track);
  }

  // ── Volume ──

  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(100, Math.round(vol)));
    const a = this._audio();
    if (a) a.volume = this._volume / 100;
    this._events.emit("volume_change", { volume: this._volume });
    this._saveMemory();
  }

  mute(): void {
    if (this._muted) return;
    this._muted = true;
    this._previousVolume = this._volume;
    const a = this._audio();
    if (a) a.volume = 0;
    this._events.emit("volume_change", { volume: 0 });
  }

  unmute(): void {
    if (!this._muted) return;
    this._muted = false;
    this._volume = this._previousVolume;
    const a = this._audio();
    if (a) a.volume = this._volume / 100;
    this._events.emit("volume_change", { volume: this._volume });
  }

  // ── Queue ──

  setQueue(tracks: Track[], startIndex = 0): void {
    this._queue = [...tracks]; this._queueIndex = startIndex;
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._saveMemory();
  }

  addToQueue(track: Track, position: "next" | "last" = "last"): void {
    if (position === "next") this._queue.splice(this._queueIndex + 1, 0, track);
    else this._queue.push(track);
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._saveMemory();
  }

  removeFromQueue(index: number): void {
    if (index < 0 || index >= this._queue.length) return;
    this._queue.splice(index, 1);
    if (index < this._queueIndex) this._queueIndex--;
    else if (index === this._queueIndex) this._queueIndex = Math.min(this._queueIndex, this._queue.length - 1);
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._saveMemory();
  }

  reorderQueue(from: number, to: number): void {
    if (from === to || from < 0 || from >= this._queue.length || to < 0 || to >= this._queue.length) return;
    const [moved] = this._queue.splice(from, 1);
    this._queue.splice(to, 0, moved);
    if (from === this._queueIndex) this._queueIndex = to;
    else if (from < this._queueIndex && to >= this._queueIndex) this._queueIndex--;
    else if (from > this._queueIndex && to <= this._queueIndex) this._queueIndex++;
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._saveMemory();
  }

  getQueue(): { tracks: Track[]; currentIndex: number } {
    return { tracks: [...this._queue], currentIndex: this._queueIndex };
  }

  peekNext(): Track | null {
    const idx = this._queueIndex + 1;
    return idx < this._queue.length ? this._queue[idx] ?? null : null;
  }

  // ── Persistence ──

  private _saveMemory(): void {
    if (typeof window === "undefined") return;
    try {
      const m: PlaybackMemory = {
        lastTrackId: this._currentTrack?.id ?? null,
        lastPosition: this.currentTime,
        lastVolume: this._volume,
        lastQueue: this._queue.map((t) => t.id),
        lastQueueIndex: this._queueIndex,
        timestamp: Date.now(),
      };
      localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
    } catch { /* full or unavailable */ }
  }

  private _loadMemory(): PlaybackMemory | null {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _checkRestoreFromMemory(): void {
    if (this._memoryChecked) return;
    this._memoryChecked = true;
    const m = this._loadMemory();
    if (m?.lastTrackId && Date.now() - m.timestamp < 4 * 3600_000) {
      this._events.emit("restore_available", { memory: m });
    }
  }

  async restoreFromMemory(trackLookup?: Map<string, Track>): Promise<boolean> {
    const m = this._loadMemory();
    if (!m?.lastTrackId || !trackLookup?.size) return false;
    const current = trackLookup.get(m.lastTrackId);
    if (!current) return false;

    const restoredQueue: Track[] = [];
    for (const id of m.lastQueue) { const t = trackLookup.get(id); if (t) restoredQueue.push(t); }

    this._queue = restoredQueue;
    this._queueIndex = m.lastQueueIndex;
    this._volume = m.lastVolume;
    this.setVolume(m.lastVolume);
    this._currentTrack = current;
    this._events.emit("track_change", { track: current });
    this._events.emit("queue_update", { queue: this._queue, index: this._queueIndex });
    this._ensureAudioEngine();
    await this._loadTrack(current, m.lastPosition);
    return true;
  }

  // ── Audio engine bootstrap ──

  private _audio(): HTMLAudioElement | null { return getAudioElement(); }

  private _ensureAudioEngine(): void {
    initAudioEngine(getAudioElement());
    this._attachListeners();
    if (!this._elementReplacedUnsub) {
      this._elementReplacedUnsub = onAudioElementReplaced(() => {
        this._listenersAttached = false; this._cleanupFns = []; this._attachListeners();
      });
    }
  }

  // ── Audio element listeners ──

  private _attachListeners(): void {
    if (this._listenersAttached) return;
    this._listenersAttached = true;
    const a = this._audio();
    if (!a) return;

    const handlers: Record<string, EventListener> = {
      timeupdate: () => this._onTimeUpdate(),
      loadedmetadata: () => { const d = a.duration; if (d && isFinite(d)) this._duration = d; },
      canplay: () => { this._retryCount = 0; this._retrying = false; this._clearStall(); },
      playing: () => { this._retryCount = 0; this._retrying = false; this._clearStall(); this._startStall(); this._transition("playing"); this._saveMemory(); this._updateMediaSession(); },
      waiting: () => { if (this._state === "playing") this._transition("buffering"); this._startStall(); },
      ended: () => { this._transition("ended"); this._clearStall(); this._crossfadeActive = false; this._prevTrackIdForCrossfade = null; this.next(); },
      error: () => this._onError(),
      seeked: () => {
        if (this._state === "seeking") {
          this._transition(a.paused ? "paused" : "playing");
        }
        // Always emit time_update on seeked so the UI progress bar snaps immediately.
        // Without this the bar can show the pre-seek position until the next timeupdate fires.
        const dur = a.duration && isFinite(a.duration) ? a.duration : this._duration;
        this._events.emit("time_update", { currentTime: a.currentTime, duration: dur });
      },
      progress: () => this._onProgress(),
    };

    for (const [evt, fn] of Object.entries(handlers)) a.addEventListener(evt, fn);
    this._cleanupFns.push(() => { for (const [evt, fn] of Object.entries(handlers)) a.removeEventListener(evt, fn); });
  }

  private _detachListeners(): void {
    this._cleanupFns.forEach((fn) => { try { fn(); } catch {} });
    this._cleanupFns = []; this._listenersAttached = false;
  }

  private _onTimeUpdate(): void {
    const a = this._audio();
    if (!a) return;
    if (a.duration && isFinite(a.duration) && a.currentTime > a.duration) return;
    this._currentTime = a.currentTime;
    const dur = a.duration && isFinite(a.duration) ? a.duration : this._duration;
    this._lastTimeUpdateTs = Date.now();
    this._events.emit("time_update", { currentTime: this._currentTime, duration: dur });
    this._clearStall();
    this._checkPreloadNext();
  }

  private _onProgress(): void {
    const a = this._audio();
    if (!a?.buffered.length || !a.duration || !isFinite(a.duration)) return;
    this._buffered = a.buffered.end(a.buffered.length - 1) / a.duration;
    this._events.emit("buffer_update", { buffered: this._buffered });
    this._events.emit("loading_progress", { progress: this._buffered });
  }

  private _onError(): void {
    this._clearStall();
    this._attemptRetry(this._audio()?.error?.code || 0);
  }

  // ── Track loading ──

  private async _loadTrack(track: Track, startPos?: number): Promise<void> {
    this._loadGeneration++;
    const gen = this._loadGeneration;
    this._transition("loading");
    this._retryCount = 0;
    this._fallbackStreams = undefined;
    this._destroyHls();

    // Gapless shortcut
    const preloadedId = getGaplessPreloadedTrackId();
    if (preloadedId === track.id && isGaplessEnabled() && this._prevTrackIdForCrossfade && this._prevTrackIdForCrossfade !== track.id && this._state !== "idle") {
      const inactive = getInactiveAudio();
      if (inactive && (inactive.readyState >= 2 || (inactive as any)._hlsInstance)) {
        crossfadeToGapless(inactive);
        resumeAudioContext();
        try { await inactive.play(); if (startPos && isFinite(startPos)) inactive.currentTime = startPos; } catch {}
        this._prevTrackIdForCrossfade = track.id;
        this._gaplessPreloadStarted = false; this._gaplessPreloadedTrack = null;
        return;
      }
      clearGaplessPreload();
    }

    if (preloadedId !== track.id) clearGaplessPreload();
    this._gaplessPreloadStarted = false; this._gaplessPreloadedTrack = null;

    const canCrossfade = !!this._prevTrackIdForCrossfade && this._prevTrackIdForCrossfade !== track.id && this._state !== "idle" && isCrossfadeEnabled();
    let el = (canCrossfade ? getInactiveAudio() : this._audio())!;
    if (!el) return;
    el.pause();
    this._cleanupElement(el);

    try {
      if (track.source === "demo" && track.audioUrl) {
        await this._playDirect(el, track.audioUrl, canCrossfade, startPos);
      } else if (track.source === "soundcloud" && track.scTrackId) {
        resetCorsState();
        const stream = await resolveSoundCloudStream(track.scTrackId);
        if (this._loadGeneration !== gen) return;
        if (stream?.url) {
          this._fallbackStreams = stream.fallbackStreams || undefined;
          await this._applyStream(el, stream, canCrossfade, startPos);
        } else {
          await this._streamFailure(el, track, "No stream URL");
        }
      } else if (track.audioUrl && track.audioUrl !== "blob://client-side") {
        const src = track.id.startsWith("local_") ? shouldProxyUrl(track.audioUrl) : shouldProxyUrl(track.audioUrl);
        await this._playDirect(el, src, canCrossfade, startPos);
      } else {
        this._transition("error");
        this._events.emit("error", { error: "No audio URL available", recoverable: false });
      }
      this._prevTrackIdForCrossfade = track.id;
    } catch (err: any) {
      this._transition("error");
      this._events.emit("error", { error: err?.message || "Load error", recoverable: false });
    }
  }

  private async _playDirect(el: HTMLAudioElement, url: string, crossfade: boolean, startPos?: number): Promise<void> {
    resetCorsState();
    ensureWebAudioConnected(el);
    el.src = url; el.load(); el.volume = this._volume / 100;
    if (crossfade) { this._crossfadeActive = true; crossfadeTo(el); } else cancelCrossfade();
    resumeAudioContext();
    try { await el.play(); if (startPos && isFinite(startPos)) el.currentTime = startPos; } catch {}
  }

  private async _applyStream(el: HTMLAudioElement, stream: StreamResult, crossfade: boolean, startPos?: number): Promise<void> {
    if (stream.isHls && Hls.isSupported()) {
      el.crossOrigin = "anonymous";
      const cfg = buildEmeHlsConfig(stream);

      if (stream.isEncrypted) {
        el = prepareEncryptedElement(el);
        const origXhr = cfg.xhrSetup;
        const interceptor = createManifestInterceptor(el);
        cfg.xhrSetup = (xhr: XMLHttpRequest, url: string) => { interceptor(xhr, url); origXhr?.(xhr, url); };
      } else {
        ensureWebAudioConnected(el);
      }

      const hls = new Hls(cfg);
      hls.loadSource(stream.url); hls.attachMedia(el);
      this._currentHls = hls;

      const manifestT = setTimeout(() => {
        if (el.paused && !el.currentTime) { this._destroyHls(); this._streamFailure(el, this._currentTrack!, "HLS manifest timeout"); }
      }, 15000);

      const drmT = stream.isEncrypted ? setTimeout(() => {
        if (el.paused && !el.currentTime) { this._destroyHls(); this._streamFailure(el, this._currentTrack!, "DRM timeout"); }
      }, 25000) : null;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearTimeout(manifestT);
        if (crossfade) { this._crossfadeActive = true; crossfadeTo(el); } else cancelCrossfade();
        resumeAudioContext(); el.volume = this._volume / 100;
        el.play().catch(() => {});
        if (startPos && isFinite(startPos)) el.addEventListener("playing", () => { el.currentTime = startPos; }, { once: true });
        el.addEventListener("playing", () => { if (drmT) clearTimeout(drmT); }, { once: true });
      });

      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.fatal) { clearTimeout(manifestT); if (drmT) clearTimeout(drmT); this._destroyHls(); this._tryFallback(el); }
      });

      (el as any)._hlsInstance = hls;
    } else {
      await this._playDirect(el, shouldProxyUrl(stream.url), crossfade, startPos);
    }
  }

  // ── Fallback streams ──

  private async _streamFailure(el: HTMLAudioElement, track: Track, reason: string): Promise<void> {
    if (await this._tryFallback(el)) return;
    this._transition("error");
    this._events.emit("error", { error: reason, recoverable: true });
    setTimeout(() => this.next(), 1500);
  }

  private async _tryFallback(el: HTMLAudioElement): Promise<boolean> {
    if (!this._fallbackStreams?.length) return false;
    const fb = this._fallbackStreams[0];
    this._fallbackStreams = this._fallbackStreams.slice(1);

    this._cleanupElement(el);
    el.crossOrigin = "anonymous";

    if (fb.isHls && Hls.isSupported()) {
      const cfg = buildEmeHlsConfig(fb);
      if (fb.isEncrypted) {
        el = prepareEncryptedElement(el);
        const origXhr = cfg.xhrSetup;
        const interceptor = createManifestInterceptor(el);
        cfg.xhrSetup = (xhr: XMLHttpRequest, url: string) => { interceptor(xhr, url); origXhr?.(xhr, url); };
      } else ensureWebAudioConnected(el);

      const hls = new Hls(cfg);
      hls.loadSource(fb.url); hls.attachMedia(el);
      this._currentHls = hls;

      return new Promise((res) => {
        const t = setTimeout(() => { this._destroyHls(); res(false); }, 10000);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(t); resumeAudioContext(); el.volume = this._volume / 100; el.play().catch(() => {}); res(true); });
        hls.on(Hls.Events.ERROR, (_ev, d) => { if (d.fatal) { clearTimeout(t); this._destroyHls(); res(false); } });
        (el as any)._hlsInstance = hls;
      });
    }
    el.src = fb.url; el.load(); el.volume = this._volume / 100;
    try { await el.play(); return true; } catch { return false; }
  }

  // ── Resume ──

  private async _resumePlayback(): Promise<void> {
    this._ensureAudioEngine();
    const a = this._audio();
    if (!a) return;
    if (!a.src && this._currentTrack) { await this._loadTrack(this._currentTrack); return; }
    resumeAudioContext(); a.volume = this._muted ? 0 : this._volume / 100;
    try { await a.play(); } catch (err: any) {
      if (err.name === "NotAllowedError") { this._transition("paused"); }
      else { this._transition("error"); this._events.emit("error", { error: err.message || "Play failed", recoverable: true }); }
    }
  }

  // ── Retry ──

  private async _attemptRetry(errorCode: number): Promise<void> {
    if (this._retrying || !this._currentTrack) return;
    const a = this._audio();
    const savedPos = a?.currentTime || 0;
    const wasMid = savedPos > 1 && this._state === "playing";

    if (this._retryCount >= MAX_RETRIES) {
      this._transition("error");
      this._events.emit("error", { error: `Playback error (code ${errorCode})`, recoverable: false });
      setTimeout(() => this.next(), 1500);
      return;
    }

    this._retryCount++; this._retrying = true;
    const backoff = Math.pow(2, this._retryCount - 1) * 1000;
    // Capture the track ID BEFORE sleeping so we can detect stale retries.
    const trackIdBeforeBackoff = this._currentTrack?.id ?? null;

    await new Promise<void>((r) => { this._retryTimer = setTimeout(r, backoff); });
    this._retrying = false;
    // Stale check: if track changed while we were waiting for the retry backoff, abort.
    // (The original code compared this._currentTrack?.id to itself — always false — so
    //  retries fired even after the user had already switched to a different track.)
    if (!trackIdBeforeBackoff || this._currentTrack?.id !== trackIdBeforeBackoff) return;

    if (this._currentTrack.source === "soundcloud" && this._currentTrack.scTrackId) {
      const scId = this._currentTrack.scTrackId;
      const stream = await resolveSoundCloudStream(scId);
      if (this._currentTrack?.scTrackId !== scId) return;
      if (stream?.url) {
        this._fallbackStreams = stream.fallbackStreams || undefined;
        const el = this._audio();
        if (el) await this._applyStream(el, stream, false, wasMid ? savedPos : undefined);
      } else {
        this._transition("error");
        this._events.emit("error", { error: "Stream resolve failed after retry", recoverable: false });
        setTimeout(() => this.next(), 1500);
      }
    } else {
      resetCorsState();
      const el = this._audio();
      if (!el) return;
      const src = el.src; el.removeAttribute("src"); el.load();
      await new Promise((r) => setTimeout(r, 100));
      el.src = src; el.load();
      try { await el.play(); if (wasMid && isFinite(savedPos)) el.currentTime = savedPos; }
      catch { this._transition("error"); this._events.emit("error", { error: `Error code ${errorCode}`, recoverable: false }); setTimeout(() => this.next(), 1500); }
    }
  }

  // ── Stall detection ──

  private _startStall(): void {
    this._clearStall();
    this._stallTimer = setTimeout(() => {
      if (this._state === "playing" && Date.now() - this._lastTimeUpdateTs >= STALL_TIMEOUT_MS)
        this._transition("buffering");
      this._startStall();
    }, STALL_TIMEOUT_MS);
  }

  private _clearStall(): void { if (this._stallTimer) { clearTimeout(this._stallTimer); this._stallTimer = null; } }

  // ── Preload ──

  private _checkPreloadNext(): void {
    if (!isGaplessEnabled() || this._gaplessPreloadStarted) return;
    const a = this._audio();
    if (!a?.duration || !isFinite(a.duration)) return;
    if (a.currentTime / a.duration < PRELOAD_THRESHOLD) return;
    const next = this.peekNext();
    if (!next || this._gaplessPreloadedTrack?.id === next.id) return;
    this._gaplessPreloadStarted = true;
    this._preloadTrack(next);
  }

  private async _preloadTrack(track: Track): Promise<void> {
    try {
      const inactive = getInactiveAudio();
      if (!inactive) return;
      this._cleanupElement(inactive);
      inactive.pause(); inactive.currentTime = 0; inactive.crossOrigin = "anonymous";

      if (track.source === "demo" && track.audioUrl) {
        ensureWebAudioConnected(inactive);
        if (audioEnginePreloadTrack(track.audioUrl, track.id)) this._gaplessPreloadedTrack = track;
        return;
      }

      if (track.source === "soundcloud" && track.scTrackId) {
        const stream = await resolveSoundCloudStream(track.scTrackId);
        if (!stream?.url || this._currentTrack?.id === track.id) { this._gaplessPreloadStarted = false; return; }

        if (stream.isHls && Hls.isSupported()) {
          let target = inactive;
          const cfg = buildEmeHlsConfig(stream);
          if (stream.isEncrypted) {
            target = prepareEncryptedElement(inactive);
            const origXhr = cfg.xhrSetup;
            const interceptor = createManifestInterceptor(target);
            cfg.xhrSetup = (xhr: XMLHttpRequest, url: string) => { interceptor(xhr, url); origXhr?.(xhr, url); };
          } else ensureWebAudioConnected(inactive);

          const hls = new Hls({ ...cfg, autoStartLoad: true });
          hls.loadSource(stream.url); hls.attachMedia(target);
          (target as any)._hlsInstance = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => { setGaplessPreloadedTrackId(track.id); this._gaplessPreloadedTrack = track; });
          hls.on(Hls.Events.ERROR, (_ev, d) => { if (d.fatal) { try { hls.destroy(); } catch {} this._gaplessPreloadStarted = false; } });
        } else {
          ensureWebAudioConnected(inactive);
          if (audioEnginePreloadTrack(shouldProxyUrl(stream.url), track.id)) this._gaplessPreloadedTrack = track;
        }
        return;
      }

      if (track.audioUrl && track.audioUrl !== "blob://client-side") {
        ensureWebAudioConnected(inactive);
        if (audioEnginePreloadTrack(shouldProxyUrl(track.audioUrl), track.id)) this._gaplessPreloadedTrack = track;
      }
    } catch { this._gaplessPreloadStarted = false; }
  }

  // ── Media Session ──

  private _updateMediaSession(): void {
    if (!this._currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this._currentTrack.title, artist: this._currentTrack.artist,
        album: this._currentTrack.album,
        artwork: this._currentTrack.cover ? [{ src: this._currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => this.resume());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.previous());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime !== undefined) this.seek(d.seekTime); });
    } catch {}
  }

  // ── Helpers ──

  private _cleanupElement(el: HTMLAudioElement): void {
    const hls = (el as any)._hlsInstance;
    if (hls) { try { hls.destroy(); } catch {} delete (el as any)._hlsInstance; }
  }

  private _destroyHls(): void {
    if (this._currentHls) { try { this._currentHls.destroy(); } catch {} this._currentHls = null; }
  }

  // ── Lifecycle ──

  destroy(): void {
    this._detachListeners();
    if (this._elementReplacedUnsub) { this._elementReplacedUnsub(); this._elementReplacedUnsub = null; }
    this._clearStall();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    this._destroyHls();
    this._saveMemory();
    this._currentTrack = null; this._queue = []; this._queueIndex = -1;
    this._state = "idle";
    this._events.removeAllListeners();
  }
}

// ── Exports ──

export function getPlaybackEngine(): PlaybackEngine { return PlaybackEngine.getInstance(); }
export { PlaybackEngine };
