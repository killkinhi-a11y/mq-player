"use client";

// Extracted from AuthView.tsx (Stage III decomposition) — moved verbatim.
import { type ReactNode, useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";

/** ═════════════════════════════════════════════════════════════════════
 *  AUTH MOTION SYSTEM — presentation-only helpers (NO auth logic here).
 *
 *  Entrance sequence (~1s, interactive ≤600ms — controls render from t=0):
 *   Stage 1 — brand mark MQ: scale 0.8→1, blur 8px→0, breathing glow
 *             (CSS) + concentric sound-wave rings (CSS, opacity ≤0.08)
 *   Stage 2 — wordmark «MQ» + slogan «Music is more than listening»:
 *             stagger 80ms, letter-spacing 0.3em→norm reveal
 *   Stage 3 — glass card: y:24→0 + blur 6px→0 (AuthCard, first mount)
 *   Stage 4 — inner blocks: opacity+y stagger 40ms (Reveal)
 *
 *  Step transitions (login↔register↔confirm…): shared-axis X slide ±28px
 *  + crossfade 0.32s, low spring (stiffness 260, damping 26), direction
 *  derived from STEP_DEPTH — AnimatePresence mode="wait" preserved.
 *
 *  All of it collapses to instant opacity fades (120ms) when motion is
 *  reduced: store reduceMotion / animationsEnabled=false / OS
 *  prefers-reduced-motion (useReducedMotion). CSS pieces are additionally
 *  killed by the @media gate in auth-motion.css.
 * ═══════════════════════════════════════════════════════════════════ */

/** Brand easing — exponential out. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Shared-axis depth of each step — used ONLY to pick the slide direction
 *  (deeper → +x enter, back → −x enter). Never gates any logic. */
export const STEP_DEPTH: Record<string, number> = {
  telegram: 0,
  login: 1,
  register: 1,
  "telegram-register": 1,
  "telegram-widget-register": 1,
  confirm: 2,
  "forgot-password": 2,
  "telegram-link": 2,
};

/** Glass card — stage 3 of the entrance (first mount only): rises y:24→0
 *  with blur settling in. Later steps mount it as part of the sliding step
 *  (no own entrance). While a submit is in flight it pulses its border
 *  softly (CSS, 2.4s). */
export function AuthCard({
  firstMount,
  fullMotion,
  loading,
  children,
}: {
  firstMount: boolean;
  fullMotion: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`mq-auth-card rounded-2xl p-6 lg:p-8${loading && fullMotion ? " mq-auth-card--loading" : ""}`}
      style={{
        /* V13 heavy glass (design-taste + apple-design materials): the card
           is a physical slab — translucent body so the ambient blobs refract
           through it, a 165deg top sheen (bevel), hairline edge, one deep
           shadow + inner top light. Inline backdrop-filter per the pipeline
           contract (Lightning strips it from stylesheets). */
        backgroundColor: "color-mix(in srgb, var(--mq-card, #1a1a1a) 72%, transparent)",
        backgroundImage: "linear-gradient(165deg, rgba(255,255,255,0.055), transparent 46%)",
        border: "1px solid color-mix(in srgb, var(--mq-text, #f0f0f0) 10%, transparent)",
        boxShadow:
          "0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
      initial={
        firstMount
          ? fullMotion
            ? { opacity: 0, y: 24, filter: "blur(6px)" }
            : { opacity: 0 }
          : false
      }
      animate={
        firstMount
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : undefined
      }
      transition={
        firstMount
          ? fullMotion
            ? { delay: 0.15, duration: 0.5, ease: EASE }
            : { duration: 0.12 }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}

export type BannerTone = "error" | "success" | "info" | "warn";

export const BANNER_STYLES: Record<BannerTone, React.CSSProperties> = {
  error: { backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)", borderLeft: "3px solid rgba(224,49,49,0.6)" },
  success: { backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderLeft: "3px solid rgba(34,197,94,0.55)" },
  info: { backgroundColor: "rgba(42,171,238,0.1)", color: "var(--mq-telegram)", border: "1px solid rgba(42,171,238,0.25)", borderLeft: "3px solid rgba(42,171,238,0.5)" },
  /* V13 (design-taste): dark amber body + 3px left edge — reads as a
     calm system notice, not an XP error box, on the dark glass card. */
  warn: { backgroundColor: "rgba(74,64,0,0.35)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.22)", borderLeft: "3px solid rgba(251,191,36,0.55)" },
};

/** Inline banner. Errors appear with y:8→0 (the related FIELD shakes —
 *  see ShakeField; the card never shakes). Success messages get a light
 *  1→1.02→1 flourish. */
export function AuthBanner({
  tone,
  fullMotion,
  className = "",
  children,
}: {
  tone: BannerTone;
  fullMotion: boolean;
  className?: string;
  children: ReactNode;
}) {
  const isSuccess = tone === "success";
  return (
    <motion.div
      className={`mb-4 p-3 rounded-lg text-sm ${className}`}
      style={BANNER_STYLES[tone]}
      initial={fullMotion ? { opacity: 0, y: 8 } : { opacity: 0 }}
      animate={
        fullMotion
          ? isSuccess
            ? { opacity: 1, y: 0, scale: [1, 1.02, 1] }
            : { opacity: 1, y: 0 }
          : { opacity: 1 }
      }
      transition={
        fullMotion
          ? { duration: isSuccess ? 0.45 : 0.3, ease: EASE }
          : { duration: 0.12 }
      }
    >
      {children}
    </motion.div>
  );
}

/** Field-level error shake: x ±6px, 0.4s, two cycles — never the card.
 *  Re-triggers only when a NEW error message arrives. */
export function ShakeField({
  trigger,
  fullMotion,
  children,
}: {
  trigger: string;
  fullMotion: boolean;
  children: ReactNode;
}) {
  const controls = useAnimationControls();
  const prevTriggerRef = useRef("");

  useEffect(() => {
    if (trigger && trigger !== prevTriggerRef.current && fullMotion) {
      controls.set({ x: 0 });
      controls.start({
        x: [0, -6, 6, -6, 6, -3, 3, 0],
        transition: { duration: 0.4, ease: "easeInOut" },
      });
    }
    prevTriggerRef.current = trigger;
  }, [trigger, fullMotion, controls]);

  return <motion.div animate={controls}>{children}</motion.div>;
}

/** Stage-4 stagger wrapper: animates (opacity + y:10→0, 40ms stagger) only
 *  on the first mount of the auth screen; renders a plain passthrough div
 *  on every later step mount, so step transitions stay a single shared-axis
 *  unit with zero perceived latency. */
export function Reveal({
  index,
  firstMount,
  fullMotion,
  className,
  style,
  children,
}: {
  index: number;
  firstMount: boolean;
  fullMotion: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  if (!firstMount) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={fullMotion ? { opacity: 0, y: 10 } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        fullMotion
          ? { delay: 0.22 + index * 0.04, duration: 0.3, ease: EASE }
          : { delay: 0.15 + index * 0.02, duration: 0.12 }
      }
    >
      {children}
    </motion.div>
  );
}

/** Persistent brand header — stages 1–2 of the entrance: the MQ mark
 *  (scale+blur+glow, sound-wave rings), then the wordmark and slogan with
 *  a letter-spacing reveal, 80ms apart. Stays mounted across all steps so
 *  it never replays. */
export function BrandHeader({ fullMotion }: { fullMotion: boolean }) {
  return (
    <div className="flex flex-col items-center text-center mb-5 sm:mb-7 select-none">
      <motion.div
        className="relative flex items-center justify-center mb-3"
        style={{ width: 56, height: 56 }}
        initial={fullMotion ? { opacity: 0, scale: 0.8, filter: "blur(8px)" } : { opacity: 0 }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={fullMotion ? { delay: 0.05, duration: 0.45, ease: EASE } : { duration: 0.12 }}
      >
        {fullMotion &&
          [0, 1, 2].map((i) => (
            <span key={i} className="mq-auth-ring" style={{ animationDelay: `${i * 1.2}s` }} />
          ))}
        <div
          className="mq-auth-logo relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
        >
          <span
            className="text-xl font-black text-white"
            style={{ fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
          >
            mq
          </span>
        </div>
      </motion.div>
      <motion.h1
        className="text-[34px] leading-tight font-semibold mb-1.5"
        style={{ color: "var(--mq-text)", fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
        initial={fullMotion ? { opacity: 0, y: 6, letterSpacing: "0.3em" } : { opacity: 0 }}
        animate={{ opacity: 1, y: 0, letterSpacing: "0.02em" }}
        transition={fullMotion ? { delay: 0.13, duration: 0.4, ease: EASE } : { duration: 0.12 }}
      >
        MQ
      </motion.h1>
      <motion.p
        className="text-[13px] sm:text-sm font-medium italic"
        style={{ color: "var(--mq-text-muted)", opacity: 0.75, fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
        initial={fullMotion ? { opacity: 0, y: 6, letterSpacing: "0.3em" } : { opacity: 0 }}
        animate={{ opacity: 1, y: 0, letterSpacing: "0.14em" }}
        transition={fullMotion ? { delay: 0.21, duration: 0.35, ease: EASE } : { duration: 0.12 }}
      >
        Music is more than listening
      </motion.p>
    </div>
  );
}
