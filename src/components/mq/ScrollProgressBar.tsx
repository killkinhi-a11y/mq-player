"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";

/**
 * ScrollProgressBar — a thin accent-colored progress bar at the top of a scrollable container.
 * Shows how far the user has scrolled through the content.
 */
export default function ScrollProgressBar({ containerRef }: { containerRef?: React.RefObject<HTMLElement | null> }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const target = containerRef?.current || document.documentElement;
    if (!target) return;

    const onScroll = () => {
      const scrollTop = target.scrollTop || document.documentElement.scrollTop;
      const scrollHeight = target.scrollHeight - target.clientHeight;
      const p = scrollHeight > 0 ? Math.min(scrollTop / scrollHeight, 1) : 0;
      setProgress(p);
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    // Initial calculation
    onScroll();

    return () => target.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  const scaleX = useSpring(0, { stiffness: 300, damping: 40 });

  useEffect(() => {
    scaleX.set(progress);
  }, [progress, scaleX]);

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] z-[9998] origin-left"
      style={{
        scaleX,
        background: "var(--mq-accent, #e03131)",
        opacity: 0.8,
      }}
    />
  );
}
