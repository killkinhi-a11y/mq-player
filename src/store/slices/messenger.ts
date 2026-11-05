// Store slice: Messages, contacts, typing, support + notifications counters.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { StoreSlice } from "@/store/types";

export type MessengerSliceKeys =
  | "addMessage"
  | "setSelectedContact"
  | "loadMessages"
  | "clearUnread"
  | "addContact"
  | "deleteMessagesForContact"
  | "setTypingUser"
  | "clearTypingUser"
  | "setSupportUnreadCount"
  | "incrementSupportUnread"
  | "setNotificationCount"
  | "setNotifPanelOpen";

/** Messages, contacts, typing, support + notifications counters. */
export const createMessengerSlice: StoreSlice<MessengerSliceKeys> = (set, get) => ({

      addMessage: (message) =>
        set((s) => {
          // Basic validation
          if (!message?.id || !message.senderId) return s;
          const currentMsgs = Array.isArray(s.messages) ? s.messages : [];
          // Dedup: skip messages with same ID
          if (currentMsgs.some((m) => m.id === message.id)) return s;
          const updated = [...currentMsgs, message];
          // Keep max 1000 messages in memory to prevent performance issues
          if (updated.length > 1000) return { messages: updated.slice(-1000) };
          return { messages: updated };
        }),

      setSelectedContact: (contactId) => set({ selectedContactId: contactId, unreadCounts: { ...get().unreadCounts, [contactId as string]: 0 } }),

      loadMessages: (incoming) => set((s) => {
        // Defensive: ensure messages is always an array (prevents crash
        // when s.messages is undefined/null from a corrupted persist)
        const currentMsgs = Array.isArray(s.messages) ? s.messages : [];
        const existingIds = new Set(currentMsgs.map(m => m.id));
        const existingSignatures = new Set(
          currentMsgs.map(m => `${m.content}|${m.senderId}|${m.receiverId}`)
        );
        const newMsgs = (Array.isArray(incoming) ? incoming : []).filter(m => {
          if (existingIds.has(m.id)) return false;
          const sig = `${m.content}|${m.senderId}|${m.receiverId}`;
          if (existingSignatures.has(sig)) return false;
          return true;
        });
        return { messages: [...currentMsgs, ...newMsgs] };
      }),

      clearUnread: (contactId) =>
        set((s) => ({ unreadCounts: { ...s.unreadCounts, [contactId]: 0 } })),

      addContact: (contact) =>
        set((s) => {
          const contacts = Array.isArray(s.contacts) ? s.contacts : [];
          if (contacts.some((c) => c.id === contact.id)) return s;
          return { contacts: [...contacts, contact] };
        }),

      deleteMessagesForContact: (contactId) =>
        set((s) => ({
          messages: (Array.isArray(s.messages) ? s.messages : []).filter(
            (m) => m.senderId !== contactId && m.receiverId !== contactId
          ),
        })),

      setTypingUser: (contactId) => set((s) => ({
        typingUsers: { ...s.typingUsers, [contactId]: Date.now() },
      })),
      clearTypingUser: (contactId) => set((s) => {
        const next = { ...s.typingUsers };
        delete next[contactId];
        return { typingUsers: next };
 }),

      // ── Support chat actions ──
      setSupportUnreadCount: (count) => set({ supportUnreadCount: count }),
      incrementSupportUnread: () => set((s) => ({ supportUnreadCount: s.supportUnreadCount + 1 })),

      setNotificationCount: (count) => set({ notificationCount: count }),
      setNotifPanelOpen: (open) => set({ notifPanelOpen: open }),
});

