import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { simulateDecryptSync } from "@/lib/crypto";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";

/**
 * Global polling hook — works on EVERY tab/view.
 * Polls /api/messages/unread-count every 30 seconds.
 * On new message: plays sound, shows browser notification, updates badges & title.
 *
 * Phase 2C: gated via authGate — demo/unauthenticated sessions never poll
 * (demo mode used to poll this endpoint every cycle → endless 401s).
 * A 401 suspends polling via controlled recovery until the next login.
 */
export function useGlobalNotifications() {
  const lastMessageIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
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
      // Gate: real authenticated sessions only; suspended after a 401.
      if (!canPollProtected(state.userId, state.isAuthenticated)) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        return;
      }

      try {
        const res = await fetch("/api/messages/unread-count");
        if (res.status === 401) {
          // Controlled recovery: stop repeated 401s. If the probe says the
          // session is still alive (transient blip), polling RESUMES right
          // here — otherwise it stays stopped until the next login.
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          await controlled401Recovery("messages/unread-count");
          const st = useAppStore.getState();
          if (!destroyed && canPollProtected(st.userId, st.isAuthenticated) && !pollTimer) {
            pollTimer = setInterval(poll, 30000);
          }
          return;
        }
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
              setTimeout(() => useAppStore.setState({ unreadCounts: counts }), 0);
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
      const st = useAppStore.getState();
      if (canPollProtected(st.userId, st.isAuthenticated)) {
        // First poll immediately
        poll();
        // Then every 30 seconds (was 5s — 5s was too aggressive and caused
        // gradual memory/CPU buildup on long sessions. 30s is enough for
        // message notifications — users don't need sub-10s latency.)
        pollTimer = setInterval(poll, 30000);
      } else if (!st.isAuthenticated) {
        // Not authenticated at all — wait for login (checks the store,
        // no network requests while waiting).
        setTimeout(startPolling, 2000);
      }
      // else: demo user — never poll; re-check when auth changes via
      // the subscribe below.
    };

    startPolling();

    // Re-evaluate the gate whenever auth state changes (login/logout/demo)
    const unsubAuth = useAppStore.subscribe((s, prev) => {
      if (s.isAuthenticated !== prev.isAuthenticated || s.userId !== prev.userId) {
        if (canPollProtected(s.userId, s.isAuthenticated) && !pollTimer && !destroyed) {
          poll();
          pollTimer = setInterval(poll, 30000);
        } else if (!canPollProtected(s.userId, s.isAuthenticated) && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }
    });

    // Pause polling when tab is hidden — saves API calls and CPU when
    // user is not actively looking at the app. Resumes on visibility.
    const onVisibility = () => {
      if (destroyed) return;
      if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      } else {
        const st = useAppStore.getState();
        // Gate: demo/suspended sessions never resume polling on focus.
        if (canPollProtected(st.userId, st.isAuthenticated) && !pollTimer) {
          poll();
          pollTimer = setInterval(poll, 30000);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      destroyed = true;
      unsubAuth();
      document.removeEventListener("visibilitychange", onVisibility);
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
