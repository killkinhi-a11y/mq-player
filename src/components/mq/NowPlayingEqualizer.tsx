"use client";

import { memo, useMemo } from "react";

/**
 * NowPlayingEqualizer v6 — максимальная надёжность.
 *
 * v5 проблема: filter: drop-shadow на родителе создавал stacking context,
 * который в некоторых браузерах ломал transform: scaleY на детях. Также
 * CSS custom properties для animation duration не работали в старых Safari.
 *
 * v6 решение:
 * - НЕТ filter на родителе (glow через box-shadow на каждом баре, но только
 *   на sm+ размерах где он виден)
 * - Pure CSS класс .mq-eq-bar с зашитой animation — БЕЗ inline animation
 * - Per-bar variance через inline transform: scaleY(0.X) в pause state
 *   и через CSS :nth-child() для animation-delay/duration (статично, надёжно)
 * - 4 бара, размеры через inline width/height (CSS не парсит JS переменные)
 * - paused = просто добавляем класс .mq-eq-paused на контейнер
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
  xs: { height: 10, barWidth: 2, gap: 1.5, radius: 1 },
  sm: { height: 14, barWidth: 2.5, gap: 2, radius: 1.5 },
  md: { height: 18, barWidth: 3, gap: 2.5, radius: 2 },
  lg: { height: 24, barWidth: 3.5, gap: 3, radius: 2.5 },
};

export const NowPlayingEqualizer = memo(function NowPlayingEqualizer({
  size = "md",
  variant = "inline",
  paused = false,
  className = "",
}: NowPlayingEqualizerProps) {
  const cfg = SIZE_CONFIG[size];

  const barColor = variant === "overlay"
    ? "var(--mq-text-on-accent, #fff)"
    : "var(--mq-accent)";

  return (
    <span
      className={`mq-eq-container ${paused ? "mq-eq-paused" : ""} ${className}`}
      style={{
        height: cfg.height,
        gap: cfg.gap,
        // NO filter here — filter creates stacking context that breaks
        // transform: scaleY on children in some browsers.
      }}
      aria-hidden="true"
    >
      <span
        className="mq-eq-bar mq-eq-bar-1"
        style={{
          width: cfg.barWidth,
          height: cfg.height,
          backgroundColor: barColor,
          borderRadius: cfg.radius,
        }}
      />
      <span
        className="mq-eq-bar mq-eq-bar-2"
        style={{
          width: cfg.barWidth,
          height: cfg.height,
          backgroundColor: barColor,
          borderRadius: cfg.radius,
        }}
      />
      <span
        className="mq-eq-bar mq-eq-bar-3"
        style={{
          width: cfg.barWidth,
          height: cfg.height,
          backgroundColor: barColor,
          borderRadius: cfg.radius,
        }}
      />
      <span
        className="mq-eq-bar mq-eq-bar-4"
        style={{
          width: cfg.barWidth,
          height: cfg.height,
          backgroundColor: barColor,
          borderRadius: cfg.radius,
        }}
      />
    </span>
  );
});
