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
      // Spotify Official owns the audio (DRM sandbox) — there is NO element
      // signal to sample. Skip the loop entirely: the wave renders its
      // honest state-driven slim track for SDK playback (no fake waveform).
      if (useAppStore.getState().playbackMode === "spotify") {
        if (lastKey) {
          stopLiveSampling();
          lastKey = "";
        }
        return;
      }
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
    // be corrected by the engine once the stream loads) AND playback-mode
    // switches (spotify ⇄ element engine restart/stop the sampler).
    const unsub = useAppStore.subscribe((state, prev) => {
      const id = state.currentTrack?.id;
      const pid = prev.currentTrack?.id;
      const dur = state.currentTrack?.duration || state.duration || 0;
      const pdur = prev.currentTrack?.duration || prev.duration || 0;
      if (id !== pid || Math.round(dur) !== Math.round(pdur) || state.playbackMode !== prev.playbackMode) {
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
