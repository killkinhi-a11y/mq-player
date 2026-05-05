"use client";

import { useRef, useEffect, useCallback } from "react";

/**
 * CursorSpotlight — a soft radial gradient glow that follows the mouse cursor
 * across the entire parent container. Uses requestAnimationFrame for smooth performance.
 * The glow reads the --mq-accent CSS variable for automatic theming.
 */
export default function CursorSpotlight() {
  const spotRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -500, y: -500 });
  const rafRef = useRef<number>(0);
  const currentRef = useRef({ x: -500, y: -500 });

  const animate = useCallback(() => {
    const spot = spotRef.current;
    if (!spot) return;
    // Smooth interpolation (lerp) for silky movement
    const lerp = 0.12;
    currentRef.current.x += (posRef.current.x - currentRef.current.x) * lerp;
    currentRef.current.y += (posRef.current.y - currentRef.current.y) * lerp;
    spot.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const parent = spotRef.current?.parentElement;
    if (!parent) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      posRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onMouseLeave = () => {
      posRef.current = { x: -500, y: -500 };
    };

    parent.addEventListener("mousemove", onMouseMove);
    parent.addEventListener("mouseleave", onMouseLeave);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      parent.removeEventListener("mousemove", onMouseMove);
      parent.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  return (
    <div
      ref={spotRef}
      className="pointer-events-none fixed z-[9999]"
      style={{
        width: 500,
        height: 500,
        marginLeft: -250,
        marginTop: -250,
        borderRadius: "50%",
        background: "radial-gradient(circle, var(--mq-accent, rgba(255,255,255,0.06)) 0%, transparent 70%)",
        opacity: 0.07,
        willChange: "transform",
        transition: "opacity 0.3s ease",
      }}
    />
  );
}
