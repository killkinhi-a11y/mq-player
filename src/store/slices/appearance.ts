// Store slice: Theme, style, typography, lyrics appearance, liquid-glass, motion prefs.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { StoreSlice } from "@/store/types";
import { clampNum } from "@/store/internal/helpers";

export type AppearanceSliceKeys =
  | "setTheme"
  | "setCustomAccent"
  | "setAnimationsEnabled"
  | "setReduceMotion"
  | "setFullPlayerMode"
  | "setSpatialActionsPosition"
  | "setLyricsFontFamily"
  | "setLyricsFontSize"
  | "setLyricsFontWeight"
  | "setLyricsLineHeight"
  | "setLyricsLetterSpacing"
  | "setLyricsAnimated"
  | "setWaveformEnabled"
  | "setCompactMode"
  | "setFontSize"
  | "setLiquidGlassEnabled"
  | "setLiquidGlassMobile"
  | "setStyle"
  | "setStyleVariant";

/** Theme, style, typography, lyrics appearance, liquid-glass, motion prefs. */
export const createAppearanceSlice: StoreSlice<AppearanceSliceKeys> = (set, get) => ({

      setTheme: (theme) => {
        // Smooth color crossfade (no white flash): briefly enable global
        // color transitions while the token values swap. Class + rule live
        // in globals.css (html.mq-theme-anim). Reduced-motion users get an
        // instant swap (their global 0.01ms rule wins anyway).
        try {
          if (typeof document !== "undefined") {
            const root = document.documentElement;
            root.classList.add("mq-theme-anim");
            window.setTimeout(() => root.classList.remove("mq-theme-anim"), 480);
          }
        } catch {}
        set({ currentTheme: theme });
        // Save theme to account if logged in
        const { userId } = get();
        if (userId) {
          fetch('/api/user/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme }),
          }).catch(() => {});
        }
      },

      setCustomAccent: (color) => {
        set({ customAccent: color });
        // Save accent to account if logged in (including null to clear)
        const { userId } = get();
        if (userId) {
          fetch('/api/user/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accent: color }),
          }).catch(() => {});
        }
      },

      setAnimationsEnabled: (enabled) => set({ animationsEnabled: enabled }),
      setReduceMotion: (enabled) => set({ reduceMotion: enabled }),
      // v8: pure UI preference — writes ONE field. Track/queue/position/
      // volume/EQ/lyrics state is untouched by design (pinned by tests).
      setFullPlayerMode: (mode) => set({ fullPlayerMode: mode }),
      // v9: pure UI preference — writes ONE field (action rail side).
      setSpatialActionsPosition: (position) => set({ spatialActionsPosition: position }),

      // ── v11 Player extension setters (all shallow, playback-neutral) ──
      setLyricsFontFamily: (family) => set({ lyricsFontFamily: family }),
      setLyricsFontSize: (size) => set({ lyricsFontSize: clampNum(size, 0, 72, 0) }),
      setLyricsFontWeight: (weight) => set({ lyricsFontWeight: clampNum(weight, 0, 900, 0) }),
      setLyricsLineHeight: (lh) => set({ lyricsLineHeight: clampNum(lh, 0, 3, 0) }),
      setLyricsLetterSpacing: (ls) => set({ lyricsLetterSpacing: clampNum(ls, -0.1, 0.3, 0) }),
      setLyricsAnimated: (animated) => set({ lyricsAnimated: animated }),
      setWaveformEnabled: (enabled) => set({ waveformEnabled: enabled }),

      setCompactMode: (compact) => set({ compactMode: compact }),

      setFontSize: (size) => set({ fontSize: size }),

      setLiquidGlassEnabled: (enabled) => set({ liquidGlassEnabled: enabled }),

      // ── Liquid Glass Mobile ──
      setLiquidGlassMobile: (enabled) => set({ liquidGlassMobile: enabled }),

      // ── Style ──
      setStyle: (styleId) => {
        set({ currentStyle: styleId });
        // Apply/remove data-style attribute on document
        if (typeof document !== "undefined") {
          if (styleId) {
            document.documentElement.setAttribute("data-style", styleId);
          } else {
            document.documentElement.removeAttribute("data-style");
            // Also clear variant when style is deactivated
            document.documentElement.removeAttribute("data-style-variant");
          }
        }
        // Persist to localStorage
        try {
          if (styleId) {
            localStorage.setItem("mq-style", styleId);
          } else {
            localStorage.removeItem("mq-style");
 }
        } catch (e) { console.warn("[store]", e); }
      },

      // ── Style Variant (Light/Dark) ──
      setStyleVariant: (styleVariant) => {
        set({ styleVariant });
        if (typeof document !== "undefined") {
          if (styleVariant) {
            document.documentElement.setAttribute("data-style-variant", styleVariant);
          } else {
            document.documentElement.removeAttribute("data-style-variant");
          }
        }
        try {
          if (styleVariant) {
            localStorage.setItem("mq-style-variant", styleVariant);
          } else {
            localStorage.removeItem("mq-style-variant");
          }
        } catch (e) { console.warn("[store]", e); }
      },
});

