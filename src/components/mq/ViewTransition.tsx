"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * ViewTransition — wraps a view and re-triggers a CSS fade+slide animation
 * whenever `trigger` changes, WITHOUT unmounting the children.
 *
 * Why not framer-motion AnimatePresence?
 *   AnimatePresence mode="wait" unmounts the old child, waits for exit
 *   animation, then mounts the new one. For heavy views like MessengerView
 *   that have SSE / polling / heartbeat useEffects, this means re-running
 *   those effects on every switch → cascade of state updates → React #185.
 *
 * How this works:
 *   - The wrapper div stays mounted (children never unmount).
 *   - When `trigger` changes, we directly toggle the CSS class on the DOM
 *     element via ref. This restarts the @keyframes mqViewEnter animation
 *     WITHOUT any React re-render.
 *   - Children keep their state, refs, and live subscriptions intact.
 *
 * Props:
 *   trigger         — value that changes when view switches (e.g. currentView)
 *   animationsEnabled — master toggle from store
 *   children        — the view component
 */
export function ViewTransition({
  trigger,
  animationsEnabled = true,
  children,
}: {
  trigger: string;
  animationsEnabled?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animationsEnabled) return;
    const el = ref.current;
    if (!el) return;
    // Force-restart the CSS animation by removing + re-adding the class
    // on the next frame. This is the standard "restart animation" trick.
    el.classList.remove("mq-view-enter");
    // Force a reflow so the browser registers the class removal.
    void el.offsetWidth;
    el.classList.add("mq-view-enter");
  }, [trigger, animationsEnabled]);

  if (!animationsEnabled) {
    return <>{children}</>;
  }

  return (
    <div ref={ref} style={{ willChange: "opacity, transform" }}>
      {children}
    </div>
  );
}
