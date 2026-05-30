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
    spot.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px) translateZ(0)`;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const parent = spotRef.current?.parentElement;
    if (!parent) return;

    // Cache parent rect — update on resize only
    let parentRect = parent.getBoundingClientRect();
    const onResize = () => { parentRect = parent.getBoundingClientRect(); };
    window.addEventListener("resize", onResize);

    const onMouseMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX - parentRect.left, y: e.clientY - parentRect.top };
    };

    const onMouseLeave = () => {
      posRef.current = { x: -500, y: -500 };
    };

    parent.addEventListener("mousemove", onMouseMove);
    parent.addEventListener("mouseleave", onMouseLeave);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", onResize);
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
        contain: "layout style paint",
        transition: "opacity 0.3s ease",
      }}
    />
  );
}
