"use client";

// Friends' online statuses, polled every 30s for real sessions only
// (demo sessions get the seeded map). Extracted verbatim from MessengerView.
import { useEffect, useState } from "react";
import { canPollProtected } from "@/lib/authGate";
import { useAppStore } from "@/store/useAppStore";
import { DEMO_ONLINE } from "../demoChat";
import { fetchOnlineStatuses } from "./messengerApi";
import type { FriendUser, OnlineStatus } from "./types";

export function useOnlineStatuses(userId: string | null, safeFriends: FriendUser[], isDemoSession: boolean) {
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, OnlineStatus>>(() =>
    isDemoSession ? { ...DEMO_ONLINE } : {});

  // ── Fetch online statuses (poll every 30s) ──
  useEffect(() => {
    if (!userId || safeFriends.length === 0) return;
    // Phase 2C: gated — demo/unauthenticated sessions never poll.
    const gate = () => canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated);
    if (!gate()) return;
    let cancelled = false;
    const fetchStatuses = async () => {
      if (!gate()) return;
      const statuses = await fetchOnlineStatuses(safeFriends);
      if (!cancelled) setOnlineStatuses(statuses);
    };
    fetchStatuses();
    const interval = setInterval(() => {
      if (!gate()) { clearInterval(interval); return; }
      fetchStatuses();
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, safeFriends]);

  return onlineStatuses;
}
