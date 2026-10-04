/**
 * Waveform domain types.
 *
 * Pipeline (spec §5): Audio → analyser/decode → downsample → waveform data
 * → cache → renderer. Everything the renderer needs is in `WaveformData`.
 */

/** Bump when the peaks algorithm changes — old cache entries are ignored. */
export const WAVEFORM_VERSION = 1;

/** One cached waveform. `peaks` are normalized 0..1 per-bucket amplitudes. */
export interface WaveformData {
  /** Cache key: `${trackId}|${fingerprint}|v${WAVEFORM_VERSION}`. */
  key: string;
  trackId: string;
  version: number;
  /** Audio identity: duration (+ protocol/quality when known). Changing
   *  audio (different file/quality) → different fingerprint → fresh peaks. */
  fingerprint: string;
  bucketCount: number;
  durationSec: number;
  peaks: Float32Array;
  /** 0..1 — fraction of buckets backed by REAL audio data. Decoded full
   *  files = 1; progressively live-sampled (HLS/DRM) tracks grow toward 1. */
  coverage: number;
  /** true = computed by decoding the complete file (exact, immutable). */
  complete: boolean;
  updatedAt: number;
}

export type WaveformStatus = "idle" | "loading" | "ready" | "unavailable";

export interface WaveformSnapshot {
  status: WaveformStatus;
  data: WaveformData | null;
}

/** Why full-file decoding is impossible for a track (live sampling still OK). */
export type WaveformDecodeBlock =
  | "drm"        // encrypted HLS — bytes unavailable outside EME
  | "hls"        // plain HLS — would need full segment assembly
  | "snippet"    // source serves only a preview snippet
  | "expired"    // local blob URL gone after reload
  | "no-url";    // no resolvable source URL at all
