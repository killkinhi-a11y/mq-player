"use client";

import { useRef, useEffect, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScrollRevealProps {
  children: ReactNode;
  /** Animation direction: "up" (default), "down", "left", "right" */
  direction?: "up" | "down" | "left" | "right";
  /** Delay in seconds before animation starts (default: 0) */
  delay?: number;
  /** Duration in seconds (default: 0.6) */
  duration?: number;
  /** Distance in px to travel (default: 30) */
  distance?: number;
  /** IntersectionObserver threshold (default: 0.1) */
  threshold?: number;
  /** Whether to re-animate when scrolling back into view (default: false) */
  once?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Disable animation entirely */
  disabled?: boolean;
}

const directionMap = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};

/**
 * ScrollReveal — wraps children and animates them into view when scrolled into the viewport.
 * Uses IntersectionObserver for performance and framer-motion for smooth animations.
 */
export default function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.6,
  distance = 30,
  threshold = 0.1,
  once = true,
  className,
  disabled = false,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (disabled) {
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
  }, [disabled, once, threshold]);

  const d = directionMap[direction];

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={className} style={{ overflow: "hidden" }}>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{
              opacity: 0,
              x: d.x * distance,
              y: d.y * distance,
            }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
            }}
            exit={{
              opacity: 0,
              x: d.x * distance,
              y: d.y * distance,
            }}
            transition={{
              duration,
              delay,
              ease: [0.25, 0.1, 0.25, 1], // custom cubic-bezier for natural feel
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
