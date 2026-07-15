"use client";

import { useRef, useCallback } from "react";

/**
 * useMagnetic — магнитный эффект для кнопок.
 *
 * Кнопка притягивается к курсору когда тот рядом.
 * Создаёт premium «живой» эффект как на Awwwards-сайтах.
 *
 * Использование:
 *   const magnetic = useMagnetic({ strength: 0.3, radius: 80 });
 *   <button {...magnetic}>Click me</button>
 *
 * Производительность:
 * - RAF batched (через ref, без useState)
 * - GPU-only: transform translate
 * - Auto-disable на touch + reduced-motion
 * - Возвращается в 0 при уходе курсора
 */

interface MagneticOptions {
  /** Сила притяжения 0-1 (default: 0.3) */
  strength?: number;
  /** Радиус действия в px (default: 80) */
  radius?: number;
}

export function useMagnetic({
  strength = 0.3,
  radius = 80,
}: MagneticOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const update = useCallback(() => {
    rafRef.current = requestAnimationFrame(update);
    const t = targetRef.current;
    const c = currentRef.current;
    c.x += (t.x - c.x) * 0.15;
    c.y += (t.y - c.y) * 0.15;
    if (ref.current) {
      ref.current.style.transform = `translate(${c.x}px, ${c.y}px)`;
    }
    // Stop when settled
    if (Math.abs(t.x - c.x) < 0.1 && Math.abs(t.y - c.y) < 0.1 && t.x === 0 && t.y === 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (ref.current) {
        ref.current.style.transform = "";
      }
    }
  }, []);

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        targetRef.current = {
          x: dx * strength,
          y: dy * strength,
        };
      } else {
        targetRef.current = { x: 0, y: 0 };
      }

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(update);
      }
    },
    [radius, strength, update]
  );

  const handleLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(update);
    }
  }, [update]);

  const canMagnetic = typeof window !== "undefined"
    && window.matchMedia("(hover: hover)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    ref,
    onMouseMove: canMagnetic ? handleMove : undefined,
    onMouseLeave: canMagnetic ? handleLeave : undefined,
  };
}
