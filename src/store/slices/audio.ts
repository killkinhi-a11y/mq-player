// Store slice: Audio pipeline prefs: EQ, limiter, crossfade, gapless, ReplayGain, spatial, WASM engine.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import { EQ_PRESETS } from "@/lib/eq";
import type { StoreSlice } from "@/store/types";
import { disableEQ as engineDisableEQ, enableEQ as engineEnableEQ, resetEQBands as engineResetEQBands, setAllEQBands as engineSetAllEQBands, setCrossfadeEnabled as engineSetCrossfadeEnabled, setEQBand as engineSetEQBand } from "@/lib/audioEngine";

export type AudioSliceKeys =
  | "setSpatialAudioEnabled"
  | "setSpatialMood"
  | "setSpatialAutoDetect"
  | "setCrossfadeEnabled"
  | "setCrossfadeDuration"
  | "setReplayGainEnabled"
  | "setGaplessEnabled"
  | "setWasmEngineEnabled"
  | "setEqEnabled"
  | "setEqBand"
  | "setEqPreset"
  | "setLimiterEnabled"
  | "setLimiterThreshold";

/** Audio pipeline prefs: EQ, limiter, crossfade, gapless, ReplayGain, spatial, WASM engine. */
export const createAudioSlice: StoreSlice<AudioSliceKeys> = (set, get) => ({

      // ── Spatial Audio actions ──
      setSpatialAudioEnabled: (enabled) => set({ spatialAudioEnabled: enabled }),
      setSpatialMood: (mood) => set({ spatialMood: mood }),
      setSpatialAutoDetect: (enabled) => set({ spatialAutoDetect: enabled }),

      // ── Crossfade actions ──
      setCrossfadeEnabled: (enabled) => {
        set({ crossfadeEnabled: enabled });
        engineSetCrossfadeEnabled(enabled);
      },
      setCrossfadeDuration: (duration) => set({ crossfadeDuration: Math.max(0.5, Math.min(8, duration)) }),
      setReplayGainEnabled: (enabled) => set({ replayGainEnabled: enabled }),

      // ── Gapless playback actions ──
      setGaplessEnabled: (enabled) => set({ gaplessEnabled: enabled }),
      setWasmEngineEnabled: (enabled) => set({ wasmEngineEnabled: enabled }),

      // ── EQ actions ──
      setEqEnabled: (enabled) => {
        set({ eqEnabled: enabled });
        if (enabled) {
          engineEnableEQ();
          engineSetAllEQBands(get().eqBands);
        } else {
          engineDisableEQ();
          engineResetEQBands();
        }
      },
      setEqBand: (bandIndex, value) => {
        set((s) => {
          const bands = [...s.eqBands];
          bands[bandIndex] = value;
          // Manual band edit => the curve is no longer any stock preset.
          // 'custom' (not 'flat') so the preset pills don't highlight a
          // wrong pill for a non-flat curve; SettingsView already maps
          // eqPreset === 'custom' to «свои настройки».
          return { eqBands: bands, eqPreset: 'custom' };
        });
        if (get().eqEnabled) {
          engineSetEQBand(bandIndex, value);
        }
      },
      setEqPreset: (preset) => {
        const p = EQ_PRESETS.find(pr => pr.id === preset);
        if (p) {
          set({ eqBands: [...p.bands], eqPreset: preset });
          if (get().eqEnabled) {
            engineSetAllEQBands(p.bands);
          }
        }
      },

      // ── Look-ahead limiter actions (engine routing in useAudioEngine) ──
      setLimiterEnabled: (enabled) => set({ limiterEnabled: enabled }),
      setLimiterThreshold: (thresholdDb) => {
        const clamped = Math.max(-12, Math.min(0, thresholdDb));
        set({ limiterThreshold: clamped });
      },
});

