"use client";

// Chat history loaders: group detail (members), DM history for the selected
// contact, group messages with 8s polling (stops on 401 / closed auth gate).
// Owns the history skeleton flag. Extracted verbatim from MessengerView.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Message as ChatMessage } from "@/lib/musicApi";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";
import { useAppStore } from "@/store/useAppStore";
import { toGroupMembers } from "./mappers";
import type { GroupChat, GroupMember } from "./types";

interface ChatHistoryArgs {
  userId: string | null;
  selectedContactId: string | null;
  selectedGroupId: string | null;
  setGroupChats: Dispatch<SetStateAction<GroupChat[]>>;
  setGroupMessages: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
}

export function useChatHistory({ userId, selectedContactId, selectedGroupId, setGroupChats, setGroupMessages }: ChatHistoryArgs): boolean {
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Fetch group DETAIL (members list) when a group is selected ──
  // The list endpoint returns only memberCount; the empty-group state and
  // the add-members dialog need the actual member rows (GET [id] route).
  useEffect(() => {
    if (!selectedGroupId || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/group-chats/${selectedGroupId}`);
        if (!res.ok || cancelled) return;
        const g = await res.json();
        const members: GroupMember[] = toGroupMembers(g.members);
        if (cancelled) return;
        setGroupChats((prev) => (Array.isArray(prev) ? prev.map((gc) =>
          gc.id === selectedGroupId ? { ...gc, members, memberCount: members.length, createdBy: g.createdBy ?? gc.createdBy } : gc
        ) : prev));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedGroupId, userId, setGroupChats]);

  // ── Load DM messages when contact selected ──
  useEffect(() => {
    if (!userId || !selectedContactId) return;
    // Phase 2C: gated — demo DMs are local-only, no 401 round-trip.
    if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return;
    let cancelled = false;
    // Visual-layer: skeleton bubbles until the history arrives (deferred —
    // no synchronous setState inside the effect body).
    const skelTimer = setTimeout(() => { if (!cancelled) setHistoryLoading(true); }, 0);
    const load = async () => {
      try {
        const res = await fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}`);
        if (res.status === 401) { controlled401Recovery("messages"); return; }
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const serverMsgs: ChatMessage[] = (Array.isArray(data.messages) ? data.messages : []).map(
          (m: any) => ({
            id: m.id, content: m.content || "", senderId: m.senderId, receiverId: m.receiverId,
            encrypted: !!m.encrypted, createdAt: m.createdAt || new Date().toISOString(),
            senderName: m.sender?.username ? `@${m.sender.username}` : undefined,
            messageType: m.messageType, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
          })
        );
        if (!cancelled && serverMsgs.length > 0) {
          // Defer to avoid setState-during-render warnings.
          setTimeout(() => useAppStore.getState().loadMessages(serverMsgs), 0);
        }
      } catch {}
      finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(skelTimer); };
  }, [userId, selectedContactId]);

  // ── Load group messages + poll every 8s ──
  useEffect(() => {
    if (!userId || !selectedGroupId) return;
    let cancelled = false;
    // Visual-layer: skeleton for real sessions (demo has no server
    // round-trip). Deferred — no synchronous setState in the effect body.
    const skelTimer = setTimeout(() => {
      if (!cancelled) setHistoryLoading(userId !== "demo-user-id");
    }, 0);
    const load = async () => {
      try {
        const res = await fetch(`/api/group-chats/${selectedGroupId}/messages?userId=${userId}`);
        if (res.status === 401) {
          // Phase 2C: stop the 8s poll on auth loss (controlled recovery).
          controlled401Recovery("group-chats/messages");
          clearInterval(interval);
          return;
        }
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const msgs: ChatMessage[] = (Array.isArray(data.messages) ? data.messages : []).map(
          (m: any) => ({
            id: m.id, content: m.content || "",
            senderId: m.senderId || m.sender?.id || "", receiverId: selectedGroupId,
            encrypted: false, createdAt: m.createdAt || new Date().toISOString(),
            senderName: m.sender?.username || "User", messageType: m.messageType,
            voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
          })
        );
        if (!cancelled) setGroupMessages((prev) => ({ ...prev, [selectedGroupId]: msgs }));
      } catch {}
      finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    load();
    // Phase 2C: gate the 8s group-message polling (demo/unauth skip).
    const interval = setInterval(() => {
      if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) {
        clearInterval(interval);
        return;
      }
      load();
    }, 8000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(skelTimer); };
  }, [userId, selectedGroupId, setGroupMessages]);

  return historyLoading;
}
