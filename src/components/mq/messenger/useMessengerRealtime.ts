"use client";

// Messenger realtime: SSE stream for DMs/typing (gated reconnect loop) and
// the cross-tab BroadcastChannel. Returns the channel ref so the send
// pipeline can notify other tabs. Extracted verbatim from MessengerView.
import { useEffect, useRef } from "react";
import { canPollProtected } from "@/lib/authGate";
import { useAppStore } from "@/store/useAppStore";
import { decrypt } from "./format";

export function useMessengerRealtime(userId: string | null, fetchFriends: () => unknown) {
  const sseRef = useRef<EventSource | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastSeenTimeRef = useRef<string>(new Date(0).toISOString());

  // ── SSE for real-time DMs ──
  useEffect(() => {
    if (!userId) return;
    let destroyed = false;

    // Phase 2C: SSE reconnect loop gate. Demo sessions never connect; a
    // 401-controlled suspension stops the 2s reconnect loop (the SSE
    // endpoint is session-protected — every reconnect was another 401).
    const gate = () => canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated);
    if (!gate()) return;

    const processIncoming = (m: any) => {
      if (!m || !m.id || !m.senderId) return;
      try {
        const state = useAppStore.getState();
        const msgs = Array.isArray(state.messages) ? state.messages : [];
        if (msgs.some((em: any) => em.id === m.id)) return;
        state.addMessage({
          id: m.id, content: m.content || "", senderId: m.senderId,
          receiverId: m.receiverId || userId, encrypted: m.encrypted ?? true,
          createdAt: m.createdAt || new Date().toISOString(),
          senderName: m.senderUsername ? `@${m.senderUsername}` : undefined,
          messageType: m.messageType, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
        });
        if (m.senderId !== userId && typeof Notification !== "undefined" &&
            Notification.permission === "granted" && document.visibilityState === "hidden") {
          try {
            new Notification(`Сообщение от ${m.senderUsername || "Someone"}`, {
              body: decrypt(m.content).slice(0, 60),
            });
          } catch {}
        }
        if (m.createdAt) lastSeenTimeRef.current = m.createdAt;
      } catch {}
    };

    const connect = () => {
      if (destroyed) return;
      try {
        const since = encodeURIComponent(lastSeenTimeRef.current);
        const es = new EventSource(`/api/messages/sse?userId=${userId}&since=${since}`);
        sseRef.current = es;
        es.addEventListener("connected", (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.serverTime) lastSeenTimeRef.current = data.serverTime;
          } catch {}
        });
        es.addEventListener("new_message", (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.message) processIncoming(data.message);
          } catch {}
        });
        es.addEventListener("typing", (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.userId) {
              useAppStore.getState().setTypingUser(data.userId);
              setTimeout(() => useAppStore.getState().clearTypingUser(data.userId), 4000);
            }
          } catch {}
        });
        es.onerror = () => {
          try { es.close(); } catch {}
          sseRef.current = null;
          // Reconnect only while a real authenticated session is active.
          // The gate stays closed after a 401 until the next login —
          // no reconnect storm, no 401 loop.
          if (!destroyed && gate()) setTimeout(connect, 2000);
        };
      } catch {}
    };
    connect();
    return () => {
      destroyed = true;
      try { sseRef.current?.close(); } catch {}
      sseRef.current = null;
    };
  }, [userId]);

  // ── BroadcastChannel for cross-tab notifications ──
  useEffect(() => {
    if (!userId) return;
    try {
      bcRef.current = new BroadcastChannel("mq-notifications");
      bcRef.current.onmessage = (event) => {
        try {
          const { type, payload } = event.data || {};
          if (type === "new_message" && payload?.id && payload?.senderId) {
            const state = useAppStore.getState();
            const msgs = Array.isArray(state.messages) ? state.messages : [];
            if (!msgs.some((em: any) => em.id === payload.id)) {
              state.addMessage({
                id: payload.id, content: payload.content || "", senderId: payload.senderId,
                receiverId: payload.receiverId || userId, encrypted: payload.encrypted ?? true,
                createdAt: payload.createdAt || new Date().toISOString(),
                senderName: payload.senderUsername ? `@${payload.senderUsername}` : undefined,
                messageType: payload.messageType, voiceUrl: payload.voiceUrl,
                voiceDuration: payload.voiceDuration,
              });
            }
          } else if (type === "friend_request") {
            fetchFriends();
          }
        } catch {}
      };
    } catch {}
    return () => { try { bcRef.current?.close(); } catch {} bcRef.current = null; };
  }, [userId, fetchFriends]);

  return bcRef;
}
