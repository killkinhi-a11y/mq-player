"use client";

// Debounced (300ms) user search for the new-chat / new-group / add-members
// pickers. Extracted from MessengerView; the three picker flags are folded
// into `pickerOpen` (same truthiness).
import { useEffect, useState } from "react";

export function useUserSearch(pickerOpen: boolean, query: string, userId: string | null) {
  const [rawNewChatUsers, setNewChatUsers] = useState<any[]>([]);

  // ── Search users (debounced) ──
  useEffect(() => {
    if (!pickerOpen) return;
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(async () => {
      try {
        const excludeParam = userId ? `&excludeId=${userId}` : "";
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}${excludeParam}`);
        if (res.ok) {
          const data = await res.json();
          setNewChatUsers(Array.isArray(data.users) ? data.users : []);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [pickerOpen, query, userId]);

  return [rawNewChatUsers, setNewChatUsers] as const;
}
