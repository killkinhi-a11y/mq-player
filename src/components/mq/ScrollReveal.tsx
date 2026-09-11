"use client";

import { useRef, useEffect, useState, ReactNode, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

/* v68 premium motion: 8px rise (was 16 — travel felt cheap), 0.42s,
   expo-out curve. Scroll-reveal stays subtle: the reader should notice
   content appearing, not the movement itself. */
const PREMIUM_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const DIRECTION = { up: { x: 0, y: 1 }, down: { x: 0, y: -1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } } as const;

export default function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.42,
  distance = 8,
  threshold = 0.1,
  once = true,
  className,
  disabled = false,
}: ScrollRevealProps) {
  // Skip animations on mobile for performance
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 640;
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasAnimated = useRef(false);

  const shouldSkip = isMobile || disabled;

  useEffect(() => {
    if (shouldSkip) {
      setIsVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (once && hasAnimated.current) return;
          hasAnimated.current = true;
          setIsVisible(true);
        } else if (!once) {
          setIsVisible(false);
          hasAnimated.current = false;
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldSkip, once, threshold]);

  if (shouldSkip) {
    return <div className={className}>{children}</div>;
  }

  const d = DIRECTION[direction];

  return (
    <div ref={ref} className={className} style={{ overflow: "hidden", contain: "layout style paint" }}>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, x: d.x * distance, y: d.y * distance }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: d.x * distance, y: d.y * distance }}
            transition={{ duration, delay, ease: PREMIUM_EASE }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
