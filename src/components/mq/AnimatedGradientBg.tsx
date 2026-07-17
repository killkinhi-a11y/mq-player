"use client";

import { memo, useRef, useEffect } from "react";

/**
 * AnimatedGradientBg — живой mesh-градиент фон.
 *
 * Анимированные blobs accent-цвета плавно двигаются под контентом.
 * - 3 blob'а с разными траекториями
 * - CSS animation (не JS) — 0 CPU cost
 * - Очень низкая opacity (0.03-0.06) — subtle
 * - Auto-disable при reduced-motion
 * - Fixed background, pointer-events-none
 */

export const AnimatedGradientBg = memo(function AnimatedGradientBg() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (containerRef.current) {
        containerRef.current.style.display = "none";
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-10%",
          width: "50vw",
          height: "50vw",
          borderRadius: "50%",
          background: "var(--mq-accent)",
          opacity: 0.04,
          filter: "blur(80px)",
          animation: "mq-blob-float-1 20s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "30%",
          right: "-15%",
          width: "45vw",
          height: "45vw",
          borderRadius: "50%",
          background: "var(--mq-accent)",
          opacity: 0.03,
          filter: "blur(100px)",
          animation: "mq-blob-float-2 25s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          left: "30%",
          width: "40vw",
          height: "40vw",
          borderRadius: "50%",
          background: "var(--mq-accent)",
          opacity: 0.05,
          filter: "blur(60px)",
          animation: "mq-blob-float-3 18s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes mq-blob-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10vw, 5vh) scale(1.1); }
          66% { transform: translate(-5vw, 10vh) scale(0.9); }
        }
        @keyframes mq-blob-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-8vw, 8vh) scale(0.85); }
          66% { transform: translate(5vw, -5vh) scale(1.15); }
        }
        @keyframes mq-blob-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10vw, -8vh) scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="mq-blob-float"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
});
