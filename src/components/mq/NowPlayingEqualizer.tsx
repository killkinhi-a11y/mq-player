"use client";

import { memo, useMemo } from "react";

/**
 * NowPlayingEqualizer v5 — надёжная анимация через CSS класс + variables.
 *
 * v4 проблема: React inline styles с animationName/Duration/Delay работают
 * нестабильно (Safari игнорирует, Chrome иногда теряет при re-render).
 *
 * v5 решение:
 * - CSS класс .mq-eq-bar с animation shorthand (надёжнее inline)
 * - Per-bar variance через CSS custom properties (--eq-duration, --eq-delay)
 * - Glow на родителе через filter: drop-shadow
 * - prefers-reduced-motion → статичные бары
 * - aria-hidden (декоративный)
 * - Только design tokens
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

const BAR_COUNT = 4;

export const NowPlayingEqualizer = memo(function NowPlayingEqualizer({
  size = "md",
  variant = "inline",
  paused = false,
  className = "",
}: NowPlayingEqualizerProps) {
  const cfg = SIZE_CONFIG[size];

  // Рандомные delay/duration для каждого бара — генерируются ОДИН раз
  // при mount. Даёт органичный, не механический паттерн.
  const barVariants = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, () => ({
      // duration 0.7s - 1.4s — естественный ритм
      duration: `${(0.7 + Math.random() * 0.7).toFixed(2)}s`,
      // delay 0s - 0.5s — асинхронный старт
      delay: `${(Math.random() * 0.5).toFixed(2)}s`,
    }));
  }, []);

  const barColor = variant === "overlay"
    ? "var(--mq-text-on-accent, #fff)"
    : "var(--mq-accent)";

  const glowColor = variant === "overlay"
    ? "var(--mq-text-on-accent, #fff)"
    : "var(--mq-accent)";

  return (
    <span
      className={`mq-eq-container ${paused ? "mq-eq-paused" : ""} ${className}`}
      style={{
        height: cfg.height,
        gap: cfg.gap,
        "--eq-glow": glowColor,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {barVariants.map((v, i) => (
        <span
          key={i}
          className="mq-eq-bar"
          style={{
            width: cfg.barWidth,
            height: cfg.height,
            backgroundColor: barColor,
            borderRadius: cfg.radius,
            "--eq-duration": v.duration,
            "--eq-delay": v.delay,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
});
