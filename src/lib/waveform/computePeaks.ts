/**
 * Waveform math — pure functions, fully unit-testable (no DOM, no fetch).
 *
 * Downsampling is MAX-ABS per bucket (standard for waveform displays —
 * preserves transients better than RMS and never overstates silence).
 */

import { WAVEFORM_VERSION } from "./types";

/**
 * Adaptive bucket count: ~6 bars/second of audio, clamped so short clips
 * still look like a wave (≥180) and long tracks don't explode the DOM cost
 * (≤1200 — well beyond what a 390px mobile canvas can resolve anyway).
 */
export function bucketCountFor(durationSec: number): number {
  if (!isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.max(180, Math.min(1200, Math.round(durationSec * 6)));
}

/**
 * Compute normalized peaks from decoded PCM channel data.
 * channels: one Float32Array per channel (any count ≥ 1 — mono-mixed by max).
 * Returns Float32Array(bucketCount) with values in 0..1, or null when the
 * input is unusable (no channels / zero samples).
 */
export function computePeaks(
  channels: Float32Array[],
  bucketCount: number,
): Float32Array | null {
  if (!channels.length || bucketCount <= 0) return null;
  let total = 0;
  for (const c of channels) total += c.length;
  if (total === 0) return null;

  const peaks = new Float32Array(bucketCount);
  const primary = channels[0];
  const samplesPerBucket = primary.length / bucketCount;

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(Math.floor((b + 1) * samplesPerBucket), primary.length);
    let max = 0;
    // Mono-mix across channels by taking the loudest channel's peak.
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const v = ch[i] < 0 ? -ch[i] : ch[i];
        if (v > max) max = v;
        if (max >= 1) break;
      }
      if (max >= 1) break;
    }
    peaks[b] = max > 1 ? 1 : max;
  }
  return peaks;
}

/**
 * Rebucket an existing peaks array to a different bucket count (adaptive
 * re-downsampling for renderer density changes). Never invents energy:
 * a target bucket's value is the MAX of the source buckets it covers.
 */
export function rebucketPeaks(
  peaks: Float32Array,
  targetCount: number,
): Float32Array {
  if (!peaks.length || targetCount <= 0) return new Float32Array(0);
  if (targetCount === peaks.length) return peaks;
  const out = new Float32Array(targetCount);
  const ratio = peaks.length / targetCount;
  for (let b = 0; b < targetCount; b++) {
    const start = Math.floor(b * ratio);
    const end = Math.max(start + 1, Math.floor((b + 1) * ratio));
    let max = 0;
    for (let i = start; i < end && i < peaks.length; i++) {
      if (peaks[i] > max) max = peaks[i];
    }
    out[b] = max;
  }
  return out;
}

/** Cache key: trackId + audioFingerprint + waveformVersion (spec §6). */
export function waveformKey(trackId: string, fingerprint: string): string {
  return `${trackId}|${fingerprint}|v${WAVEFORM_VERSION}`;
}

/**
 * Audio fingerprint — identity of the AUDIO (not the track entity).
 * Duration (0.1s resolution) is the material signal: a different cut/edit
 * or a materially different source file changes it. Key consistency across
 * generator/controller/sampler is guaranteed because every site knows the
 * duration. Algorithm changes invalidate via WAVEFORM_VERSION instead.
 */
export function waveformFingerprint(opts: { durationSec: number }): string {
  return String(Math.round((opts.durationSec || 0) * 10) / 10);
}

/** Merge two peak arrays of the SAME length: per-bucket max. Used by the
 *  live sampler to grow a partial waveform across sessions. */
export function mergePeaks(a: Float32Array, b: Float32Array): Float32Array {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const av = i < a.length ? a[i] : 0;
    const bv = i < b.length ? b[i] : 0;
    out[i] = av > bv ? av : bv;
  }
  return out;
}

/** Fraction of buckets with real (non-zero) data — coverage metric. */
export function coverageOf(peaks: Float32Array): number {
  if (!peaks.length) return 0;
  let known = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > 0) known++;
  return known / peaks.length;
}

// ─── Renderer mapping helpers (pure — unit tested) ──────────────────────────

/** x position (px) → time (s), clamped to [0, duration]. */
export function xToTime(x: number, width: number, durationSec: number): number {
  if (width <= 0 || durationSec <= 0) return 0;
  const p = Math.max(0, Math.min(1, x / width));
  return p * durationSec;
}

/** time (s) → x position (px). */
export function timeToX(time: number, width: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const p = Math.max(0, Math.min(1, time / durationSec));
  return p * width;
}

/** Bucket index covering a given time. */
export function bucketIndexForTime(timeSec: number, durationSec: number, bucketCount: number): number {
  if (durationSec <= 0 || bucketCount <= 0) return 0;
  const idx = Math.floor((timeSec / durationSec) * bucketCount);
  return Math.max(0, Math.min(bucketCount - 1, idx));
}

/** Peak amplitude to render for a bucket: value at bucket, but a bucket that
 *  has no live-sampled data yet (0 with partial coverage) renders as a small
 *  placeholder dot, not a full bar — honest "not yet heard" visualization. */
export function bucketDisplayValue(
  peaks: Float32Array,
  idx: number,
  opts: { complete: boolean; placeholder?: number },
): number {
  const v = peaks[idx] ?? 0;
  if (v > 0) return v;
  if (opts.complete) return 0; // decoded full file: true silence renders flat
  return opts.placeholder ?? 0.06; // unknown region: subtle placeholder
}
