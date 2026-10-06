"use client";

/*
 * AmbientBackground — the NORMAL MQ backdrop (DESIGN COMPLETION:
 * THE LIVING EDITORIAL ATMOSPHERE).
 *
 * Identity: CALM / REFINED / ATMOSPHERIC / EDITORIAL — and ALIVE.
 * MQ owns its own room even with WAVE off; it is never a flat black page.
 *   1. base floor — cold near-black wash over --mq-bg (never a flat hex)
 *   2. pools — graphite light + cold navy, FIXED tones: the normal MQ is
 *      NOT track-colored. Personal color belongs to WAVE.
 *   3. indigo breath — a second, deeper register drifting the other way
 *   4. haze — a huge barely-there luminous bloom, the "air" of the room
 *   5. grain — fractal-noise SVG at ~3.5% overlay
 *   6. vignette — soft dark falloff for depth
 *
 * Motion: THREE compositor-only drifts at different ultra-slow speeds
 * (240s / 400s / 560s) and directions — living, never a recognizable
 * cycle, perceived subconsciously.
 *
 * Cost: zero backdrop-filter, zero blur filters, zero JS after mount.
 * prefers-reduced-motion freezes the drifts (globals.css).
 *
 * WAVE crossfades over this layer (the opaque .mq-wave-liquid scene fades
 * in above it) — the two identities never mix.
 */

import { memo } from "react";

export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div className="mq-ambient-bg" aria-hidden="true">
      <div className="mq-ambient-base" />
      <div className="mq-ambient-pools" />
      <div className="mq-ambient-indigo" />
      <div className="mq-ambient-haze" />
      <div className="mq-ambient-grain" />
      <div className="mq-ambient-vignette" />
    </div>
  );
});

export default AmbientBackground;
