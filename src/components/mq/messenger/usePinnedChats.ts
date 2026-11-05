// Pinned chats + pinned message per chat (localStorage: "mq-pinned-chats",
// "mq-pinned-messages" — keys and formats unchanged). Extracted from
// MessengerView in Stage III.
import { useCallback, useState } from "react";

export function usePinnedChats() {
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("mq-pinned-chats");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("mq-pinned-messages");
      const parsed = stored ? JSON.parse(stored) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  });

  // ── Toggle pin chat ──
  const togglePinChat = useCallback((chatId: string) => {
    setPinnedChats((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const next = arr.includes(chatId) ? arr.filter((x) => x !== chatId) : [...arr, chatId];
      try { localStorage.setItem("mq-pinned-chats", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Toggle the pinned message of a given chat (one pin per chat).
  const togglePinMessageIn = useCallback((chatId: string, msgId: string) => {
    setPinnedMessages((prev) => {
      const next = { ...prev };
      if (next[chatId] === msgId) delete next[chatId];
      else next[chatId] = msgId;
      try { localStorage.setItem("mq-pinned-messages", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { pinnedChats, pinnedMessages, togglePinChat, togglePinMessageIn };
}
