"use client";

/**
 * WaveformController — mounted ONCE in AppShell. Keeps the live sampler
 * attached to whatever track is actually playing, so undecodable tracks
 * (DRM-HLS / HLS / snippets) accumulate a REAL partial waveform even when
 * no waveform view is open. Decodable tracks are harmless: their sampler
 * data is superseded by the exact decoded peaks (complete cache entries are
 * immutable) and upgraded on first decode.
 *
 * Zero renders on playback progress — a plain store subscription.
 */

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { startLiveSampling, stopLiveSampling } from "@/lib/waveform/liveSampler";
import { waveformFingerprint } from "@/lib/waveform/computePeaks";

export function WaveformController() {
  useEffect(() => {
    let lastKey = "";
    const apply = (trackId: string | undefined, duration: number) => {
      if (!trackId || duration <= 0) {
        if (lastKey) {
          stopLiveSampling();
          lastKey = "";
        }
        return;
      }
      const fingerprint = waveformFingerprint({ durationSec: duration });
      const key = `${trackId}|${fingerprint}`;
      if (key === lastKey) return;
      startLiveSampling({ trackId, fingerprint, durationSec: duration });
      lastKey = key;
    };

    // Initial state
    const st0 = useAppStore.getState();
    apply(st0.currentTrack?.id, st0.currentTrack?.duration || st0.duration || 0);

    // Track changes AND duration discoveries (metadata may start at 0 and
    // be corrected by the engine once the stream loads).
    const unsub = useAppStore.subscribe((state, prev) => {
      const id = state.currentTrack?.id;
      const pid = prev.currentTrack?.id;
      const dur = state.currentTrack?.duration || state.duration || 0;
      const pdur = prev.currentTrack?.duration || prev.duration || 0;
      if (id !== pid || Math.round(dur) !== Math.round(pdur)) {
        apply(id, dur);
      }
    });

    return () => {
      unsub();
      stopLiveSampling();
    };
  }, []);

  return null;
}
