"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * useMagnetic — магнитный эффект для элементов.
 *
 * Элемент притягивается к курсору когда тот над ним или рядом.
 * RAF batched, auto-disable на touch + reduced-motion.
 *
 * v2: работает по bounding rect (не distance from center),
 * чтобы эффект работал на больших элементах вроде Wave Card.
 */

interface MagneticOptions {
  /** Сила притяжения 0-1 (default: 0.3) */
  strength?: number;
  /** Доп. радиус за пределами элемента в px (default: 40) */
  padding?: number;
}

export function useMagnetic({
  strength = 0.3,
  padding = 40,
}: MagneticOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const can =
      window.matchMedia("(hover: hover)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(can);
  }, []);

  const update = useCallback(() => {
    rafRef.current = requestAnimationFrame(update);
    const t = targetRef.current;
    const c = currentRef.current;
    c.x += (t.x - c.x) * 0.12;
    c.y += (t.y - c.y) * 0.12;
    if (ref.current) {
      ref.current.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0)`;
    }
    // Stop when settled at center
    if (Math.abs(t.x - c.x) < 0.05 && Math.abs(t.y - c.y) < 0.05 && t.x === 0 && t.y === 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (ref.current) {
        ref.current.style.transform = "";
      }
    }
  }, []);

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Check if mouse is within padded rect
      const withinX = e.clientX >= rect.left - padding && e.clientX <= rect.right + padding;
      const withinY = e.clientY >= rect.top - padding && e.clientY <= rect.bottom + padding;
      if (!withinX || !withinY) {
        targetRef.current = { x: 0, y: 0 };
        return;
      }
      // Normalized position: -1 to 1 from center
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      // Max translation in px
      const maxShift = 20; // max 20px shift
      targetRef.current = {
        x: nx * maxShift * strength,
        y: ny * maxShift * strength,
      };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(update);
      }
    },
    [enabled, padding, strength, update]
  );

  const handleLeave = useCallback(() => {
    if (!enabled) return;
    targetRef.current = { x: 0, y: 0 };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(update);
    }
  }, [enabled, update]);

  return {
    ref,
    onMouseMove: enabled ? handleMove : undefined,
    onMouseLeave: enabled ? handleLeave : undefined,
  };
}
