/**
 * Diagnostics state (§35.18): `window.__mqWasmAudio`.
 * State object only — NO console logging in production. Provable from
 * DevTools / automation, silent for users.
 */
import type { WasmAudioDiagnostics } from "./types";

const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;

export const wasmDiagnostics: WasmAudioDiagnostics = {
  active: false,
  backend: "element",
  tag: "",
  abiVersion: null,
  simd: false,
  contentSampleRate: null,
  contextSampleRate: null,
  channels: null,
  framesProcessed: 0,
  bufferLevel: 0,
  underruns: 0,
  overruns: 0,
  avgProcessNs: 0,
  p95ProcessNs: 0,
  maxProcessNs: 0,
  lastProcessNs: 0,
  rms: 0,
  peak: 0,
  gainReductionDb: 0,
  truePeakDb: 0,
  lufsShort: 0,
  totalBytes: null,
  supportsRange: false,
  lastError: null,
  lastEventAt: null,
};

if (win) {
  win.__mqWasmAudio = wasmDiagnostics;
  // Also expose a small perf window for p95 estimation (ring of last N).
  (wasmDiagnostics as WasmAudioDiagnostics & { _nsWindow?: number[] })._nsWindow = [];
}

export function markDiag(patch: Partial<WasmAudioDiagnostics>): void {
  Object.assign(wasmDiagnostics, patch);
  wasmDiagnostics.lastEventAt = new Date().toISOString();
}

/** Reset per-track counters (meters, underruns) on a new track load. */
export function resetDiagTrackCounters(): void {
  wasmDiagnostics.rms = 0;
  wasmDiagnostics.peak = 0;
  wasmDiagnostics.gainReductionDb = 0;
  wasmDiagnostics.truePeakDb = 0;
  wasmDiagnostics.lufsShort = 0;
  wasmDiagnostics.underruns = 0;
  wasmDiagnostics.overruns = 0;
}

/** Track DSP time samples for p95 (called on each stats message). */
export function pushProcessNsSample(ns: number): void {
  const holder = wasmDiagnostics as WasmAudioDiagnostics & { _nsWindow?: number[] };
  if (!holder._nsWindow) holder._nsWindow = [];
  const w = holder._nsWindow;
  w.push(ns);
  if (w.length > 300) w.shift();
  if (w.length >= 20) {
    const sorted = [...w].sort((a, b) => a - b);
    wasmDiagnostics.p95ProcessNs = sorted[Math.floor(sorted.length * 0.95)] || 0;
  }
}
