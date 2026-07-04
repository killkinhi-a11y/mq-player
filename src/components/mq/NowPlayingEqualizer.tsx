"use client";

import { memo } from "react";

/**
 * NowPlayingEqualizer v2 — полностью переработанная визуализация.
 *
 * Что изменилось vs v1:
 * - 5 полос разной ширины (центральная — самая широкая, как в спектре)
 * - Каждая полоса имеет СВОЙ собственный @keyframes (mq-eq-bar-1..5),
 *   не просто delay/duration от одного keyframe. Движение реально
 *   непохожее между полосами, как в живом аудио-анализаторе.
 * - Gradient на полосах: accent снизу → светлее сверху (color-mix с #fff)
 * - Soft glow только когда playing (filter: drop-shadow)
 * - Props: size (xs/sm/md/lg), variant (overlay/inline), paused
 * - Paused state: animation freezes at current keyframe position, bars
 *   dim to 50% opacity. Glow is removed.
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

// Конфиг размеров: высота, ширина полосы, gap, radius
const SIZE_CONFIG: Record<EqSize, { height: number; barWidth: number; gap: number; radius: number }> = {
  xs: { height: 8, barWidth: 1.5, gap: 1, radius: 1 },
  sm: { height: 12, barWidth: 2, gap: 1.5, radius: 1.5 },
  md: { height: 16, barWidth: 2.5, gap: 2, radius: 2 },
  lg: { height: 22, barWidth: 3, gap: 2.5, radius: 2.5 },
};

// Каждая полоса: свой keyframe, своя длительность, своя задержка
// Ширина: средние полосы шире (как центр спектра)
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

  // overlay variant — для тёмного фона поверх обложки (белые полосы с slight transparency)
  // inline variant — для использования рядом с названием трека (accent gradient)
  const barGradient = variant === "overlay"
    ? "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.65))"
    : "linear-gradient(to top, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 55%, #fff))";

  const glowColor = variant === "overlay" ? "rgba(255,255,255,0.5)" : "var(--mq-accent)";

  return (
    <span
      className={`inline-flex items-end flex-shrink-0 ${paused ? "mq-eq-paused" : ""} ${className}`}
      style={{
        height: cfg.height,
        gap: cfg.gap,
        display: "inline-flex",
        // Glow только когда playing; на pause — без glow
        filter: paused ? "none" : `drop-shadow(0 0 ${Math.max(2, cfg.height / 4)}px color-mix(in srgb, ${glowColor} 50%, transparent))`,
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
            height: "100%",
            background: barGradient,
            borderRadius: cfg.radius,
            transformOrigin: "bottom",
            animation: `${bar.keyframe} ${bar.duration} ease-in-out ${bar.delay} infinite alternate`,
            // Smooth opacity transition при pause/unpause. Transform
            // transition бесполезен с animation (animation управляет
            // transform напрямую), поэтому только opacity.
            transition: "opacity 0.3s ease-out",
            // Дублируем animation-play-state inline для надёжности (CSS
            // класс .mq-eq-paused span тоже задаёт paused, но inline
            // имеет более высокий приоритет и не требует !important)
            ...(paused ? { animationPlayState: "paused", opacity: 0.5 } : {}),
          }}
        />
      ))}
    </span>
  );
});
