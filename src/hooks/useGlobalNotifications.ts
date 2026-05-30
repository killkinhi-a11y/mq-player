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

        // 1. New message detection — play sound + browser notification + increment badge
        if (data.latestMessage) {
          const lm = data.latestMessage;
          const isNewMessage = lastMessageIdRef.current !== null && lm.id !== lastMessageIdRef.current;

          if (isNewMessage && lm.senderId && lm.senderId !== state.userId) {
            // Sound
            playNotifSound();

            // Decrypt for preview
            let preview = "";
            try {
              preview = simulateDecryptSync(lm.content || "");
            } catch {
              preview = (lm.content || "").slice(0, 80);
            }

            // Browser notification
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

            // Increment unread count ONLY for the sender (if not on messenger with that chat)
            if (state.currentView !== "messenger" || state.selectedContactId !== lm.senderId) {
              const counts = { ...state.unreadCounts };
              counts[lm.senderId] = (counts[lm.senderId] || 0) + 1;
              useAppStore.setState({ unreadCounts: counts });
            }
          }
          lastMessageIdRef.current = lm.id;
        }

        // 2. Update document title with local unread sum (not server total)
        const localUnread = Object.values(useAppStore.getState().unreadCounts).reduce((sum: number, c) => sum + (c || 0), 0);
        const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
        document.title = localUnread > 0 ? `(${localUnread}) ${baseTitle}` : baseTitle;
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
