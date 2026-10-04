"use client";

/**
 * useWaveform — React binding for the waveform pipeline.
 *
 * Returns a snapshot ({status, data}) that changes ONLY on macro events
 * (track change, generation done) — never per frame. The renderer reads the
 * playhead from the audio clock itself (currentPlaybackPosition), so this
 * hook never re-renders on playback progress (spec §10).
 *
 * State model: the STORED state is keyed (`forKey`); the RETURNED snapshot
 * is DERIVED — a mismatch (track/prefs changed) reads as `loading`/`idle`
 * without any synchronous setState inside the effect.
 */

import { useCallback, useEffect, useState } from "react";
import type { Track } from "@/lib/musicApi";
import { getWaveform } from "./generator";
import type { WaveformData, WaveformStatus } from "./types";

export interface UseWaveformResult {
  status: WaveformStatus;
  data: WaveformData | null;
  /** Re-run generation (e.g. after a retry click). */
  reload: () => void;
}

interface StoredState {
  forKey: string;
  status: WaveformStatus;
  data: WaveformData | null;
}

export function useWaveform(track: Track | null, enabled: boolean): UseWaveformResult {
  const [nonce, setNonce] = useState(0);
  const [stored, setStored] = useState<StoredState>({ forKey: "", status: "idle", data: null });

  const requestKey =
    track && enabled ? `${track.id}|${Math.round((track.duration || 0) * 10)}|${nonce}` : "";
  const fresh = stored.forKey !== "" && stored.forKey === requestKey;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;

    getWaveform(track!)
      .then((data) => {
        if (cancelled) return;
        setStored({
          forKey: requestKey,
          status: data ? "ready" : "unavailable",
          data,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStored({ forKey: requestKey, status: "unavailable", data: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, track, nonce]);

  if (!requestKey) {
    return { status: "idle", data: null, reload };
  }
  if (!fresh) {
    // New request in flight — but keep showing the previous track's data
    // only when it belongs to the SAME track (avoids a hard flash).
    const sameTrack = stored.forKey.startsWith(`${track!.id}|`);
    return { status: "loading", data: sameTrack ? stored.data : null, reload };
  }
  return { status: stored.status, data: stored.data, reload };
}
