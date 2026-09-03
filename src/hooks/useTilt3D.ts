"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * useTilt3D — 3D параллакс tilt эффект для карточек.
 *
 * Inspired by: "WebGL: как сделать сайт с интерактивной 3D-графикой"
 * Реализовано через CSS 3D transforms (perspective + rotateX/rotateY),
 * без WebGL/Three.js — лёгкое и быстрое.
 *
 * Карточка наклоняется вслед за курсором мыши, создавая эффект глубины.
 * При уходе курсора — плавно возвращается в исходное положение.
 *
 * Использование:
 *   const tiltRef = useTilt3D({ max: 8, scale: 1.02 });
 *   <div ref={tiltRef} style={{ transformStyle: "preserve-3d" }}>...</div>
 *
 * Производительность:
 * - requestAnimationFrame для batched updates
 * - GPU-only: transform (rotateX, rotateY, scale)
 * - auto-disable на touch устройствах (через matchMedia hover:hover)
 * - auto-disable при prefers-reduced-motion
 */

interface TiltOptions {
  /** Максимальный угол наклона в градусах (default: 8) */
  max?: number;
  /** Scale при hover (default: 1.02) */
  scale?: number;
  /** Скорость возврата (default: 0.1 — меньше = плавнее) */
  reverseSpeed?: number;
}

export function useTilt3D({
  max = 8,
  scale = 1.02,
  reverseSpeed = 0.1,
}: TiltOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ rx: 0, ry: 0, sc: 1 });
  const currentRef = useRef({ rx: 0, ry: 0, sc: 1 });
  // Start handle for the RAF loop — installed by the effect below, so the
  // handlers never reference a loop closure during its own initialization
  // (react-hooks/immutability TDZ).
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const t = targetRef.current;
      const c = currentRef.current;

      // Lerp toward target
      c.rx += (t.rx - c.rx) * reverseSpeed;
      c.ry += (t.ry - c.ry) * reverseSpeed;
      c.sc += (t.sc - c.sc) * reverseSpeed;

      if (ref.current) {
        ref.current.style.transform = `perspective(800px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.sc})`;
      }
    };
    startRef.current = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
    };

    // CRITICAL: cleanup RAF on unmount
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [reverseSpeed]);

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // Calculate rotation: -max to +max degrees
      const ry = ((x - cx) / cx) * max;
      const rx = -((y - cy) / cy) * max;

      targetRef.current = { rx, ry, sc: scale };

      startRef.current();
    },
    [max, scale]
  );

  const handleEnter = useCallback(() => {
    targetRef.current.sc = scale;
    startRef.current();
  }, [scale]);

  const handleLeave = useCallback(() => {
    targetRef.current = { rx: 0, ry: 0, sc: 1 };
    // loop will keep running until unmount (same as before) — it lerps back to neutral
    startRef.current();
  }, []);

  // Check for reduced motion / touch device
  const canTilt = typeof window !== "undefined"
    && window.matchMedia("(hover: hover)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    ref,
    onMouseMove: canTilt ? handleMove : undefined,
    onMouseEnter: canTilt ? handleEnter : undefined,
    onMouseLeave: canTilt ? handleLeave : undefined,
  };
}
