"use client";

import { useEffect, useState } from "react";

/**
 * Current wall-clock time as render-safe state. Calling Date.now() during
 * render is impure (results differ between renders); this hook samples it on
 * mount and then every `intervalMs`, so relative labels ("5 мин назад") stay
 * fresh without breaking React's purity rules.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
