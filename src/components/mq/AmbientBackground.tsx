"use client";

/*
 * AmbientBackground — the living desktop backdrop.
 *
 * Layers (bottom → top):
 *   1. base wash — very subtle vertical gradient over --mq-bg (never pure flat black)
 *   2. artwork glow — three radial gradients painted from the DOMINANT COLORS
 *      of the currently playing cover (useDominantColor → canvas k-means, cached
 *      per track). Colors are published as CSS custom properties on <html>;
 *      registered via @property they cross-fade SLOWLY (2.6s) — no hard cuts.
 *   3. grain — fractal-noise SVG texture at ~4% overlay
 *   4. vignette — soft dark falloff at the edges for depth
 *
 * Cost profile: no backdrop-filter, no blur filters anywhere — radial gradients
 * are inherently soft; the only animation is a 90s compositor transform drift.
 * prefers-reduced-motion freezes the drift (globals.css).
 *
 * Mobile: same system, reduced intensity (CSS media query) — visual continuity
 * without the desktop drama.
 */

import { memo, useEffect } from "react";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useAppStore } from "@/store/useAppStore";

export const AmbientBackground = memo(function AmbientBackground() {
  const colors = useDominantColor(); // keyed to store.currentTrack internally
  const hasTrack = useAppStore((s) => !!s.currentTrack);

  /* Publish palette → <html> CSS vars. @property registration (globals.css)
     makes these transitions interpolate smoothly on supporting engines;
     elsewhere the switch is instant — a graceful degradation, never a bug. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--mq-ambient-1", colors.primary);
    root.style.setProperty("--mq-ambient-2", colors.vibrant || colors.secondary);
    root.style.setProperty("--mq-ambient-3", colors.secondary);
  }, [colors]);

  return (
    <div className="mq-ambient-bg" aria-hidden="true" data-has-track={hasTrack || undefined}>
      <div className="mq-ambient-base" />
      <div className="mq-ambient-blobs" />
      <div className="mq-ambient-grain" />
      <div className="mq-ambient-vignette" />
    </div>
  );
});

export default AmbientBackground;
