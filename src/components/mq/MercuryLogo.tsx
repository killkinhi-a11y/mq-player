"use client";

import { useState, useEffect, memo } from "react";

/**
 * MercuryLogo — "MQ" letters that assemble from liquid mercury on entry.
 * Hover triggers the same mercury effect again.
 *
 * CSS classes in globals.css:
 * - mq-mercury-entry: one-time entry animation (blur + scale + rotate)
 * - mq-mercury-logo: container with radial glow on hover
 * - mq-mercury-text: chrome/mercury gradient text + shimmer sweep
 * - mq-mercury-hover: hover animation (wobble + blur + brightness)
 */

interface MercuryLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

function MercuryLogoBase({ size = "md", className = "" }: MercuryLogoProps) {
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    // Trigger entry animation after mount
    const timer = setTimeout(() => setHasEntered(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const sizeClass = size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-xl";
  const fontWeight = "font-black tracking-tighter";

  return (
    <span
      className={`mq-mercury-logo ${className}`}
      aria-label="MQ Player"
      role="img"
    >
      <span
        className={`mq-mercury-text ${sizeClass} ${fontWeight} ${hasEntered ? "mq-mercury-entry" : ""}`}
        style={{ position: "relative" }}
      >
        MQ
      </span>
    </span>
  );
}

export const MercuryLogo = memo(MercuryLogoBase);
