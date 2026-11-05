"use client";

// Messenger shell geometry: mobile breakpoint, measured shell top
// (--mq-msgr-top) and the iOS keyboard offset (--mq-kb-offset).
// Extracted verbatim from MessengerView (Task B).
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

export function useMessengerLayout(shellRef: RefObject<HTMLDivElement | null>, compactMode: boolean): boolean {
  const [isMobileView, setIsMobileView] = useState(false);

  // ── Detect mobile ──
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Measured shell top → --mq-msgr-top (v14 P0) ──
  // messenger.css sizes the shell as 100dvh − measured top − player zone.
  // The top offset is real geometry (nav + banners + paddings above the
  // shell), re-measured on viewport resizes and body layout changes
  // (banner mount/unmount) — no magic constants.
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const top = Math.round(el.getBoundingClientRect().top);
      if (top > 0) el.style.setProperty("--mq-msgr-top", `${top}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [compactMode, shellRef]);

  // ── v72 iOS keyboard: visualViewport compensation ──
  // Android is covered by viewport.interactiveWidget=resizes-content
  // (layout.tsx). iOS Safari never resizes the layout viewport — fixed
  // composers sit BEHIND the keyboard. Track the visual viewport and
  // expose the keyboard height as a CSS var the composer consumes
  // (padding-bottom), so it rides just above the keys.
  useEffect(() => {
    const root = document.documentElement;
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--mq-kb-offset", kb > 24 ? `${Math.round(kb)}px` : "0px");
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.setProperty("--mq-kb-offset", "0px");
    };
  }, []);

  return isMobileView;
}
