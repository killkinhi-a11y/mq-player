/**
 * PlaybackClock — V3 PHASE 13/§19. THE one playback clock.
 *
 * ONE requestAnimationFrame loop feeds EVERY time-dependent surface:
 *   MQ Wave · Lyrics (Liquid/Fullscreen) · Progress · Media Session · engine
 *
 * Before V3 there were five independent rAF loops (engine progress registry,
 * WaveformView, LiquidLyrics ×3, FullscreenLyrics, ProgressBar) each reading
 * its own position — the exact §13 violation («НЕ создавать 4 независимых
 * таймера»). Now they all subscribe here.
 *
 * Position source is the SAME audio clock everyone trusted before:
 * `currentPlaybackPosition()` (Spotify adapter interpolation / WASM engine
 * clock / audio element — unified in wasm-audio/WasmAudioBackend).
 *
 * Contract:
 *  - subscribe(fn, {throttleMs}) → unsubscribe; fn(pos, dur) at most every
 *    throttleMs (0 = every active frame);
 *  - setPlaying(bool) — engine reports transport state; the loop runs while
 *    playing, plus short "wake" bursts when paused (seek/resize/data change);
 *  - wake() — request one redraw burst while paused (2 frames settle);
 *  - document.hidden → frames keep ticking but listeners are cheap no-ops
 *    per their own guards (same as the old Wave loop).
 */

import { currentPlaybackPosition } from "@/lib/wasm-audio";

type ClockListener = (pos: number, dur: number) => void;

interface ListenerEntry {
  fn: ClockListener;
  throttleMs: number;
  lastAt: number;
}

/** Where duration comes from (injected to avoid a store import cycle). */
let durationSource: () => number = () => 0;
export function setClockDurationSource(fn: () => number): void {
  durationSource = fn;
}

let playing = false;
let raf = 0;
let running = false;
let wakeFrames = 0;
const listeners = new Set<ListenerEntry>();

/**
 * Paused slow-poll (V3 §19): while paused, ONE 250ms interval watches the
 * position. An external seek from ANY surface (lyrics click, Media Session,
 * queue actions) produces a position delta → the clock fires a notification
 * frame so Wave/Progress stay in sync WITHOUT running a 60fps loop.
 */
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPolledPos = -1;

function ensurePolling(): void {
  if (pollTimer !== null || typeof window === "undefined") return;
  pollTimer = setInterval(() => {
    if (playing || listeners.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const pos = currentPlaybackPosition();
    if (lastPolledPos >= 0 && Math.abs(pos - lastPolledPos) > 0.05) {
      wakeClock(); // external seek while paused — one redraw burst
    }
    lastPolledPos = pos;
  }, 250);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastPolledPos = -1;
}

/** Diagnostics: how many surfaces share the clock (dev panel §29). */
export function clockStats(): { subscribers: number; running: boolean; playing: boolean } {
  return { subscribers: listeners.size, running, playing };
}

function tick(): void {
  raf = requestAnimationFrame(tick);
  if (typeof document !== "undefined" && document.hidden) return;

  const pos = currentPlaybackPosition();
  const dur = durationSource() || 0;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  let anyNotified = false;
  for (const e of listeners) {
    if (now - e.lastAt < e.throttleMs) continue;
    e.lastAt = now;
    try {
      e.fn(pos, dur);
      anyNotified = true;
    } catch { /* a broken surface must not kill the clock */ }
  }

  if (wakeFrames > 0) wakeFrames--;
  // Stop when nothing drives us: paused + wake burst consumed.
  if (!playing && wakeFrames <= 0) {
    stop();
  }
  void anyNotified;
}

function start(): void {
  if (running || typeof window === "undefined" || !window.requestAnimationFrame) return;
  running = true;
  raf = requestAnimationFrame(tick);
  ensurePolling();
}

function stop(): void {
  if (!running) return;
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  // NOTE: polling continues while listeners exist (paused-seek sync).
}

/**
 * Subscribe to the unified clock.
 * @param fn   listener(pos, dur)
 * @param opts throttleMs — minimum ms between calls (0 = every active frame)
 * @returns unsubscribe
 */
export function subscribeClock(
  fn: ClockListener,
  opts?: { throttleMs?: number },
): () => void {
  const entry: ListenerEntry = { fn, throttleMs: opts?.throttleMs ?? 0, lastAt: 0 };
  listeners.add(entry);
  ensurePolling();
  if (playing || wakeFrames > 0) start();
  return () => {
    listeners.delete(entry);
    if (listeners.size === 0) {
      stop();
      stopPolling();
    }
  };
}

/** Engine reports transport state — the clock runs while audio plays. */
export function clockSetPlaying(isPlaying: boolean): void {
  playing = isPlaying;
  if (playing) start();
  else wakeFrames = Math.max(wakeFrames, 2); // settle the final paused frame
}

/**
 * Request a short redraw burst while paused (seek / resize / data change /
 * theme swap). Idempotent and cheap — surfaces can call it liberally.
 */
export function wakeClock(): void {
  wakeFrames = Math.max(wakeFrames, 2);
  start();
}

/** Test hook: reset everything. */
export function __resetClock(): void {
  stop();
  stopPolling();
  listeners.clear();
  playing = false;
  wakeFrames = 0;
  durationSource = () => 0;
}
