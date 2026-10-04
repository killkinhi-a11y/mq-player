/**
 * Wave listening-event pipeline (§4, §11).
 *
 * Events are classified by LISTENING DEPTH, not by the bare fact that the
 * user moved on: a skip at 80% is not a skip at 5%. Classification feeds
 * the session taste layer immediately (real-time personalization) and is
 * shipped to /api/wave/feedback.
 */

import type { SkipStrength, WaveEvent, WaveEventType } from "./types";
import type { WaveConfig } from "./config";

/**
 * Fraction of a track that was actually listened to.
 * Returns 0 when duration is unknown/invalid (treat as "no signal",
 * callers decide what that means).
 */
export function listenedFraction(position: number | undefined, duration: number | undefined): number | null {
  if (typeof position !== "number" || typeof duration !== "number") return null;
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(1, Math.max(0, position / duration));
}

/**
 * Classify a skip by listening depth (§4):
 *   < 10%  → strong_negative   (instant rejection)
 *   10–30% → negative
 *   30–70% → neutral           (slightly positive — they gave it a chance)
 *   70–95% → positive          (they almost finished it)
 *   95%+   → strong_positive   (NOT a real skip — the track effectively completed)
 *
 * Returns null when listening depth cannot be measured.
 */
export function classifySkip(position: number | undefined, duration: number | undefined, config: WaveConfig): SkipStrength | null {
  const f = listenedFraction(position, duration);
  if (f === null) return null;
  const { skipStrongNegativeThreshold, skipNegativeThreshold, skipNeutralThreshold, skipPositiveThreshold } = config.feedback;
  if (f < skipStrongNegativeThreshold) return "strong_negative";
  if (f < skipNegativeThreshold) return "negative";
  if (f < skipNeutralThreshold) return "neutral";
  if (f < skipPositiveThreshold) return "positive";
  return "strong_positive";
}

/** Is this skip "real" (user rejected the track) vs. a natural transition? */
export function isRealSkip(event: WaveEvent, config: WaveConfig): boolean {
  if (event.type !== "track_skipped") return false;
  const strength = classifySkip(event.position, event.duration, config);
  return strength !== null && strength !== "strong_positive";
}

/**
 * Signed signal strength an event contributes to the session taste layer
 * (positive = affinity, negative = aversion), or null for events that
 * carry no taste signal (wave_started etc.).
 */
export function eventSignal(
  event: WaveEvent,
  config: WaveConfig,
): { strength: number; kind: "positive" | "negative" } | null {
  const s = config.feedback.signal;
  switch (event.type) {
    case "track_skipped": {
      const strength = classifySkip(event.position, event.duration, config);
      if (!strength) return null;
      if (strength === "strong_negative") return { strength: s.skipStrongNegative, kind: "negative" };
      if (strength === "negative") return { strength: s.skipNegative, kind: "negative" };
      if (strength === "neutral") return { strength: s.skipNeutral, kind: "positive" };
      // positive / strong_positive: nearly finished → mild positive signal
      return { strength: s.skipPositive, kind: "positive" };
    }
    case "play_completed":
      return { strength: s.completed, kind: "positive" };
    case "track_replayed":
      return { strength: s.replayed, kind: "positive" };
    case "track_liked":
      return { strength: s.liked, kind: "positive" };
    case "track_unliked":
      return { strength: s.unliked, kind: "negative" };
    case "track_added_to_playlist":
      return { strength: s.addedToPlaylist, kind: "positive" };
    case "track_added_to_queue":
      return { strength: s.addedToQueue, kind: "positive" };
    case "more_like_this":
      return { strength: s.moreLikeThis, kind: "positive" };
    case "less_like_this":
    case "not_interested":
      return { strength: s.lessLikeThis, kind: "negative" };
    default:
      // play_started / play_progress / wave_started / wave_seed_changed —
      // context events, no taste signal.
      return null;
  }
}

/** All event types that carry a taste signal (used for tests + UI badges). */
export const SIGNAL_EVENTS: ReadonlySet<WaveEventType> = new Set<WaveEventType>([
  "track_skipped",
  "play_completed",
  "track_replayed",
  "track_liked",
  "track_unliked",
  "track_added_to_playlist",
  "track_added_to_queue",
  "more_like_this",
  "less_like_this",
  "not_interested",
]);

/**
 * Detect a replay: the same track started again shortly after it was
 * playing (store's prevTrack-with-progress<3s case, or manual restart).
 * Exposed as a helper so the client store can emit `track_replayed`
 * instead of a plain `play_started` for repeats.
 */
export function isReplay(trackId: string, previous: { trackId: string; endedAt: number; completed: boolean } | null, now: number): boolean {
  if (!previous || previous.trackId !== trackId) return false;
  // Same track restarted within 15 min of its last play = replay.
  return now - previous.endedAt < 15 * 60 * 1000;
}
