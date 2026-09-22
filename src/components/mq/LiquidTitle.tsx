"use client";

import React, { memo, useEffect, useRef } from "react";

/*
 * LiquidTitle — the Full Player track title that "music flows through like
 * water" (task §10).
 *
 * How it works (three stacked layers, ONE text node in the a11y tree):
 *   1. base   — solid text, slightly dimmed: the letters at rest;
 *   2. flow   — the same glyphs re-painted with a wide soft gradient clipped
 *               to the text. The band position is driven by REAL playback
 *               progress (target = progress fraction, fed at ~1 Hz from the
 *               store) and eased by a rAF loop, so the light visibly travels
 *               through the title from the first second to the last;
 *   3. ripple — an independent, slower refraction band (SVG feTurbulence +
 *               feDisplacementMap, SMIL-animated) that warps only the flow
 *               layer. SMIL is paused/resumed with playback via
 *               svg.pauseAnimations() — no JS animation loop.
 *
 * Playing / paused: the rAF eases only while playing; pausing freezes the
 * band mid-letter and CSS animations pause (animation-play-state) — the
 * effect "falls asleep" instead of snapping off.
 *
 * Fallbacks: prefers-reduced-motion or animationsEnabled=false renders a
 * static soft gradient — no rAF, no SMIL, no filter.
 *
 * Cost: one text-sized repaint per frame while the Full Player is open and
 * playing. No backdrop-filter, no full-screen effects.
 */

export interface LiquidTitleProps {
  text: string;
  /** Changes → sweep resets and gently re-enters (per-track remount key). */
  swapKey: string | number;
  playing: boolean;
  /** Playback fraction 0..1 (store progress/duration, ~1 Hz is fine). */
  progressFraction: number;
  /** Kill switch: reduced motion / animations disabled → static gradient. */
  motionEnabled: boolean;
  className?: string;
}

const FILTER_ID = "mq-liquid-filter";

const LiquidTitle = memo(function LiquidTitle({
  text,
  swapKey,
  playing,
  progressFraction,
  motionEnabled,
  className = "",
}: LiquidTitleProps) {
  const flowRef = useRef<HTMLSpanElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  /* Band position mapping. background-size is 240% of the text width, so the
     band only intersects the glyphs for background-position in ~[14%, 86%].
     Progress 0→1 therefore maps to 8%→92% (the soft band edges stay visible
     at both extremes — the light never fully leaves the letters mid-track). */
  const posFromFraction = (f: number) => 8 + 84 * Math.max(0, Math.min(1, f));
  // Internal state of the eased band position (percent across the title).
  const posRef = useRef<number>(posFromFraction(progressFraction));
  const targetRef = useRef<number>(posRef.current);
  const playingRef = useRef(playing);
  const enabledRef = useRef(motionEnabled);

  targetRef.current = posFromFraction(progressFraction);
  playingRef.current = playing;
  enabledRef.current = motionEnabled;

  /* ── rAF: ease the band toward the real progress position ── */
  useEffect(() => {
    if (!motionEnabled) return;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const el = flowRef.current;
      if (el) {
        if (playingRef.current) {
          // Ease toward the true playback position — slow, watery, but
          // always converging (lerp + max speed cap so it never lags far).
          // The wobble (±3%) stays INSIDE the visible band range so the
          // light is always passing through some letters.
          const cur = posRef.current;
          const target = targetRef.current;
          const delta = target - cur;
          const maxStep = 14 * dt; // %/s cap
          const next = Math.abs(delta) <= maxStep ? target : cur + Math.sign(delta) * maxStep;
          posRef.current = next;
          // Gentle organic wobble layered on the eased position.
          const wobble = Math.sin(now / 4200) * 3.2;
          const pos = Math.max(8, Math.min(92, next + wobble));
          el.style.backgroundPosition = `${pos.toFixed(2)}% 0`;
          el.style.opacity = String(0.55 + 0.35 * (0.5 + 0.5 * Math.sin(now / 5200)));
        }
        // paused → freeze the band position, let the light fall asleep
        // (CSS transition 1.2s eases the opacity down).
        else if (el.style.opacity !== "0.42") {
          el.style.opacity = "0.42";
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [motionEnabled]);

  /* ── SMIL ripple: pause with playback ── */
  useEffect(() => {
    if (!motionEnabled) return;
    const svg = svgRef.current;
    if (!svg || typeof svg.pauseAnimations !== "function") return;
    if (playing) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [playing, motionEnabled]);

  /* ── New track → restart the sweep from the leading edge ── */
  useEffect(() => {
    posRef.current = targetRef.current;
    const el = flowRef.current;
    if (el && motionEnabled) {
      el.style.backgroundPosition = `${targetRef.current}% 0`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapKey]);
  return (
    <span
      className={`mq-liquid ${className}`}
      data-playing={playing || undefined}
      data-motion={motionEnabled || undefined}
      aria-label={text}
    >
      {/* Screen readers / copy-paste get ONE clean text node. */}
      <span className="mq-liquid-base" aria-hidden="true">{text}</span>
      <span className="mq-liquid-flow" ref={flowRef} data-text={text} aria-hidden="true">
        {text}
      </span>
      {motionEnabled && (
        <svg
          ref={svgRef}
          className="mq-liquid-svg"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id={FILTER_ID} x="-8%" y="-12%" width="116%" height="124%" colorInterpolationFilters="sRGB">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.011 0.021"
                numOctaves={2}
                seed={11}
                result="mq-noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="16s"
                  values="0.011 0.021;0.014 0.026;0.011 0.021"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="mq-noise"
                scale="5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}
    </span>
  );
});

export default LiquidTitle;
