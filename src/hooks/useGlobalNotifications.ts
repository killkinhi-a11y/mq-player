import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { simulateDecryptSync } from "@/lib/crypto";

/**
 * Global polling hook — works on EVERY tab/view.
 * Polls /api/messages/unread-count every 5 seconds.
 * On new message: plays sound, shows browser notification, updates badges & title.
 */
export function useGlobalNotifications() {
  const lastMessageIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Wait for store to hydrate — check periodically
    const waitForAuth = () => {
      const state = useAppStore.getState();
      return state.isAuthenticated && state.userId;
    };

    let destroyed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const playNotifSound = () => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        /* ignore */
      }
    };

    const showBrowserNotification = (senderName: string, text: string, tag: string) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(`Сообщение от ${senderName}`, {
          body: text.length > 80 ? text.slice(0, 80) + "..." : text,
          icon: "/icon-192.png",
          tag,
        });
      } catch {
        /* ignore */
      }
    };

    const poll = async () => {
      if (destroyed) return;
      const state = useAppStore.getState();
      if (!state.userId) return;

      try {
        const res = await fetch("/api/messages/unread-count");
        if (!res.ok) return;
        const data = await res.json();

        // 1. Update per-contact unread counts for messenger badge
        if (data.perContact && typeof data.perContact === "object") {
          const currentCounts = { ...state.unreadCounts };
          // Only update counts from the server — don't reset contacts that had local updates
          for (const [contactId, serverCount] of Object.entries(data.perContact)) {
            const sc = serverCount as number;
            // Keep the higher of local vs server count
            if (sc > (currentCounts[contactId] || 0)) {
              currentCounts[contactId] = sc;
            }
          }
          useAppStore.setState({ unreadCounts: currentCounts });
        }

        // 2. Update document title with total unread count
        const totalCount = data.count || 0;
        const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
        document.title = totalCount > 0 ? `(${totalCount}) ${baseTitle}` : baseTitle;

        // 3. New message detection — play sound + browser notification
        if (data.latestMessage) {
          const lm = data.latestMessage;
          if (lastMessageIdRef.current !== null && lm.id !== lastMessageIdRef.current) {
            // This is genuinely a NEW message since last poll
            playNotifSound();

            // Decrypt for preview
            let preview = "";
            try {
              preview = simulateDecryptSync(lm.content || "");
            } catch {
              preview = (lm.content || "").slice(0, 80);
            }

            const senderName = lm.senderUsername || "Someone";
            showBrowserNotification(senderName, preview, lm.id);

            // Broadcast to other tabs
            try {
              bcRef.current?.postMessage({
                type: "new_message",
                payload: lm,
              });
            } catch {
              /* BroadcastChannel not supported */
            }
          }
          lastMessageIdRef.current = lm.id;
        }
      } catch {
        /* network error — silent */
      }
    };

    // Try to request notification permission
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    // Setup BroadcastChannel
    try {
      bcRef.current = new BroadcastChannel("mq-notifications");
    } catch {
      /* not supported */
    }

    // Start polling with auth check loop
    const startPolling = () => {
      if (destroyed) return;
      if (waitForAuth()) {
        // First poll immediately
        poll();
        // Then every 5 seconds
        pollTimer = setInterval(poll, 5000);
      } else {
        // Retry in 1 second until authenticated
        setTimeout(startPolling, 1000);
      }
    };

    startPolling();

    return () => {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      try {
        bcRef.current?.close();
      } catch {
        /* ignore */
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);
}
