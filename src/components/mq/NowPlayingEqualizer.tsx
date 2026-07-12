"use client";

import { memo } from "react";

/**
 * NowPlayingEqualizer v7 — inline SVG с SMIL анимацией.
 *
 * SVG SMIL animation работает в Chrome/Safari/Firefox с 2015 года,
 * не зависит от CSS keyframes, не блокируется CSP.
 *
 * Принцип:
 * - 4 <rect> баров, каждый в своей <g> с transform translate
 * - <animateTransform> с type="scale" масштабирует по Y
 * - transform-origin: bottom через translate Y offset
 * - Different begin/dur per bar для organic pattern
 * - Paused: freeze at 0.6 scale
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
    ? "white"
    : "var(--mq-accent)";

  const totalWidth = 4 * cfg.barWidth + 3 * cfg.gap;

  // Per-bar animation config — scale values for organic bounce
  const bars = [
    { dur: "0.85s", begin: "0s", values: "0.20;0.75;0.40;0.95;0.30;0.20" },
    { dur: "1.10s", begin: "0.15s", values: "0.45;0.80;0.25;0.60;0.45;0.45" },
    { dur: "0.70s", begin: "0.05s", values: "0.65;0.30;1.00;0.50;0.85;0.65" },
    { dur: "1.20s", begin: "0.25s", values: "0.35;0.70;0.20;0.55;0.35;0.35" },
  ];

  return (
    <svg
      width={totalWidth}
      height={cfg.height}
      viewBox={`0 0 ${totalWidth} ${cfg.height}`}
      className={`mq-eq-svg ${className}`}
      style={{ display: "block", flexShrink: 0, opacity: paused ? 0.5 : 1, transition: "opacity 0.3s" }}
      aria-hidden="true"
    >
      {bars.map((bar, i) => {
        const x = i * (cfg.barWidth + cfg.gap);
        // Bar is positioned with bottom at cfg.height (bottom of SVG)
        // We draw rect from (0,0) with width=barWidth, height=cfg.height
        // then translate the group to (x, cfg.height) and scale Y from bottom
        return (
          <g key={i} transform={`translate(${x},${cfg.height})`}>
            {/* The rect is drawn from y=-height to y=0 (bottom at 0) */}
            <rect
              x={0}
              y={-cfg.height}
              width={cfg.barWidth}
              height={cfg.height}
              rx={cfg.radius}
              ry={cfg.radius}
              fill={barColor}
            >
              {!paused && (
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values={`1,${bar.values}`}
                  dur={bar.dur}
                  begin={bar.begin}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                />
              )}
              {paused && (
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="1,0.6"
                  dur="0.01s"
                  fill="freeze"
                />
              )}
            </rect>
          </g>
        );
      })}
    </svg>
  );
});
