/**
 * hoverCapability.ts — one place that knows whether hover exists.
 *
 * Framer-motion `whileHover`/`whileTap` props fire on touch devices too
 * (a tap produces a brief hover) — lifts/scales flash on every touch.
 * CSS hovers are already gated by `@media (hover: hover)` (Tailwind v4),
 * but framer props are not. Gate them with these helpers.
 *
 * Usage:
 *   import { canHover, hoverLift } from "@/lib/hoverCapability";
 *   <motion.div whileHover={hoverLift(-2)} ... />   // {} on touch, no flash
 */

/** True only when the primary input can hover (mouse/trackpad). */
export const canHover: boolean =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Pass-through on hover-capable devices, {} on touch — for wrapping whole
 *  whileHover objects: whileHover={hoverProps({ scale: 1.05, ... })}.
 *  Returns any on purpose: keeps framer-motion's contextual typing of
 *  ease/spring literals at the call site. */
export function hoverProps(props: object): any {
  return canHover ? props : {};
}

/** Hover lift (translateY, negative = up). Returns {} on touch devices. */
export function hoverLift(px: number = -2): { y?: number } {
  return canHover ? { y: px } : {};
}

/** Hover scale. Returns {} on touch devices. */
export function hoverScale(scale: number = 1.02): { scale?: number } {
  return canHover ? { scale } : {};
}
