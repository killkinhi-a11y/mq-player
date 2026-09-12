/**
 * updateSnapshot.ts — Phase M #25/#26: playback state survives an update reload.
 *
 * Saved right before the update reload, restored once after boot.
 * - Own localStorage key ('mq-update-snapshot-v1') — NEVER clears or migrates
 *   user data (#34: queue/likes/settings/Zustand persist stay untouched).
 * - One-shot: snapshot is removed after restore (successful or not).
 * - Paused stays paused (#26): we do not auto-start playback that was paused.
 * - Playing tries to resume (#25): if the browser's autoplay policy blocks it
 *   (no gesture in the fresh page), we fall back to an honest paused state —
 *   state recovery, not a promise of gapless playback.
 */

import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import { seekPlayback, currentPlaybackPosition } from "@/lib/wasm-audio";

const SNAPSHOT_KEY = "mq-update-snapshot-v1";

export interface UpdateSnapshot {
  v: 1;
  /** build we were on when the snapshot was taken (diagnostics) */
  fromBuildId: string | null;
  savedAt: number;
  trackId: string | null;
  track: Track | null;
  queue: Track[];
  queueIndex: number;
  /** seconds into the track */
  position: number;
  isPlaying: boolean;
  volume: number;
}

export function saveUpdateSnapshot(): void {
  try {
    const s = useAppStore.getState();
    if (!s.currentTrack) return; // nothing playing/paused → nothing to preserve

    const snapshot: UpdateSnapshot = {
      v: 1,
      fromBuildId: null,
      savedAt: Date.now(),
      trackId: s.currentTrack.id,
      track: s.currentTrack,
      queue: s.queue && s.queue.length ? s.queue : [s.currentTrack],
      queueIndex: typeof s.queueIndex === "number" ? s.queueIndex : 0,
      position: s.progress || 0,
      isPlaying: !!s.isPlaying,
      volume: typeof s.volume === "number" ? s.volume : 80,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / serialization failure — update proceeds without state recovery.
  }
}

export function readUpdateSnapshot(): UpdateSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as UpdateSnapshot;
    if (!snap || snap.v !== 1 || !snap.trackId) return null;
    if (!Array.isArray(snap.queue) || snap.queue.length === 0) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearUpdateSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}
}

/**
 * Restore once after the post-update page boots. Call AFTER Zustand hydration
 * (AppShell already gates rendering on _hasHydrated). Safe to call multiple
 * times — the snapshot is consumed on first valid restore.
 *
 * @param getAudioElement accessor (injected from AppShell to avoid a cycle)
 * @returns true if a snapshot was restored
 */
export function restoreUpdateSnapshot(
  getAudioElement: () => HTMLAudioElement | null
): boolean {
  const snap = readUpdateSnapshot();
  if (!snap) return false;

  // Validate the stored track shape minimally — a corrupted snapshot must
  // never poison the store.
  const track: Track | null =
    snap.track && typeof snap.track.id === "string" && typeof snap.track.title === "string"
      ? snap.track
      : snap.queue.find((t) => t && t.id === snap.trackId) ?? null;
  if (!track) {
    clearUpdateSnapshot();
    return false;
  }

  try {
    const idx = Math.max(
      0,
      snap.queue.findIndex((t) => t.id === snap.trackId)
    );
    const position = Number.isFinite(snap.position) ? Math.max(0, snap.position) : 0;

    // 1. Restore store state — PAUSED first (no auto-start, #26). The engine's
    //    load-track effect picks up currentTrack and loads the stream.
    //    (shuffle/repeat/playlistId/likes already survive via Zustand persist —
    //    we only restore what persist does NOT: full queue + position + intent.)
    useAppStore.setState({
      queue: snap.queue,
      queueIndex: idx,
      currentTrack: track,
      isPlaying: false,
      progress: position,
      duration: track.duration || 0,
      volume: Number.isFinite(snap.volume) ? snap.volume : 80,
    });

    // 2. Seek to the saved position once the engine has the stream loaded.
    //    seekPlayback routes to the WASM backend (AudioWorklet) OR the
    //    <audio> element — covers both playback paths (§35.22).
    seekWhenLoaded(position, getAudioElement);

    // 3. One-shot — remove BEFORE the resume attempt so a failed resume can
    //    never trigger a second restore on the next boot.
    clearUpdateSnapshot();

    // 4. Resume playback only if it was actually playing pre-reload (#25).
    if (snap.isPlaying) {
      // Give the engine a beat to attach the audio element + load the src,
      // then flip isPlaying — the central isPlaying effect calls play().
      setTimeout(() => {
        useAppStore.setState({ isPlaying: true });
        // Honesty fallback: if autoplay is blocked (NotAllowedError path keeps
        // isPlaying=true while audio stays silent), settle to paused after 5s.
        setTimeout(() => {
          const st = useAppStore.getState();
          const pos = currentPlaybackPosition();
          if (st.isPlaying && pos === 0 && st.progress === position) {
            // Engine never managed to start (autoplay blocked). Paused, but
            // track/position/queue are intact: the user presses play once.
            useAppStore.setState({ isPlaying: false });
          }
        }, 5000);
      }, 300);
    }

    console.warn(
      `[MQ Update] Playback state restored: ${track.title} @ ${Math.round(position)}s (was ${snap.isPlaying ? "playing" : "paused"})`
    );
    return true;
  } catch {
    clearUpdateSnapshot();
    return false;
  }
}

/** Seek when the engine has the restored stream loaded (bounded ~10s).
 *  Retries because the WASM backend / <audio> element attach asynchronously
 *  after the store restore; seekPlayback is a no-op until then. */
function seekWhenLoaded(position: number, getAudioElement?: () => HTMLAudioElement | null): void {
  const started = Date.now();
  const tick = () => {
    // Engine-ready signals: WASM/element position advancing, already at the
    // target, or the <audio> element loaded (paused restore case: pos stays 0).
    const pos = currentPlaybackPosition();
    let elementReady = false;
    try {
      const a = getAudioElement?.();
      elementReady = !!a && !!a.src && a.readyState >= 1;
    } catch {}
    if (pos > 0 || pos === position || elementReady) {
      if (pos !== position) {
        try {
          seekPlayback(position);
          useAppStore.setState({ progress: position });
        } catch {
          // Seek unsupported on this path — restart at 0 is acceptable.
        }
      }
      return;
    }
    if (Date.now() - started > 10_000) return; // give up quietly
    setTimeout(tick, 400);
  };
  setTimeout(tick, 300);
}
