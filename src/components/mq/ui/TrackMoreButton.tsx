"use client";

import { memo, useCallback } from "react";
import { MoreHorizontal } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
   TrackMoreButton — THE trigger for the unified context menu.

   One button, one look, every surface. Opens on LMB. stopPropagation is
   HERE ONLY — surfaces never swallow the click themselves.

   Sizes: sm (28px, compact rows) / md (32px, default rows) / lg (36px).
   Desktop: revealed on row hover (opacity) — the reveal is opacity-only,
   owned by CSS on the parent group; the button's own hover is bg-only.
   Mobile: always visible (no hover to reveal).
   ══════════════════════════════════════════════════════════════════════════ */

interface TrackMoreButtonProps {
  onOpen: (e: React.MouseEvent) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  /** Force always-visible (cards without group-hover context). */
  alwaysVisible?: boolean;
}

const SIZES = {
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-9 h-9",
} as const;

const ICON_SIZES = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-4 h-4",
} as const;

export const TrackMoreButton = memo(function TrackMoreButton({
  onOpen,
  size = "md",
  label = "Ещё",
  className = "",
  alwaysVisible = false,
}: TrackMoreButtonProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onOpen(e);
    },
    [onOpen]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`${SIZES[size]} flex-shrink-0 flex items-center justify-center rounded-full cursor-pointer
        ${alwaysVisible ? "" : "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100"}
        transition-[background-color,color,opacity] duration-150
        hover:bg-[var(--mq-overlay-hover)]
        ${className}`}
      style={{ color: "var(--mq-text-muted)" }}
      aria-label={label}
      aria-haspopup="menu"
      title={label}
    >
      <MoreHorizontal className={ICON_SIZES[size]} />
    </button>
  );
});
