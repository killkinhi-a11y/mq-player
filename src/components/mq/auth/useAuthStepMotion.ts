"use client";

// Step transition motion (visual only — never gates auth logic).
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useEffect, useRef, useState } from "react";
import { type Variants, useReducedMotion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { STEP_DEPTH } from "./AuthLayout";
import type { AuthStep } from "@/store/types";

export function useAuthStepMotion(authStep: AuthStep) {
  // ─── Motion policy (visual only — never gates auth logic) ───────────
  // fullMotion=false → the whole entrance collapses to instant opacity
  // fades (120ms): no translate, no scale, no blur, no shake, no rings.
  // Sources: store reduceMotion (master kill switch), animationsEnabled
  // («Анимации интерфейса»), OS prefers-reduced-motion (useReducedMotion
  // also honours the MotionConfig reducedMotion="always" from AppShell).
  const storeReduceMotion = useAppStore((s) => s.reduceMotion);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const osReduceMotion = useReducedMotion();
  const fullMotion = animationsEnabled && !storeReduceMotion && !osReduceMotion;

  // Step navigation direction (animation-only state): +1 when going
  // deeper (login→confirm…), −1 when going back. Drives the shared-axis
  // X slide. Never affects which step is shown.
  const prevStepRef = useRef<string>(authStep);
  const [stepDir, setStepDir] = useState(1);
  useEffect(() => {
    const prev = prevStepRef.current;
    if (prev !== authStep) {
      prevStepRef.current = authStep;
      setStepDir((STEP_DEPTH[authStep] ?? 0) >= (STEP_DEPTH[prev] ?? 0) ? 1 : -1);
    }
  }, [authStep]);

  // First-mount flag — the staged entrance plays ONCE; every later step
  // mount rides the shared-axis slide instead of re-staggering fields.
  // Implemented with the official "storing information from previous
  // renders" pattern (same as usePlaybackProgress / CoverImage): the
  // react-hooks/refs rule forbids reading refs during render and a
  // set-state-in-effect would cascade renders. nav.step mirrors authStep;
  // the guarded render-phase update makes React discard the stale pass and
  // re-render with the fresh epoch before commit.
  const [nav, setNav] = useState({ step: authStep, epoch: 0 });
  if (nav.step !== authStep) {
    setNav({ step: authStep, epoch: nav.epoch + 1 });
  }
  const firstMount = nav.epoch === 0;

  // Shared-axis step variants. `custom` carries { dir, first }: the step
  // entering on the FIRST mount skips the X slide (its card rises instead
  // — stage 3), exiting steps always slide opposite to the travel direction.
  const stepVariants: Variants = {
    enter: ({ dir, first }: { dir: number; first: boolean }) => ({
      opacity: 0,
      x: fullMotion && !first ? 28 * dir : 0,
    }),
    center: { opacity: 1, x: 0 },
    exit: ({ dir }: { dir: number; first: boolean }) => ({
      opacity: 0,
      x: fullMotion ? -28 * dir : 0,
    }),
  };

  // Props for each step's motion wrapper (spread onto motion.div — the
  // key is passed explicitly at the call site, never via spread).
  const stepMotion = (stepKey: string) => ({
    "data-auth-step": stepKey,
    custom: { dir: stepDir, first: firstMount },
    variants: stepVariants,
    initial: "enter" as const,
    animate: "center" as const,
    exit: "exit" as const,
    transition: {
      x: fullMotion
        ? { type: "spring" as const, stiffness: 260, damping: 26 }
        : { duration: 0.12 },
      opacity: { duration: fullMotion ? 0.32 : 0.12, ease: "easeOut" as const },
    },
    className: "w-full",
  });

  return { firstMount, fullMotion, stepDir, stepMotion };
}
