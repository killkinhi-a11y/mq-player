/**
 * Pure queue rules shared by web and Android.
 *
 * Kotlin twin: android/app/src/main/kotlin/com/mq1/player/player/QueueRules.kt.
 * Both run the golden cases in shared/test-fixtures/queue.cases.json — change a
 * rule here only together with the Kotlin twin and the fixture.
 *
 * Semantics (linear order; shuffle order is platform-specific, see docs below):
 *  - manual Next / auto-advance go to index+1; at the end: repeat "all" wraps
 *    to 0, otherwise there is no next (null — caller stops / refills radio).
 *  - repeat "one": auto-advance (track ended) replays the same index; a manual
 *    Next still advances (same as Media3 seekToNextMediaItem).
 *  - broken tracks are skipped in the same direction; with repeat "off" the
 *    skip never wraps past the end.
 *  - Previous: >3 s into the track → restart; else index-1; at index 0 →
 *    wraps to the last item only with repeat "all", otherwise restarts.
 *  - "Play next" is FIFO: several play-next items play in the order added.
 *  - Persisted queue is a window of at most `max` items that always contains
 *    the current item; the restored index points at the current track.
 *
 * Shuffle: web picks a random item (smart-shuffle avoids the same artist);
 * Android uses Media3's shuffle permutation. Shared guarantees: shuffle never
 * re-picks the current item when another exists, upNext / play-next items
 * still play first, and repeat semantics are unchanged.
 */

export type RepeatMode = "off" | "all" | "one";

export const PREVIOUS_RESTART_THRESHOLD_SEC = 3;
export const PERSIST_QUEUE_MAX = 50;
export const PERSIST_QUEUE_LOOKBEHIND = 10;

type IsBroken = (index: number) => boolean;
const none: IsBroken = () => false;

/** Next index for a manual Next (or auto-advance with repeat ≠ "one"). */
export function nextIndex(
  length: number,
  index: number,
  repeat: RepeatMode,
  isBroken: IsBroken = none,
): number | null {
  if (length <= 0) return null;
  let i = index;
  for (let step = 0; step < length; step++) {
    i += 1;
    if (i >= length) {
      if (repeat !== "all") return null;
      i = 0;
    }
    if (i === index && step > 0) return null; // full loop, everything else broken
    if (!isBroken(i)) return i;
  }
  return null;
}

/** Index to play when the current track ends on its own. */
export function autoAdvanceIndex(
  length: number,
  index: number,
  repeat: RepeatMode,
  isBroken: IsBroken = none,
): number | null {
  if (repeat === "one" && index >= 0 && index < length && !isBroken(index)) return index;
  return nextIndex(length, index, repeat === "one" ? "off" : repeat, isBroken);
}

export type PreviousAction = { type: "restart" } | { type: "go"; index: number };

export function previousAction(
  length: number,
  index: number,
  repeat: RepeatMode,
  progressSec: number,
): PreviousAction {
  if (progressSec > PREVIOUS_RESTART_THRESHOLD_SEC || length <= 0) return { type: "restart" };
  if (index - 1 >= 0) return { type: "go", index: index - 1 };
  if (repeat === "all" && length > 1) return { type: "go", index: length - 1 };
  return { type: "restart" };
}

/** Where a "play next" item goes so that several play-next items stay FIFO. */
export function playNextInsertIndex(currentIndex: number, pendingPlayNext: number): number {
  return Math.max(0, currentIndex + 1 + Math.max(0, pendingPlayNext));
}

/** Pending play-next counter after a transition old → new index. */
export function pendingAfterTransition(pending: number, oldIndex: number, newIndex: number): number {
  return newIndex === oldIndex + 1 ? Math.max(0, pending - 1) : 0;
}

/**
 * Web upNext consumption: the first non-broken upNext item is inserted right
 * after the current item and becomes current; the rest of upNext stays queued
 * (FIFO) and the main queue continues after it.
 */
export function consumeUpNext<T>(
  queue: readonly T[],
  index: number,
  upNext: readonly T[],
  isBrokenItem: (t: T) => boolean = () => false,
): { queue: T[]; index: number; upNext: T[]; track: T } | null {
  const pick = upNext.findIndex((t) => !isBrokenItem(t));
  if (pick < 0) return null;
  const track = upNext[pick];
  const insertAt = Math.min(Math.max(index + 1, 0), queue.length);
  const nextQueue = [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)];
  return { queue: nextQueue, index: insertAt, upNext: upNext.slice(pick + 1), track };
}

/** Current index after moving an item from → to (web moveInQueue / Android moveQueueItem). */
export function indexAfterMove(from: number, to: number, current: number): number {
  if (from === current) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/** Current index after removing `removed` (-1 when the queue becomes empty). */
export function indexAfterRemove(removed: number, current: number, length: number): number {
  const newLength = length - 1;
  if (newLength <= 0) return -1;
  if (removed < current) return current - 1;
  if (removed === current) return Math.min(current, newLength - 1);
  return current;
}

/** Window persisted to storage: ≤ max items, always containing the current one. */
export function persistWindow<T>(
  queue: readonly T[],
  index: number,
  max: number = PERSIST_QUEUE_MAX,
  lookBehind: number = PERSIST_QUEUE_LOOKBEHIND,
): { queue: T[]; index: number } {
  const safeIndex = queue.length === 0 ? 0 : Math.min(Math.max(index, 0), queue.length - 1);
  if (queue.length <= max) return { queue: [...queue], index: safeIndex };
  const start = Math.min(Math.max(safeIndex - lookBehind, 0), queue.length - max);
  return { queue: queue.slice(start, start + max), index: safeIndex - start };
}

/** Index to restore: prefers the persisted index if it still holds the current track. */
export function restoreIndex(ids: readonly string[], index: number, currentId: string | null): number {
  if (ids.length === 0) return 0;
  if (currentId == null) return Math.min(Math.max(index, 0), ids.length - 1);
  if (ids[index] === currentId) return index;
  const found = ids.indexOf(currentId);
  if (found >= 0) return found;
  return Math.min(Math.max(index, 0), ids.length - 1);
}

/** Media3 Player.REPEAT_MODE_* values (OFF=0, ONE=1, ALL=2). */
export function repeatToMedia3(mode: RepeatMode): 0 | 1 | 2 {
  return mode === "one" ? 1 : mode === "all" ? 2 : 0;
}

export function repeatFromMedia3(mode: number): RepeatMode {
  return mode === 1 ? "one" : mode === 2 ? "all" : "off";
}
