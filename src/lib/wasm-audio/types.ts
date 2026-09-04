/**
 * MQ WASM Audio Engine — public types.
 *
 * The Rust/WASM backend replaces the HTMLMediaElement decode+DSP path for
 * progressive non-DRM streams. Everything else (DRM, HLS, MediaSession,
 * queue, store) stays on the existing element path (fallback §35.22).
 */

/** Mirrors `version.json` written by scripts/build-audio-engine.sh. */
export interface AudioEngineManifest {
  tag: string;
  core: string;
  codec: string;
  worklet: string;
  worker: string;
  coreBytes: number;
  codecBytes: number;
  builtAt: string;
  simd: boolean;
}

/**
 * ABI contract between this TS bootstrap and the wasm modules.
 * MUST match `MQ_ABI_VERSION` in audio-engine/crates/{audio-wasm,codec-wasm}.
 * A mismatch → WASM_VERSION_MISMATCH → refuse to start (§35.9).
 */
export const EXPECTED_WASM_ABI = 3;

/** Stats published by the worklet ~10 Hz (EngineStatsLayout in audio-wasm). */
export interface WasmEngineStats {
  playheadFrames: number;
  bufferedFrames: number;
  underruns: number;
  overruns: number;
  blocksProcessed: number;
  avgProcessNs: number;
  maxProcessNs: number;
  lastProcessNs: number;
  peak: number;
  rms: number;
  lufsShort: number;
  lufsIntegrated: number;
  gainReductionDb: number;
  truePeakDb: number;
}

/** Diagnostics state (§35.18) — `window.__mqWasmAudio`, silent in prod. */
export interface WasmAudioDiagnostics {
  active: boolean;
  backend: "wasm" | "element";
  tag: string;
  abiVersion: number | null;
  simd: boolean;
  contentSampleRate: number | null;
  contextSampleRate: number | null;
  channels: number | null;
  framesProcessed: number;
  bufferLevel: number;
  underruns: number;
  overruns: number;
  avgProcessNs: number;
  p95ProcessNs: number;
  maxProcessNs: number;
  lastProcessNs: number;
  /** Live windowed RMS of the post-DSP output (0..1) — proof of real signal. */
  rms: number;
  /** Latched sample peak of the post-DSP output (0..1). */
  peak: number;
  /** Limiter/compressor gain reduction (dB, 0 = none). */
  gainReductionDb: number;
  /** True-peak estimate (dBFS). */
  truePeakDb: number;
  /** Short-term LUFS. */
  lufsShort: number;
  totalBytes: number | null;
  supportsRange: boolean;
  lastError: string | null;
  lastEventAt: string | null;
}

/** Pure decision input — testable without a browser (see decide.test.ts). */
export interface WasmDecisionInput {
  enabled: boolean;
  isHls: boolean;
  isEncrypted: boolean;
  source: string;
  playbackRate: number;
  workletSupported: boolean;
  wasmSupported: boolean;
  fetchSupported: boolean;
}
