"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";

/**
 * useRecUpdates — polls /api/social/rec-updates every 30s for a hash.
 * If the hash changes (user liked/disliked a track, or history grew),
 * triggers a recommendations refetch via the retryTick mechanism.
 *
 * Phase 2C: gated via authGate — demo/unauthenticated sessions never poll.
 *
 * Usage in MainView:
 *   const { retryTick } = useRecUpdates();
 *   // pass retryTick to the recommendations useEffect deps
 */

export function useRecUpdates(onChange: () => void) {
  const lastHashRef = useRef<string | null>(null);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const check = async () => {
      const st = useAppStore.getState();
      if (!canPollProtected(st.userId, st.isAuthenticated)) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        return;
      }
      try {
        const res = await fetch("/api/social/rec-updates");
        if (res.status === 401) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          controlled401Recovery("social/rec-updates");
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.hash && data.hash !== lastHashRef.current) {
          if (lastHashRef.current !== null) {
            // Hash changed → trigger refetch
            onChange();
          }
          lastHashRef.current = data.hash;
        }
      } catch {
        // Silent
      }
    };

    // Initial check (immediately gated — no request for demo users)
    check();
    intervalRef.current = setInterval(check, 30000); // 30s

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, onChange]);
}
