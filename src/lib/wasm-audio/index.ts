/**
 * MQ WASM Audio Engine — public surface.
 */
export * from "./types";
export {
  shouldUseWasmBackend,
  probeWasmCapabilities,
  estimateSeekByte,
} from "./decide";
export { fetchAudioEngineManifest, assetUrl, resetManifestCache } from "./manifest";
export {
  createWasmBackend,
  getActiveWasmBackend,
  isWasmActive,
  isWasmUnsupported,
  getWasmDiagnostics,
  pauseElementAudio,
  seekPlayback,
  currentPlaybackPosition,
  warmUpWasmEngine,
  OP,
  PARAM,
  sendDspCommand,
  applyEqToWasm,
  applyLimiterToWasm,
  applySpatialToWasm,
} from "./WasmAudioBackend";
export type { WasmLoadOptions, WasmBackendCallbacks, DspSnapshot } from "./WasmAudioBackend";
export { WasmAudioBackend } from "./WasmAudioBackend";
export { wasmDiagnostics, markDiag, pushProcessNsSample } from "./diagnostics";
