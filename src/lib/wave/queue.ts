/**
 * Wave Queue Manager — client-side logical queue (§12, §13, §24).
 *
 * The Wave queue is LOGICALLY separate from the user's playback queue:
 *   • waveQueue holds ranked candidates + reasons (the Wave UI source);
 *   • wave items are APPENDED to the playback queue only when needed;
 *   • the user's upNext always has priority (store's nextTrack already
 *     drains upNext first — we never bypass it).
 *
 * Pure helpers: the store holds state, these functions compute the next
 * state (immutable outputs, testable without React).
 */

import type {
  ScoredCandidate,
  WaveMemory,
  WaveQueueItem,
  WaveTrackMinimal,
} from "./types";
import type { WaveConfig } from "./config";
import { rememberWaveTrack } from "./memory";

/** True when the wave queue is running low and a refill should start. */
export function needsRefill<T extends WaveTrackMinimal>(
  queue: WaveQueueItem<T>[],
  config: WaveConfig,
): boolean {
  return queue.length < config.queue.minBuffer;
}

/**
 * Enqueue a scored batch into the logical wave queue, deduplicated against
 * everything already queued (by track id). Returns a NEW array (capped at
 * config.queue.maxQueueSize).
 */
export function enqueueWaveBatch<T extends WaveTrackMinimal>(
  queue: WaveQueueItem<T>[],
  batch: ScoredCandidate<T>[],
  config: WaveConfig,
  now: number = Date.now(),
): WaveQueueItem<T>[] {
  const existing = new Set(queue.map((q) => q.track.id));
  const additions: WaveQueueItem<T>[] = [];
  for (const c of batch) {
    if (existing.has(c.track.id)) continue;
    existing.add(c.track.id);
    additions.push({
      track: c.track,
      reason: c.reason,
      seedRef: c.seedRef,
      enqueuedAt: now,
    });
    if (queue.length + additions.length >= config.queue.maxQueueSize) break;
  }
  return [...queue, ...additions];
}

/** Pop the next wave item (head). Returns null when empty. */
export function shiftWaveQueue<T extends WaveTrackMinimal>(
  queue: WaveQueueItem<T>[],
): { item: WaveQueueItem<T>; rest: WaveQueueItem<T>[] } | null {
  if (queue.length === 0) return null;
  const [item, ...rest] = queue;
  return { item, rest };
}

/**
 * Consume a wave item: pop it AND record it in wave memory (fatigue input).
 * The UI "Следующие треки" reads the rest.
 */
export function consumeWaveItem<T extends WaveTrackMinimal>(
  queue: WaveQueueItem<T>[],
  memory: WaveMemory,
  config: WaveConfig,
  now: number = Date.now(),
): { item: WaveQueueItem<T>; queue: WaveQueueItem<T>[]; memory: WaveMemory } | null {
  const shifted = shiftWaveQueue(queue);
  if (!shifted) return null;
  return {
    item: shifted.item,
    queue: shifted.rest,
    memory: rememberWaveTrack(memory, shifted.item.track, now, config),
  };
}

/**
 * Which wave items are NOT yet in the playback queue — the delta the hook
 * appends after a refill. Keeps the playback queue and the logical wave
 * queue in sync without duplicating entries.
 */
export function pendingForPlaybackQueue<T extends WaveTrackMinimal>(
  waveQueue: WaveQueueItem<T>[],
  playbackQueue: T[],
): T[] {
  const inPlayback = new Set(playbackQueue.map((t) => t.id));
  return waveQueue
    .filter((q) => !inPlayback.has(q.track.id))
    .map((q) => q.track);
}

export { rememberWaveTrack };
