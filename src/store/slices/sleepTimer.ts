// Store slice: Sleep timer.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { StoreSlice } from "@/store/types";

export type SleepTimerSliceKeys =
  | "startSleepTimer"
  | "stopSleepTimer"
  | "updateSleepTimer";

/** Sleep timer. */
export const createSleepTimerSlice: StoreSlice<SleepTimerSliceKeys> = (set, get) => ({

      startSleepTimer: (minutes) => {
        const endTime = Date.now() + minutes * 60 * 1000;
        set({
          sleepTimerActive: true,
          sleepTimerMinutes: minutes,
          sleepTimerRemaining: minutes * 60,
          sleepTimerEndTime: endTime,
        });
      },

      stopSleepTimer: () =>
        set({
          sleepTimerActive: false,
          sleepTimerRemaining: 0,
          sleepTimerEndTime: null,
        }),

      updateSleepTimer: () => {
        const { sleepTimerEndTime, sleepTimerActive, volume } = get();
        if (!sleepTimerActive || !sleepTimerEndTime) return;
        const remaining = Math.max(0, Math.floor((sleepTimerEndTime - Date.now()) / 1000));

        // ── Fade-out: last 30 seconds, gradually reduce volume ──
        // Linear fade from current volume to 0 over 30s.
        // When timer hits 0, pause playback and restore volume.
        if (remaining <= 30 && remaining > 0) {
          const fadeRatio = remaining / 30; // 1.0 → 0.0 over 30s
          const originalVolume = (get() as any)._sleepTimerOriginalVolume ?? volume;
          // Store original volume on first fade tick
          if (!(get() as any)._sleepTimerOriginalVolume) {
            (get() as any)._sleepTimerOriginalVolume = volume;
          }
          const fadedVolume = Math.round(originalVolume * fadeRatio);
          set({ sleepTimerRemaining: remaining, volume: fadedVolume });
        } else if (remaining <= 0) {
          // Timer expired — pause + restore original volume
          const originalVolume = (get() as any)._sleepTimerOriginalVolume ?? 70;
          set({
            sleepTimerActive: false,
            sleepTimerRemaining: 0,
            sleepTimerEndTime: null,
            isPlaying: false,
            volume: originalVolume,
          });
          // Clear stored volume
          delete (get() as any)._sleepTimerOriginalVolume;
        } else {
          set({ sleepTimerRemaining: remaining });
        }
      },
});

