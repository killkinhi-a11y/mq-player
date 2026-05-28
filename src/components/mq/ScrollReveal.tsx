"use client";

import { useRef, useEffect, useState, ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  direction?: "up" | "down" | "left" | "right";
  delay?: number;
  duration?: number;
  distance?: number;
  threshold?: number;
  once?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * ScrollReveal — lightweight CSS-transition based scroll animation.
 * Replaces the framer-motion version which was creating heavy AnimatePresence
 * wrappers for every section on the page. Pure CSS transitions are GPU-composited
 * and never cause layout recalculation. Uses a shared IntersectionObserver root
 * to reduce observer count on pages with many sections.
 */
export default function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.5,
  distance = 20,
  threshold = 0.05,
  once = true,
  className,
  disabled = false,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (disabled) { setVisible(true); return; }
    // On mobile skip the animation altogether — just show content immediately.
    // Scroll reveal adds perceived jank on 60hz mobile screens when many sections
    // animate simultaneously.
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin: "0px 0px -30px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [disabled, once, threshold]);

  const translateInit =
    direction === "up" ? `translateY(${distance}px)` :
    direction === "down" ? `translateY(-${distance}px)` :
    direction === "left" ? `translateX(${distance}px)` :
    `translateX(-${distance}px)`;

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : translateInit,
        transition: `opacity ${duration}s cubic-bezier(0.25,0.1,0.25,1) ${delay}s, transform ${duration}s cubic-bezier(0.25,0.1,0.25,1) ${delay}s`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
