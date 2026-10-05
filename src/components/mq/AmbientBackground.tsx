"use client";

/*
 * AmbientBackground — the NORMAL MQ backdrop (V2.5 editorial identity).
 *
 * Identity: CALM / REFINED / ATMOSPHERIC / EDITORIAL.
 *   1. base wash — very subtle vertical light over --mq-bg (never flat black)
 *   2. light pools — graphite + a whisper of soft navy, FIXED tones:
 *      the normal MQ is NOT track-colored. Personal color belongs to WAVE;
 *      the editorial shell keeps its own quiet identity.
 *   3. grain — fractal-noise SVG at ~3.5% overlay
 *   4. vignette — soft dark falloff for depth
 *
 * Motion: one 150s compositor transform drift — "very slow light shifts",
 * imperceptible as animation, perceptible as life.
 *
 * Cost: zero backdrop-filter, zero blur filters, zero JS after mount.
 * prefers-reduced-motion freezes the drift (globals.css).
 *
 * WAVE crossfades over this layer (the opaque .mq-wave-liquid scene fades
 * in above it) — the two identities never mix.
 */

import { memo } from "react";

export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div className="mq-ambient-bg" aria-hidden="true">
      <div className="mq-ambient-base" />
      <div className="mq-ambient-blobs" />
      <div className="mq-ambient-grain" />
      <div className="mq-ambient-vignette" />
    </div>
  );
});

export default AmbientBackground;
