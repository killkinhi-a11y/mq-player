"use client";

/**
 * Lyrics appearance — bridges store prefs to CSS custom properties on <html>,
 * consumed by liquid-lyrics.css (`.ll-line` typography) with `var()` fallbacks
 * so an unset pref = MQ's default look (spec §4).
 */

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export interface LyricsAppearancePrefs {
  lyricsFontFamily: string;
  lyricsFontSize: number;
  lyricsFontWeight: number;
  lyricsLineHeight: number;
  lyricsLetterSpacing: number;
}

/** Apply (or clear) the CSS variables. Safe on server (no-op). */
export function applyLyricsAppearance(prefs: LyricsAppearancePrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const set = (name: string, value: string | null) => {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  };

  // Family: only internal MQFont_* families can ever appear here (the UI
  // writes exclusively validated internal names) — no injection surface.
  // Fallback chain: the app's PRIMARY font var (defined on :root). A var()
  // fallback may NOT contain a CSS-wide keyword (`inherit`) — that makes the
  // whole declaration invalid at computed-value time and the custom font
  // would silently never apply (measured live in v11.1 E2E).
  set("--ll-font-family", prefs.lyricsFontFamily ? `"${prefs.lyricsFontFamily}", var(--mq-font-primary, sans-serif)` : null);
  set("--ll-font-size", prefs.lyricsFontSize > 0 ? `${prefs.lyricsFontSize}px` : null);
  set("--ll-font-weight", prefs.lyricsFontWeight > 0 ? String(prefs.lyricsFontWeight) : null);
  set("--ll-line-height", prefs.lyricsLineHeight > 0 ? String(prefs.lyricsLineHeight) : null);
  set("--ll-letter-spacing", prefs.lyricsLetterSpacing !== 0 ? `${prefs.lyricsLetterSpacing}em` : null);
}

/** Mounted once (AppShell) — keeps CSS vars in sync with store prefs. */
export function useLyricsAppearanceSync(): void {
  useEffect(() => {
    const selector = (s: LyricsAppearancePrefs) => ({
      lyricsFontFamily: s.lyricsFontFamily,
      lyricsFontSize: s.lyricsFontSize,
      lyricsFontWeight: s.lyricsFontWeight,
      lyricsLineHeight: s.lyricsLineHeight,
      lyricsLetterSpacing: s.lyricsLetterSpacing,
    });
    const apply = (prefs: LyricsAppearancePrefs) => applyLyricsAppearance(prefs);

    apply(selector(useAppStore.getState()));
    let prev = selector(useAppStore.getState());
    const unsub = useAppStore.subscribe((state) => {
      const next = selector(state);
      if (
        next.lyricsFontFamily !== prev.lyricsFontFamily ||
        next.lyricsFontSize !== prev.lyricsFontSize ||
        next.lyricsFontWeight !== prev.lyricsFontWeight ||
        next.lyricsLineHeight !== prev.lyricsLineHeight ||
        next.lyricsLetterSpacing !== prev.lyricsLetterSpacing
      ) {
        prev = next;
        apply(next);
      }
    });
    return unsub;
  }, []);
}
