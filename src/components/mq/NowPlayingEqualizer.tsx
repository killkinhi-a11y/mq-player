"use client";

import { memo } from "react";

/**
 * Shared "now playing" equalizer animation.
 *
 * Uses inline styles for animation (not CSS classes) to avoid conflicts
 * with mq-eq-bar nth-child rules in globals.css.
 *
 * Each bar has different duration + delay for organic wave effect.
 * transformOrigin: bottom ensures bars grow from bottom up.
 *
 * Usage:
 *   <NowPlayingEqualizer />         // default size
 *   <NowPlayingEqualizer size="sm" /> // smaller variant
 */

interface NowPlayingEqualizerProps {
  size?: "sm" | "md";
  className?: string;
}

export const NowPlayingEqualizer = memo(function NowPlayingEqualizer({
  size = "md",
  className = "",
}: NowPlayingEqualizerProps) {
  const barHeight = size === "sm" ? 10 : 14;
  const barWidth = size === "sm" ? 1.5 : 2;
  const gap = size === "sm" ? 1.5 : 2;

  return (
    <span
      className={`inline-flex items-end flex-shrink-0 ${className}`}
      style={{ height: barHeight, gap }}
      aria-label="Now playing"
      role="status"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: barWidth,
            height: "100%",
            backgroundColor: "var(--mq-accent)",
            borderRadius: 9999,
            transformOrigin: "bottom",
            animation: `mq-eq 0.6s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.12}s`,
            animationDuration: `${0.45 + i * 0.1}s`,
            boxShadow: "0 0 4px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
          }}
        />
      ))}
    </span>
  );
});
