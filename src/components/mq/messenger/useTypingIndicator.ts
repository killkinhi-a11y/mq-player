"use client";

// Typing indicator: shows the peer's typing state for its 4s window and
// debounces (300ms) our own typing POST for DMs. Extracted from MessengerView.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export function useTypingIndicator(selectedContactId: string | null, isGroupChat: boolean, setInputText: (v: string) => void) {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Typing indicator ──
  const typingTs = useAppStore((s) =>
    selectedContactId ? s.typingUsers[selectedContactId] : undefined);
  // Each typing timestamp is visible until its own 4s window expires.
  const [expiredTypingTs, setExpiredTypingTs] = useState<number | null>(null);
  const showTyping = !!typingTs && expiredTypingTs !== typingTs;
  useEffect(() => {
    if (!typingTs) return;
    const remaining = 4000 - (Date.now() - typingTs);
    const timer = setTimeout(() => setExpiredTypingTs(typingTs), remaining > 0 ? Math.max(500, remaining) : 0);
    return () => clearTimeout(timer);
  }, [typingTs]);

  const handleInputChange = useCallback((value: string) => {
    setInputText(value);
    if (!selectedContactId || isGroupChat) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      try {
        fetch("/api/messages/typing", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: selectedContactId }),
        }).catch(() => {});
      } catch {}
    }, 300);
  }, [selectedContactId, isGroupChat, setInputText]);

  return { showTyping, handleInputChange };
}
