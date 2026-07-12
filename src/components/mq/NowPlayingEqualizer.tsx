"use client";

import { memo, useMemo } from "react";

/**
 * NowPlayingEqualizer v4 — полная переработка.
 *
 * Принципы v4:
 * - 4 бара вместо 5 (видно на 40px иконке без слияния)
 * - ОДИН общий @keyframes mq-eq-bounce + per-bar variance через
 *   animation-delay/duration (рандомные при mount, не статика)
 * - Glow на родителе (один filter: drop-shadow), не на каждом баре
 * - prefers-reduced-motion → статичные бары на 60% высоты
 * - aria-hidden (декоративный), label на родительском контейнере
 * - Только design tokens, никаких rgba(255,255,255,*) хардкодов
 * - GPU-only: transform: scaleY + opacity, no layout properties
 *
 * Используется:
 * - PlayerBar: overlay variant (на обложке трека, ~40px)
 * - TrackCard: inline variant (рядом с текстом, ~12px)
 * - MainView: inline variant (в карточке текущего трека, ~8px)
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
  // при mount (useMemo с пустыми deps). Это даёт органичный, не механический
  // паттерн: каждый бар «живёт» самостоятельно.
  const barVariants = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, () => ({
      // duration 0.7s - 1.4s — естественный ритм
      duration: `${0.7 + Math.random() * 0.7}s`,
      // delay 0s - 0.5s — асинхронный старт
      delay: `${Math.random() * 0.5}s`,
    }));
  }, []);

  // overlay — белые полосы (через --mq-text-on-accent токен, не хардкод)
  // inline — accent-цветные полосы
  const barColor = variant === "overlay"
    ? "var(--mq-text-on-accent, #fff)"
    : "var(--mq-accent)";

  const glowColor = variant === "overlay"
    ? "var(--mq-text-on-accent, #fff)"
    : "var(--mq-accent)";

  return (
    <span
      className={`inline-flex items-end flex-shrink-0 ${className}`}
      style={{
        height: cfg.height,
        gap: cfg.gap,
        display: "inline-flex",
        // Единый glow на родителе — один paint layer вместо 5 box-shadow
        filter: paused ? "none" : `drop-shadow(0 0 2px ${glowColor})`,
        // Reduced motion: static bars at 60% height
        ...(paused ? { opacity: 0.5 } : {}),
      }}
      aria-hidden="true"
    >
      {barVariants.map((v, i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: cfg.barWidth,
            height: cfg.height,
            backgroundColor: barColor,
            borderRadius: cfg.radius,
            transformOrigin: "bottom",
            // ОДИН общий keyframes + per-bar variance
            animationName: paused ? "none" : "mq-eq-bounce",
            animationDuration: v.duration,
            animationTimingFunction: "cubic-bezier(0.45, 0, 0.55, 1)",
            animationDelay: v.delay,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            // Paused: static 60% height, no animation
            transform: paused ? "scaleY(0.6)" : undefined,
            // Smooth transition when pausing
            transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
          }}
        />
      ))}
    </span>
  );
});
