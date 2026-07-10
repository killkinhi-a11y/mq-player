"use client";

import { memo } from "react";

/**
 * NowPlayingEqualizer v3 — упрощённая, надёжная визуализация.
 *
 * v3 принципы:
 * - ЯВНАЯ height на каждом баре (не "100%" — percentage height в flex
 *   может не вычислиться корректно с filter на родителе)
 * - Без filter: drop-shadow на родителе (drop-shadow создаёт stacking
 *   context и в некоторых браузерах ломает transform: scaleY на детях)
 * - Без gradient на barах (gradient + scaleY может давать артефакты)
 * - 5 полос, каждая со своим @keyframes (mq-eq-bar-1..5)
 * - paused state: animation-play-state: paused + opacity 0.5
 *
 * CRITICAL: spans должны иметь display: "block" — transform: scaleY
 * не работает на inline элементах (span default).
 */

type EqSize = "xs" | "sm" | "md" | "lg";
type EqVariant = "overlay" | "inline";

interface NowPlayingEqualizerProps {
  size?: EqSize;
  variant?: EqVariant;
  paused?: boolean;
  className?: string;
}

const SIZE_CONFIG: Record<EqSize, { height: number; barWidth: number; gap: number; radius: number }> = {
  xs: { height: 8, barWidth: 1.5, gap: 1, radius: 1 },
  sm: { height: 12, barWidth: 2, gap: 1.5, radius: 1.5 },
  md: { height: 16, barWidth: 2.5, gap: 2, radius: 2 },
  lg: { height: 22, barWidth: 3, gap: 2.5, radius: 2.5 },
};

const BAR_CONFIG = [
  { keyframe: "mq-eq-bar-1", duration: "0.85s", delay: "0s", widthMul: 0.7 },
  { keyframe: "mq-eq-bar-2", duration: "1.10s", delay: "0.15s", widthMul: 0.85 },
  { keyframe: "mq-eq-bar-3", duration: "0.70s", delay: "0.05s", widthMul: 1.0 },
  { keyframe: "mq-eq-bar-4", duration: "1.20s", delay: "0.25s", widthMul: 0.85 },
  { keyframe: "mq-eq-bar-5", duration: "0.95s", delay: "0.10s", widthMul: 0.7 },
];

export const NowPlayingEqualizer = memo(function NowPlayingEqualizer({
  size = "md",
  variant = "inline",
  paused = false,
  className = "",
}: NowPlayingEqualizerProps) {
  const cfg = SIZE_CONFIG[size];

  // overlay — белые полосы для тёмного фона (поверх обложки)
  // inline — accent-цветные полосы для использования рядом с текстом
  const barColor = variant === "overlay"
    ? "rgba(255,255,255,0.95)"
    : "var(--mq-accent)";

  return (
    <span
      className={`inline-flex items-end flex-shrink-0 ${paused ? "mq-eq-paused" : ""} ${className}`}
      style={{
        height: cfg.height,
        gap: cfg.gap,
        display: "inline-flex",
        // NO filter on parent — drop-shadow creates a stacking context
        // that can break transform: scaleY on children in some browsers.
        // Glow is achieved via box-shadow on each bar instead (see below).
      }}
      aria-label={paused ? "На паузе" : "Сейчас играет"}
      role="status"
    >
      {BAR_CONFIG.map((bar, i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: cfg.barWidth * bar.widthMul,
            // ЯВНАЯ height вместо "100%" — percentage height in flex
            // with filter on parent can fail to compute in some browsers.
            height: cfg.height,
            backgroundColor: barColor,
            borderRadius: cfg.radius,
            transformOrigin: "bottom",
            // Use SEPARATE animation properties instead of shorthand.
            // React inline style 'animation' shorthand can be flaky in
            // some browsers (Safari especially) — separate properties
            // are more reliable.
            animationName: bar.keyframe,
            animationDuration: bar.duration,
            animationTimingFunction: "ease-in-out",
            animationDelay: bar.delay,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            // Subtle glow via box-shadow (не filter:drop-shadow на родителе)
            boxShadow: paused ? "none" : `0 0 3px ${variant === "overlay" ? "rgba(255,255,255,0.6)" : "color-mix(in srgb, var(--mq-accent) 50%, transparent)"}`,
            transition: "opacity 0.3s ease-out",
            ...(paused ? { animationPlayState: "paused", opacity: 0.5 } : {}),
          }}
        />
      ))}
    </span>
  );
});
