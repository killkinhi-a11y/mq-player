"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* ══════════════════════════════════════════════════════════════════════════
   TextSwap — premium now-playing text change (v68 motion system).

   The signature animation of premium players: when the track changes, the
   old title slides up and fades while the new one rises from below —
   one continuous 200ms gesture instead of an instant text snap.

   Contract:
   • ONE WRITER: Framer animates ONLY transform + opacity on the inner
     span. Callers must not put CSS transitions on the inner text.
   • Layout-safe: `mode="popLayout"` pops the exiting span out of flow
     (absolute), so the entering text defines the line immediately —
     no jump, no reflow cascade. The outer tag clips it (overflow
     hidden via truncate / line-clamp classes supplied by the caller).
   • Long-title contract stays intact: caller owns min-w-0/flex-1 on the
     OUTER element; this component renders the inner span as
     block + truncate-ready.
   • `initial={false}` — first render is static (no animation on mount;
     view-level entrance already animates the container).
   • Reduced motion: framer respects `useReducedMotion` — but we also
     gate via CSS (motion-reduce) callers may pass distance=0.

   Usage:
     <TextSwap text={track.title} swapKey={track.id}
               className="min-w-0 flex-1 text-sm font-semibold truncate"
               style={{ color: "var(--mq-text)" }} />
   ══════════════════════════════════════════════════════════════════════════ */

const PREMIUM_EASE = [0.16, 1, 0.3, 1] as const;

export interface TextSwapProps {
  /** Text to render; changing `swapKey` (not text diff) triggers the swap. */
  text: string;
  /** Key that identifies the "identity" of the text (track id, user id…). */
  swapKey: string | number;
  className?: string;
  style?: React.CSSProperties;
  /** Rise distance in px (4 rows/compact, 8 hero). */
  distance?: number;
  /** Swap duration seconds (default 0.26). */
  duration?: number;
  /** Element for the outer wrapper. */
  as?: "span" | "p" | "h1" | "h2" | "div";
  /** Multi-line clamp look (h1 titles). */
  multiline?: boolean;
  ariaLabel?: string;
}

const TagMap = { span: "span", p: "p", h1: "h1", h2: "h2", div: "div" } as const;

export const TextSwap = memo(function TextSwap({
  text,
  swapKey,
  className = "",
  style,
  distance = 4,
  duration = 0.26,
  as = "span",
  multiline = false,
  ariaLabel,
}: TextSwapProps) {
  const Tag = TagMap[as];
  return (
    <Tag
      className={`${className} ${multiline ? "line-clamp-2" : ""} relative block overflow-hidden`}
      style={style}
      aria-label={ariaLabel ?? text}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          layout={false}
          initial={{ opacity: 0, y: distance }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -distance }}
          transition={{ duration, ease: PREMIUM_EASE }}
          className={`block w-full ${multiline ? "line-clamp-2" : "truncate"}`}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </Tag>
  );
});

export default TextSwap;
