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
  WaveRelevanceDebug,
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
  computeSkipStreak,
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
  isAdjacentToUserGenre,
  reasonSeedRef,
} from "./scoring";

export {
  hardFilter,
  selectDiverseBatch,
} from "./diversity";

/* V2 (PART 6-8): cultural clusters + the FINAL RELEVANCE GATE. */
export {
  detectCulturalCluster,
  trackCluster,
  countClusterAffinity,
  DEFAULT_CULTURAL_SPACE,
} from "./clusters";
export type { CulturalClusterId } from "./clusters";
export {
  evaluateRelevance,
  applyRelevanceGate,
  profileRichness,
  isOwnCluster,
} from "./relevance";
export type { GateContext, GateVerdict, GateResult } from "./relevance";

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
