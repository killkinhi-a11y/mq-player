/**
 * MQ Wave — pure personalized radio engine (§2).
 * Barrel: re-export the public surface.
 */

export type {
  WaveSeed,
  WaveSeedKind,
  WaveReason,
  WaveEvent,
  WaveEventType,
  SkipStrength,
  TasteLayer,
  WaveProfile,
  WaveProfileInput,
  CandidateChannel,
  WaveTrackMinimal,
  WaveCandidate,
  ScoredCandidate,
  WaveEngineMeta,
  WaveEngineResult,
  WaveMemory,
  WaveMemoryEntry,
  WaveQueueItem,
  WaveSessionState,
  WaveSignals,
} from "./types";

export { WAVE_CONFIG, mergeWaveConfig } from "./config";
export type { WaveConfig } from "./config";

export { createRng, hashStringToSeed, resolveRandomSeed } from "./rng";
export type { WaveRng } from "./rng";

export {
  classifySkip,
  eventSignal,
  isRealSkip,
  isReplay,
  listenedFraction,
  SIGNAL_EVENTS,
} from "./events";

export {
  buildWaveProfile,
  buildSessionLayer,
  applySessionEvent,
  mergedAffinity,
  layerWeights,
  detectLanguageFromTracks,
  normArtist,
  normGenre,
  clampAffinity,
} from "./profile";

export {
  createWaveMemory,
  pruneWaveMemory,
  rememberWaveTrack,
  rememberWaveSeed,
  artistAppearanceCount,
  isRecentlyPlayedTrack,
  memoryToSignals,
} from "./memory";

export {
  scoreCandidate,
  effectiveExplorationRate,
} from "./scoring";

export {
  hardFilter,
  selectDiverseBatch,
} from "./diversity";

export {
  getWaveRecommendations,
  dedupCandidates,
  buildWaveProfile as buildProfile,
} from "./engine";

export {
  needsRefill,
  enqueueWaveBatch,
  shiftWaveQueue,
  consumeWaveItem,
  pendingForPlaybackQueue,
} from "./queue";

export { waveReasonText, waveSeedLabel } from "./reasons";
