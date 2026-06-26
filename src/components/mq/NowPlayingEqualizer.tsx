"use client";

import { memo } from "react";

/**
 * Shared "now playing" equalizer animation (P3.2).
 *
 * Previously duplicated in:
 * - TrackCard.tsx:22-40 (4 bars, trackEq0-3 keyframes)
 * - MainView.tsx:2393-2397 (3 bars, mq-eq-bar-1/2/3 keyframes)
 * - PlaylistView.tsx:844-861 (3 bars, inline animation)
 *
 * This is the single source. Uses CSS keyframes (defined in globals.css)
 * for 60fps without React re-renders.
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
  const barHeight = size === "sm" ? "h-2.5" : "h-3.5";
  const barWidth = size === "sm" ? "w-[1.5px]" : "w-[2px]";

  return (
    <span
      className={`inline-flex items-end gap-[2px] ${barHeight} ml-1.5 flex-shrink-0 ${className}`}
      aria-label="Now playing"
      role="status"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`mq-track-eq ${barWidth} rounded-full inline-block origin-bottom`}
          style={{
            backgroundColor: "var(--mq-accent)",
            boxShadow:
              "0 0 6px color-mix(in srgb, var(--mq-accent) 50%, transparent), 0 0 12px color-mix(in srgb, var(--mq-accent) 20%, transparent)",
            animationName: `trackEq${i}`,
            animationDuration: "0.5s",
            animationDelay: `${i * 0.08}s`,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}
    </span>
  );
});
