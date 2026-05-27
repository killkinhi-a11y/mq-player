"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useDominantColor, type DominantColors } from "@/hooks/useDominantColor";

export default function CinematicAtmosphere() {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const colors = useDominantColor();

  const rafRef = useRef<number>(0);
  const prevColorsRef = useRef<DominantColors | null>(null);

  // ── Batch CSS variable updates into a single rAF ──
  useEffect(() => {
    // Skip if colors haven't actually changed
    if (
      prevColorsRef.current &&
      prevColorsRef.current.primary === colors.primary &&
      prevColorsRef.current.secondary === colors.secondary
    ) {
      return;
    }
    prevColorsRef.current = colors;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const root = document.documentElement.style;
      // ── DO NOT override theme accent (--mq-accent) from cover art! ──
      // The user's chosen theme must be respected. Art colors are stored
      // in dedicated --mq-art-* variables for optional use only.
      root.setProperty("--mq-art-primary", colors.primary);
      root.setProperty("--mq-art-secondary", colors.secondary);
      root.setProperty("--mq-art-muted", colors.muted);
      root.setProperty("--mq-art-vibrant", colors.vibrant);
      root.setProperty("--mq-art-dark", colors.dark);
      root.setProperty("--mq-art-primary-rgb", `${colors.rgb.r}, ${colors.rgb.g}, ${colors.rgb.b}`);
    });

    return () => cancelAnimationFrame(rafRef.current);
  }, [colors]);

  // ── Respect reduced-motion preference ──
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const shouldAnimate = animationsEnabled && !prefersReducedMotion;

  // ── No track = neutral dark state, fully faded ──
  if (!currentTrack) {
    return (
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {/* Single dark ambient with very low opacity */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 0,
            transition: "opacity 1.5s ease",
          }}
        />
      </div>
    );
  }

  // Opacity: subtle — this is atmosphere, not a screensaver
  const baseOpacity = isPlaying ? 0.12 : 0.06;

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* ── Layer 1: Massive blurred gradient blob (top-left) using primary color ── */}
      <div
        className="absolute mq-gpu-opacity"
        style={{
          top: "-20%",
          left: "-15%",
          width: "70%",
          height: "70%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${colors.primary}33 0%, ${colors.primary}11 40%, transparent 70%)`,
          opacity: baseOpacity,
          transition: "opacity 1.5s ease, background 1.5s ease",
          animation: shouldAnimate ? "mq-atmosphere-drift 20s ease-in-out infinite" : "none",
          willChange: "opacity, transform",
          transform: "translateZ(0)",
        }}
      />

      {/* ── Layer 2: Secondary gradient blob (bottom-right) using secondary color ── */}
      <div
        className="absolute mq-gpu-opacity"
        style={{
          bottom: "-15%",
          right: "-10%",
          width: "60%",
          height: "60%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${colors.secondary}33 0%, ${colors.secondary}11 40%, transparent 70%)`,
          opacity: baseOpacity * 0.8,
          transition: "opacity 1.5s ease, background 1.5s ease",
          animation: shouldAnimate ? "mq-atmosphere-drift-alt 25s ease-in-out infinite" : "none",
          willChange: "opacity, transform",
          transform: "translateZ(0)",
        }}
      />

      {/* ── Layer 3: Subtle noise texture overlay ── */}
      <div
        className="absolute inset-0"
        style={{
          opacity: isPlaying ? 0.03 : 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          transition: "opacity 1.5s ease",
          animation: shouldAnimate ? "mq-atmosphere-breathe 8s ease-in-out infinite" : "none",
          willChange: "opacity",
        }}
      />

      {/* ── Layer 4: Accent glow pulse (center-bottom, subtle) ── */}
      <div
        className="absolute mq-gpu-opacity"
        style={{
          bottom: "-10%",
          left: "15%",
          right: "15%",
          height: "40%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 100%, ${colors.vibrant}22 0%, transparent 70%)`,
          opacity: isPlaying ? 0.08 : 0.03,
          transition: "opacity 1.5s ease, background 1.5s ease",
          animation: shouldAnimate ? "mq-atmosphere-pulse 12s ease-in-out infinite" : "none",
          willChange: "opacity, transform",
          transform: "translateZ(0)",
        }}
      />
    </div>
  );
}
