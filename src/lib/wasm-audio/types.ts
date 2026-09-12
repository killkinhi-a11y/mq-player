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
  /** v2: frames within the CURRENT track (gapless boundary-relative). */
  trackOffsetFrames: number;
  /** v2: current track index in the boundary map. */
  trackIndex: number;
  /** v2: current track id (from the SEEK/trackStart protocol). */
  trackId: string | null;
  /** v2: realtime view of the engine state (ST enum in the worklet). */
  engineState: number;
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

/** v2 lifecycle states (authoritative machine lives in the backend). */
export const ENGINE_LIFECYCLE = [
  "IDLE",
  "LOADING",
  "PRIMING",
  "PLAYING",
  "SEEKING",
  "STARVED",
  "RECOVERING",
  "PAUSED",
  "ENDED",
  "ERROR",
] as const;
export type EngineLifecycle = (typeof ENGINE_LIFECYCLE)[number];

/** v2 worklet realtime state enum (published in stats.engineState). */
export const WORKLET_STATE = {
  IDLE: 0, LOADING: 1, PLAYING: 2, PAUSED: 3, STARVED: 4, ENDED: 5, SEEKING: 6,
} as const;

/** v2 next-track continuation status (prefetch pipeline telemetry). */
export interface NextTrackStatus {
  trackId: string;
  gapless: boolean;
  sampleRate?: number;
  queuedFrames?: number;
  reason?: string;
}

/** v2 PCM health snapshot from the worker validator (A11). */
export interface AudioHealth {
  nanInf: number;
  maxAbs: number;
  maxDelta: number;
  dcOffset: number;
  zeroRunMax: number;
  violations: number;
  framesScanned: number;
  chunksScanned: number;
}

/** v2 adaptive controller snapshot (A7/A10 — explainable decisions). */
export interface ControllerSnapshot {
  netEwmaBps: number;
  decodeEwmaFps: number;
  targetSec: number;
  starvedMs: number;
  decisions: Array<{ t: number; decision: string; inputs: number; reason: string }>;
}

/** v2 benchmark timeline event (A12). */
export interface BenchEvent {
  t: number;
  k: string;
  d?: number | string | boolean;
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
  /** v2: authoritative backend lifecycle state. */
  lifecycle: string;
  /** v2: realtime worklet state (numeric). */
  engineState: number;
  /** v2: current track id per the boundary protocol. */
  currentTrackId: string | null;
  /** v2: next-track continuation status. */
  next: NextTrackStatus | null;
  /** v2: session generation (loads + seeks). */
  generation: number;
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
