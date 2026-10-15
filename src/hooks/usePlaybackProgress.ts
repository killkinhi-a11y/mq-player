"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { subscribeClock } from "@/lib/playback/clock";
import { currentPlaybackPosition } from "@/lib/wasm-audio";

/**
 * usePlaybackProgress — ticking playback position for surfaces that show
 * time (PlayerBar, WaveHome, MobileNowHero).
 *
 * P0 FIX (stuck 0:00): those surfaces previously read `s.progress` from the
 * store, but NOTHING updates that field during playback — it is only a
 * seek/drag COMMAND channel (setProgress is called on seek, reset to 0 on
 * track start). The ticking truth lives in the unified PlaybackClock
 * (subscribeClock → currentPlaybackPosition), which the Full Player already
 * rides. This hook subscribes to the SAME clock (§13/§27: one timer, no
 * private loops) and mirrors the position into throttled React state.
 *
 * Contract:
 *  - on mount / track change → immediately reflects the real engine position
 *    (0 right after «next», restored position after a remount while paused);
 *  - while playing → updates at most every `throttleMs`;
 *  - while paused → frozen at the paused position (the clock's own
 *    paused-poll wakes it on external seeks).
 */

function safePosition(): number {
  try {
    const pos = currentPlaybackPosition();
    return Number.isFinite(pos) && pos >= 0 ? pos : 0;
  } catch {
    return 0;
  }
}

export function usePlaybackProgress(throttleMs = 250): number {
  const trackId = useAppStore((s) => s.currentTrack?.id ?? null);
  // The last-seen track id lives INSIDE the state object (the official
  // "storing information from previous renders" pattern — no refs touched
  // during render, which the react-hooks/refs rule forbids).
  const [state, setState] = useState<{ trackId: string | null; pos: number }>(
    () => ({ trackId, pos: safePosition() }),
  );

  // Track change → re-read the engine position immediately (adjust-state-
  // during-render: guarded, idempotent; React discards this render pass and
  // re-renders with the fresh value before commit).
  if (state.trackId !== trackId) {
    setState({ trackId, pos: safePosition() });
  }

  useEffect(() => {
    // One subscription for the component's whole life (throttle stays the
    // consumer's choice; changing it mid-flight is not a use case). The
    // track id is read from the store inside the callback so the closure
    // never goes stale.
    const off = subscribeClock(
      (p) => {
        if (!Number.isFinite(p) || p < 0) return;
        setState({
          trackId: useAppStore.getState().currentTrack?.id ?? null,
          pos: p,
        });
      },
      { throttleMs },
    );
    return off;
  }, [throttleMs]);

  return state.pos;
}
