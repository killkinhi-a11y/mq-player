"use client";

import { useEffect } from "react";

/**
 * Layout for /pip — overrides root layout body for a clean PiP window.
 * Hides the root splash screen and sets minimal body styles.
 */
export default function PiPLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Remove root splash screen immediately
    const splash = document.getElementById("mq-splash");
    if (splash) splash.remove();

    // Set clean body styles for PiP window
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.backgroundColor = "#0e0e0e";
    document.body.style.overflow = "hidden";
    document.body.style.userSelect = "none";
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }, []);

  return <>{children}</>;
}
