"use client";

/**
 * Waveform live sampler — REAL signal capture for tracks whose full file
 * cannot be fetched for decoding (DRM-HLS, plain HLS, snippet-only).
 *
 * While the track actually plays, samples the engine's AnalyserNode
 * (getTimeDomainData — the same real audio the equalizer visualizer reads)
 * at bucket boundaries and grows a persistent partial waveform. Nothing is
 * invented: buckets that were never heard render as subtle placeholders
 * (see bucketDisplayValue), and the coverage metric stays honest.
 *
 * The sampler is driven by requestAnimationFrame + the playback position
 * (audio clock) — no independent timers, no React state.
 */

import { getAnalyser, getTimeDomainData } from "@/lib/audioEngine";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { useAppStore } from "@/store/useAppStore";
import { bucketCountFor, coverageOf, mergePeaks, waveformKey } from "./computePeaks";
import { getWaveformFromCache, putWaveformToCache } from "./waveformCache";
import { WAVEFORM_VERSION } from "./types";

interface LiveSession {
  key: string;
  trackId: string;
  fingerprint: string;
  durationSec: number;
  bucketCount: number;
  peaks: Float32Array;
  /** Per-bucket "has real data" flags (1/0). */
  known: Uint8Array;
  lastFlushAt: number;
  maxSampledBuckets: number;
}

let session: LiveSession | null = null;
let raf = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let domainBuf: Uint8Array<ArrayBuffer> | null = null;

const FLUSH_INTERVAL_MS = 4000;

function sampleFrame() {
  raf = requestAnimationFrame(sampleFrame);
  if (!session) return;
  if (document.hidden) return;

  const st = useAppStore.getState();
  if (!st.isPlaying) return;           // paused: nothing new to hear
  if (st.playbackState === "buffering") return;
  // NOTE: no isCorsBlocked() gate — that flag only clears when the
  // FREQUENCY visualizer runs, and time-domain silence is detectable on
  // its own (all-128 ⇒ amplitude guard below skips the bucket). A
  // CORS-blocked Web Audio graph feeds real silence, which never gets
  // persisted as fake peaks.

  const pos = currentPlaybackPosition();
  if (!isFinite(pos) || pos < 0 || pos >= session.durationSec) return;

  const idx = Math.min(
    session.bucketCount - 1,
    Math.floor((pos / session.durationSec) * session.bucketCount),
  );
  if (idx < 0 || session.known[idx]) return; // already captured this bucket

  const analyser = getAnalyser();
  if (!analyser) return;
  const want = analyser.fftSize || 2048;
  if (!domainBuf || domainBuf.length !== want) {
    domainBuf = new Uint8Array(new ArrayBuffer(want));
  }
  const buf = getTimeDomainData(domainBuf);
  let max = 0;
  const n = Math.min(buf.length, want);
  for (let i = 0; i < n; i++) {
    // Analyser time-domain byte data: 0..128..255 → -128..127 amplitude.
    const v = Math.abs(buf[i] - 128) / 128;
    if (v > max) max = v;
  }
  if (max <= 0.02) return;            // silence (musical rest OR cors-muted) — never mark

  session.peaks[idx] = Math.max(session.peaks[idx], max);
  session.known[idx] = 1;
  session.maxSampledBuckets++;
}

async function flush(final: boolean) {
  const s = session;
  if (!s) return;
  const knownCount = s.maxSampledBuckets;
  if (knownCount === 0) return;

  // Merge with whatever is already persisted (previous listening sessions).
  const cached = await getWaveformFromCache(s.key);
  // Complete (fully decoded) entries are immutable — never downgrade them.
  if (cached?.complete) return;
  let peaks = s.peaks;
  if (cached && cached.peaks.length === s.bucketCount) {
    peaks = mergePeaks(cached.peaks, s.peaks);
  }
  await putWaveformToCache({
    key: s.key,
    trackId: s.trackId,
    version: WAVEFORM_VERSION,
    fingerprint: s.fingerprint,
    bucketCount: s.bucketCount,
    durationSec: s.durationSec,
    peaks,
    coverage: coverageOf(peaks),
    complete: false,
    updatedAt: Date.now(),
  });
  if (!final) {
    // Reload the merged array so the in-memory view keeps growing from the
    // merged state (prevents a flush-race losing the persisted portion).
    const merged = await getWaveformFromCache(s.key);
    if (merged && !merged.complete && session) {
      session.peaks = new Float32Array(merged.peaks);
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!session) return;
    const now = Date.now();
    if (now - session.lastFlushAt >= FLUSH_INTERVAL_MS) {
      session.lastFlushAt = now;
      void flush(false);
    }
    scheduleFlush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Start (or restart) sampling for a track. Safe to call repeatedly with the
 * same args — only a track/key change restarts the session.
 */
export function startLiveSampling(args: {
  trackId: string;
  fingerprint: string;
  durationSec: number;
}) {
  const bucketCount = bucketCountFor(args.durationSec);
  if (!args.trackId || bucketCount <= 0) return;
  const key = waveformKey(args.trackId, args.fingerprint);
  if (session && session.key === key) return; // already sampling this track

  // Flush the outgoing session before switching.
  if (session) {
    void flush(true);
  }
  session = {
    key,
    trackId: args.trackId,
    fingerprint: args.fingerprint,
    durationSec: args.durationSec,
    bucketCount,
    peaks: new Float32Array(bucketCount),
    known: new Uint8Array(bucketCount),
    lastFlushAt: Date.now(),
    maxSampledBuckets: 0,
  };

  // Seed the in-memory array from cache (previous sessions' samples) so the
  // renderer sees the merged picture immediately, without waiting for a flush.
  void getWaveformFromCache(key).then((cached) => {
    if (!session || session.key !== key || !cached || cached.complete) return;
    if (cached.peaks.length === bucketCount) {
      session.peaks = new Float32Array(cached.peaks);
      for (let i = 0; i < bucketCount; i++) {
        if (cached.peaks[i] > 0) {
          session.known[i] = 1;
          session.maxSampledBuckets++;
        }
      }
    }
  });

  if (!raf) raf = requestAnimationFrame(sampleFrame);
  scheduleFlush();
}

/** Stop sampling and flush the final state. */
export function stopLiveSampling() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  // Flush BEFORE nulling: flush() captures the module-level session on its
  // first (synchronous) line — a final flush after `session = null` would be
  // a silent no-op and lose up to FLUSH_INTERVAL_MS of sampled peaks.
  if (session) void flush(true);
  session = null;
}

/** Current in-memory sampling state (for the renderer's merged view). */
export function getLiveSampled(): { key: string; peaks: Float32Array } | null {
  if (!session) return null;
  return { key: session.key, peaks: session.peaks };
}

/** Test hook: hard-reset without flushing. */
export function resetLiveSamplerForTest() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  session = null;
}
