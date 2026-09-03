/**
 * Pure capability decision — should this track go through the WASM backend?
 *
 * Rules (architecture doc §6 + §35.15):
 *  - DRM (Widevine/FairPlay) → NEVER (CDM decrypts inside the media element).
 *  - HLS non-DRM → stays on the hls.js element path (v1 — WASM would need
 *    its own HLS client; DSP-insert mode is future work).
 *  - playbackRate ≠ 1 → element path (the engine's rate only advances the
 *    playhead; true time-stretch is not implemented — honest routing).
 *  - Missing browser APIs (AudioWorklet / WebAssembly / fetch+ReadableStream)
 *    → element path.
 *  - demo / audius / soundcloud PROGRESSIVE non-DRM → WASM path.
 *
 * Unknown sources default to element (conservative).
 */
import type { WasmDecisionInput } from "./types";

export function shouldUseWasmBackend(input: WasmDecisionInput): boolean {
  if (!input.enabled) return false;
  if (input.isEncrypted) return false;
  if (input.isHls) return false;
  if (Math.abs(input.playbackRate - 1) > 1e-6) return false;
  if (!input.workletSupported) return false;
  if (!input.wasmSupported) return false;
  if (!input.fetchSupported) return false;
  switch (input.source) {
    case "demo":
    case "audius":
    case "soundcloud":
      return true;
    default:
      return false;
  }
}

/** Browser capability probe (guarded for SSR). */
export function probeWasmCapabilities(): {
  workletSupported: boolean;
  wasmSupported: boolean;
  fetchSupported: boolean;
} {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return { workletSupported: false, wasmSupported: false, fetchSupported: false };
  }
  const workletSupported =
    typeof AudioWorkletNode !== "undefined" &&
    !!AudioContext.prototype &&
    "audioWorklet" in AudioContext.prototype;
  const wasmSupported = typeof WebAssembly !== "undefined" && !!WebAssembly.compile;
  const fetchSupported =
    typeof fetch !== "undefined" &&
    typeof ReadableStream !== "undefined";
  return { workletSupported, wasmSupported, fetchSupported };
}

/**
 * Byte offset estimate for a seek (§35.14):
 *   byte = seconds / duration × totalBytes.
 * CBR approximation — the mp3 decoder resyncs at the next frame header, so
 * the landing error is bounded by ~1-2 s worst case for VBR files.
 */
export function estimateSeekByte(
  seconds: number,
  durationSec: number,
  totalBytes: number
): number {
  if (!isFinite(seconds) || !isFinite(durationSec) || durationSec <= 0) return 0;
  if (!totalBytes || totalBytes <= 0) return 0;
  const frac = Math.max(0, Math.min(0.999, seconds / durationSec));
  return Math.min(totalBytes - 1, Math.round(frac * totalBytes));
}
