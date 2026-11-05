"use client";

// Text send pipeline: demo local send, optimistic temp message, server id
// swap, cross-tab broadcast, failure → error bubble + retry.
// Extracted verbatim from MessengerView.
import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Message as ChatMessage } from "@/lib/musicApi";
import { simulateEncrypt } from "@/lib/crypto";
import { useAppStore } from "@/store/useAppStore";
import type { useToast } from "@/hooks/use-toast";

interface SendArgs {
  userId: string | null;
  username: string | null;
  activeChatId: string | null;
  isGroupChat: boolean;
  isDemoSession: boolean;
  inputText: string;
  setInputText: (v: string) => void;
  setDemoThreads: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setGroupMessages: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  addMessage: (m: ChatMessage) => void;
  bcRef: RefObject<BroadcastChannel | null>;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useSendMessage({ userId, username, activeChatId, isGroupChat, isDemoSession, inputText, setInputText, setDemoThreads, setGroupMessages, addMessage, bcRef, toast }: SendArgs) {
  const [isSending, setIsSending] = useState(false);
  const [failedDraft, setFailedDraft] = useState<{ text: string; chatId: string } | null>(null);

  const handleSend = useCallback(async (overrideText?: string) => {
    const raw = typeof overrideText === "string" ? overrideText : inputText;
    const text = (raw || "").trim();
    if (!text || !userId || !activeChatId || isSending) return;

    // ── Demo: local-only send (memory store) ──
    // The bubble appears instantly, nothing hits the network, nothing
    // persists — exactly the acceptance surface for reviewing the UI.
    if (isDemoSession) {
      const local: ChatMessage = {
        id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        content: text, senderId: userId,
        receiverId: isGroupChat ? userId : activeChatId,
        encrypted: false, createdAt: new Date().toISOString(),
        senderName: username ? `@${username}` : undefined, messageType: "text",
      };
      setDemoThreads((prev) => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), local],
      }));
      setInputText("");
      return;
    }

    setIsSending(true);
    setInputText("");
    setFailedDraft(null);
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: tempId, content: text, senderId: userId,
      receiverId: isGroupChat ? userId : activeChatId,
      encrypted: !isGroupChat, createdAt: now,
      senderName: username ? `@${username}` : undefined, messageType: "text",
    };

    try {
      if (isGroupChat) {
        setGroupMessages((prev) => ({
          ...prev, [activeChatId]: [...(prev[activeChatId] || []), msg],
        }));
        await fetch(`/api/group-chats/${activeChatId}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId: userId, content: text, messageType: "text" }),
        });
      } else {
        addMessage(msg);
        const encrypted = await simulateEncrypt(text);
        const res = await fetch("/api/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: activeChatId, content: encrypted, encrypted: true, messageType: "text" }),
        });
        if (res.ok) {
          const data = await res.json();
          const newId = data?.id || tempId;
          useAppStore.setState((s) => ({
            messages: (Array.isArray(s.messages) ? s.messages : []).map((m: ChatMessage) =>
              m.id === tempId ? { ...m, id: newId } : m),
          }));
          try {
            bcRef.current?.postMessage({
              type: "new_message",
              payload: { ...msg, id: newId, senderUsername: username },
            });
          } catch {}
        }
      }
    } catch {
      toast({ title: "Не удалось отправить" });
      // Visual-layer: keep the draft visible as an error bubble with retry.
      setFailedDraft({ text, chatId: activeChatId });
      if (!isGroupChat) {
        useAppStore.setState((s) => ({
          messages: (Array.isArray(s.messages) ? s.messages : []).filter(
            (m: ChatMessage) => m.id !== tempId),
        }));
      } else if (activeChatId) {
        setGroupMessages((prev) => ({
          ...prev,
          [activeChatId]: (prev[activeChatId] || []).filter((m) => m.id !== tempId),
        }));
      }
    } finally {
      setIsSending(false);
    }
  }, [isDemoSession, inputText, userId, activeChatId, isGroupChat, isSending, addMessage, username, toast, setDemoThreads, setInputText, setGroupMessages, bcRef]);

  // ── Retry a failed send (re-runs the exact same pipeline) ──
  const retryFailedSend = useCallback(() => {
    if (!failedDraft) return;
    const draft = failedDraft;
    setFailedDraft(null);
    handleSend(draft.text);
  }, [failedDraft, handleSend]);

  return { handleSend, retryFailedSend, isSending, failedDraft, setFailedDraft };
}
