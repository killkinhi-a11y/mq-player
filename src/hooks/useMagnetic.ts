"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * useMagnetic — магнитный эффект для элементов.
 *
 * Элемент притягивается к курсору когда тот рядом.
 * RAF batched, auto-disable на touch + reduced-motion.
 */

interface MagneticOptions {
  strength?: number;
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
  const [enabled, setEnabled] = useState(false);

  // Check capabilities AFTER hydration (SSR-safe)
  useEffect(() => {
    const canMagnetic =
      window.matchMedia("(hover: hover)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(canMagnetic);
  }, []);

  const update = useCallback(() => {
    rafRef.current = requestAnimationFrame(update);
    const t = targetRef.current;
    const c = currentRef.current;
    c.x += (t.x - c.x) * 0.15;
    c.y += (t.y - c.y) * 0.15;
    if (ref.current) {
      ref.current.style.transform = `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px)`;
    }
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
      if (!enabled) return;
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
    [enabled, radius, strength, update]
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
