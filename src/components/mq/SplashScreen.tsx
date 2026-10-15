"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import "./auth-motion.css";

/**
 * SplashScreen v2 — «прогрев студии» (studio warm-up).
 *
 * One clear direction (design-taste): nocturnal, musical, calm. The
 * signature moment is the EQUALIZER — five staggered bars tuning beneath
 * the brand mark, so the very first frame already says "this is a music
 * player", before any UI loads.
 *
 * Choreography (enter-only — the splash is unmounted by the store
 * hydration swap, adding an artificial exit would delay time-to-app):
 *   0–450ms   logo mark materializes from blur + scale (spring), glow
 *              breathing starts (CSS)
 *   300ms+    equalizer bars rise in staggered phase — scaleY only (GPU)
 *   550ms     wordmark «MQ» reveals with letter-spacing expansion
 *   700ms     tagline «Music is more than listening» fades in (serif)
 *
 * Used only for hydration (until Zustand rehydrates). showDelay 150ms —
 * on fast hydration it never appears at all. Time is NOT extended.
 *
 * Principles:
 *  - Only design tokens — works in any theme
 *  - Brand curve cubic-bezier(0.22, 1, 0.36, 1)
 *  - GPU-accelerated (transform + opacity); eq bars — CSS keyframes
 *  - prefers-reduced-motion: no bars, no scale, opacity-only 120ms
 */

interface SplashScreenProps {
  showDelay?: number;
}

export default function SplashScreen({ showDelay = 150 }: SplashScreenProps) {
  const [visible, setVisible] = useState(showDelay === 0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // showDelay === 0 → `visible` is already true from the initial state;
    // no synchronous setState needed (avoids set-state-in-effect cascade).
    if (showDelay === 0) return;
    const t = setTimeout(() => setVisible(true), showDelay);
    return () => clearTimeout(t);
  }, [showDelay]);

  if (!visible) return null;

  const fullMotion = !prefersReducedMotion;

  return (
    <motion.div
      key="mq-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      <div className="flex flex-col items-center gap-0 select-none" aria-hidden="true">
        {/* Logo mark — materializes from blur, then breathes */}
        <motion.div
          className="relative flex items-center justify-center"
          style={{ width: 56, height: 56 }}
          initial={fullMotion ? { opacity: 0, scale: 0.8, filter: "blur(8px)" } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={fullMotion
            ? { type: "spring", stiffness: 260, damping: 22 }
            : { duration: 0.12 }}
        >
          <div
            className="mq-auth-logo relative z-10 w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
          >
            <span
              className="text-lg font-black text-white"
              style={{ fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
            >
              mq
            </span>
          </div>
        </motion.div>

        {/* Equalizer — five staggered bars tuning beneath the mark.
            CSS keyframes (scaleY only); phase offset via delays. */}
        {fullMotion && (
          <div className="mq-splash-eq" role="presentation">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="mq-splash-eq-bar"
                style={{ animationDelay: `${0.3 + i * 0.09}s` }}
              />
            ))}
          </div>
        )}

        {/* Wordmark — letter-spacing reveal */}
        <motion.span
          initial={fullMotion ? { opacity: 0, letterSpacing: "0.3em" } : { opacity: 0 }}
          animate={fullMotion ? { opacity: 1, letterSpacing: "0.08em" } : { opacity: 1 }}
          transition={fullMotion
            ? { delay: 0.55, duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.12 }}
          className="text-sm font-semibold mt-1"
          style={{ color: "var(--mq-text, #f0f0f0)", fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
        >
          MQ
        </motion.span>

        {/* Tagline — the brand statement, serif and quiet */}
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 0.62, y: 0 }}
          transition={fullMotion
            ? { delay: 0.7, duration: 0.45, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.12 }}
          className="text-[11px] italic mt-1.5"
          style={{
            color: "var(--mq-text-muted, #888)",
            fontFamily: "var(--mq-font-serif, Georgia, serif)",
            letterSpacing: "0.04em",
          }}
        >
          Music is more than listening
        </motion.span>
      </div>
    </motion.div>
  );
}
