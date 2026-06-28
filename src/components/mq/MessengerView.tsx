"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Search, Send, ArrowLeft, X, Plus,
  Loader2, UserPlus,
} from "lucide-react";
import { simulateDecryptSync, simulateEncrypt } from "@/lib/crypto";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────

interface FriendUser {
  id: string;
  username: string;
  avatar?: string;
  addedAt: string;
}

interface OnlineStatus {
  online: boolean;
  lastSeen: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "был(а) недавно";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `был(а) ${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `был(а) ${diffH} ч назад`;
    return `был(а) ${d.toLocaleDateString("ru-RU")}`;
  } catch {
    return "был(а) недавно";
  }
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function MessengerView() {
  const userId = useAppStore((s) => s.userId);
  const username = useAppStore((s) => s.username);
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const selectedContactId = useAppStore((s) => s.selectedContactId);
  const setSelectedContact = useAppStore((s) => s.setSelectedContact);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const compactMode = useAppStore((s) => s.compactMode);
  const { toast } = useToast();

  // ── Local state ──
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, OnlineStatus>>({});
  const [inputText, setInputText] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [newChatUsers, setNewChatUsers] = useState<any[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const lastSeenTimeRef = useRef<string>(new Date(0).toISOString());
  const lastFriendsSnapshotRef = useRef<string>("");

  // ── Detect mobile ──
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Fetch friends (deduped by ID snapshot to prevent #185) ──
  const fetchFriends = useCallback(async () => {
    if (!userId) return;
    setIsLoadingFriends(true);
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        const newFriends: FriendUser[] = data.friends || [];
        const newPending = data.pendingRequests || [];
        const snapshot = newFriends.map((f) => f.id).sort().join(",") + "|" + newPending.map((p: any) => p.id).sort().join(",");
        if (snapshot !== lastFriendsSnapshotRef.current) {
          lastFriendsSnapshotRef.current = snapshot;
          setFriends(newFriends);
          setPendingRequests(newPending);
        }
      }
    } catch { /* silent */ } finally {
      setIsLoadingFriends(false);
    }
  }, [userId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Fetch online statuses (deduped) ──
  const lastFriendsKeyRef = useRef<string>("");
  useEffect(() => {
    if (!userId || friends.length === 0) return;
    const friendsKey = friends.map((f) => f.id).sort().join(",");
    if (friendsKey === lastFriendsKeyRef.current) return;
    lastFriendsKeyRef.current = friendsKey;

    const fetchStatuses = async () => {
      const statuses: Record<string, OnlineStatus> = {};
      await Promise.all(friends.map(async (f) => {
        try {
          const res = await fetch(`/api/user/${f.id}/status`);
          if (res.ok) {
            const data = await res.json();
            statuses[f.id] = { online: data.online ?? false, lastSeen: data.lastSeen ?? null };
          }
        } catch {
          statuses[f.id] = { online: false, lastSeen: null };
        }
      }));
      setOnlineStatuses(statuses);
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [userId, friends]);

  // ── SSE connection for real-time messages ──
  useEffect(() => {
    if (!userId) return;
    let destroyed = false;

    const processIncoming = (m: any) => {
      const state = useAppStore.getState();
      const existing = state.messages.find((em: any) => em.id === m.id);
      if (existing) return;
      state.addMessage({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        receiverId: m.receiverId,
        encrypted: m.encrypted ?? true,
        createdAt: m.createdAt,
        senderName: m.senderUsername ? `@${m.senderUsername}` : undefined,
        messageType: m.messageType,
      });
      if (m.createdAt) lastSeenTimeRef.current = m.createdAt;
    };

    const connect = () => {
      if (destroyed) return;
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
          if (data.type === "typing" && data.userId) {
            useAppStore.getState().setTypingUser(data.userId);
            setTimeout(() => useAppStore.getState().clearTypingUser(data.userId), 4000);
          }
        } catch {}
      });

      es.onerror = () => {
        es.close();
        sseRef.current = null;
        if (!destroyed) setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      destroyed = true;
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [userId]);

  // ── Load messages when contact selected ──
  useEffect(() => {
    if (!userId || !selectedContactId) return;
    const cacheKey = `${userId}-${selectedContactId}`;
    const load = async () => {
      try {
        const res = await fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages?.length > 0) {
            const serverMsgs = data.messages.map((m: any) => ({
              id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
              encrypted: m.encrypted, createdAt: m.createdAt,
              senderName: `@${m.sender?.username || "user"}`,
              messageType: m.messageType,
            }));
            setTimeout(() => useAppStore.getState().loadMessages(serverMsgs), 0);
          }
        }
      } catch {}
    };
    load();
  }, [userId, selectedContactId]);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selectedContactId]);

  // ── Selected contact ──
  const selectedFriend = useMemo(
    () => friends.find((f) => f.id === selectedContactId) || null,
    [friends, selectedContactId]
  );

  // ── Conversation messages ──
  const conversationMessages = useMemo(() => {
    if (!userId || !selectedContactId) return [];
    return messages
      .filter((m: any) =>
        (m.senderId === userId && m.receiverId === selectedContactId) ||
        (m.senderId === selectedContactId && m.receiverId === userId)
      )
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, userId, selectedContactId]);

  // ── Filtered friends (by search) ──
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase();
    return friends.filter((f) => f.username.toLowerCase().includes(q));
  }, [friends, searchQuery]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !userId || !selectedContactId || isSending) return;
    setIsSending(true);
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      content: text,
      senderId: userId,
      receiverId: selectedContactId,
      encrypted: true,
      createdAt: new Date().toISOString(),
      senderName: username ? `@${username}` : undefined,
      messageType: "text",
    };
    addMessage(optimisticMsg);
    setInputText("");

    try {
      const encrypted = await simulateEncrypt(text);
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: selectedContactId,
          content: encrypted,
          encrypted: true,
          messageType: "text",
        }),
      });
      if (!res.ok) throw new Error("send failed");
      const data = await res.json();
      // Replace temp message with real one
      useAppStore.setState((s) => ({
        messages: s.messages.map((m: any) => m.id === tempId ? { ...m, id: data.id || tempId } : m),
      }));
    } catch {
      toast({ title: "Не удалось отправить", description: "Попробуйте ещё раз" });
      // Remove optimistic message on failure
      useAppStore.setState((s) => ({
        messages: s.messages.filter((m: any) => m.id !== tempId),
      }));
    } finally {
      setIsSending(false);
    }
  }, [inputText, userId, selectedContactId, isSending, addMessage, username, toast]);

  // ── Search users for new chat ──
  useEffect(() => {
    if (!showNewChat) return;
    const q = newChatSearch.trim();
    if (!q) { setNewChatUsers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const excludeParam = userId ? `&excludeId=${userId}` : "";
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}${excludeParam}`);
        if (res.ok) {
          const data = await res.json();
          setNewChatUsers(data.users || []);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [showNewChat, newChatSearch, userId]);

  // ── Start new chat ──
  const handleStartChat = useCallback((user: any) => {
    // Add as friend via API
    fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, friendId: user.id }),
    }).then(() => {
      fetchFriends();
      setSelectedContact(user.id);
      setShowNewChat(false);
      setNewChatSearch("");
      setNewChatUsers([]);
    }).catch(() => {
      toast({ title: "Не удалось добавить", variant: "destructive" });
    });
  }, [userId, fetchFriends, setSelectedContact, toast]);

  // ── Typing indicator ──
  const typingTs = useAppStore((s) => selectedContactId ? s.typingUsers[selectedContactId] : undefined);
  const [showTyping, setShowTyping] = useState(false);
  useEffect(() => {
    if (!typingTs) { setShowTyping(false); return; }
    const isRecent = Date.now() - typingTs < 4000;
    setShowTyping(isRecent);
    if (!isRecent) return;
    const remaining = 4000 - (Date.now() - typingTs);
    const timer = setTimeout(() => setShowTyping(false), Math.max(500, remaining));
    return () => clearTimeout(timer);
  }, [typingTs]);

  // ── Send typing indicator ──
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback((value: string) => {
    setInputText(value);
    if (!selectedContactId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      fetch("/api/messages/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: selectedContactId }),
      }).catch(() => {});
    }, 300);
  }, [selectedContactId]);

  // ── Render ──
  const showChatPanel = selectedContactId && (!isMobileView || true);
  const showListPanel = !selectedContactId || !isMobileView;

  return (
    <div
      className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container-narrow)] mx-auto`}
      style={{ height: "calc(100dvh - 90px - 56px)" }}
    >
      <div
        className="flex rounded-3xl overflow-hidden h-full"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Contacts list ── */}
        {showListPanel && (
          <div
            className={`${isMobileView && selectedContactId ? "hidden" : "flex"} flex-col w-full lg:w-[320px] flex-shrink-0 border-r`}
            style={{ borderColor: "rgba(255,255,255,0.04)" }}
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>Чаты</h2>
                {friends.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                    {friends.length}
                  </span>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => setShowNewChat(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                aria-label="Новый чат"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Search */}
            <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск чатов"
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    color: "var(--mq-text)",
                  }}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingFriends && friends.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                </div>
              ) : friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <MessageCircle className="w-10 h-10 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>Нет чатов</p>
                  <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                    Найдите друзей, чтобы начать общение
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setShowNewChat(true)}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Найти друзей
                  </motion.button>
                </div>
              ) : (
                filteredFriends.map((friend, i) => {
                  const isActive = selectedContactId === friend.id;
                  const status = onlineStatuses[friend.id];
                  const isOnline = status?.online ?? false;
                  const unread = unreadCounts[friend.id] || 0;
                  const lastMsg = messages
                    .filter((m: any) =>
                      (m.senderId === userId && m.receiverId === friend.id) ||
                      (m.senderId === friend.id && m.receiverId === userId)
                    )
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                  return (
                    <motion.button
                      key={friend.id}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
                      whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedContact(friend.id)}
                      className="w-full flex items-center gap-3 p-3 text-left transition-colors cursor-pointer"
                      style={{
                        backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
                        borderLeft: isActive ? "3px solid var(--mq-accent)" : "3px solid transparent",
                      }}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {friend.avatar ? (
                          <img src={friend.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center font-bold"
                            style={{
                              background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                              color: "#fff",
                            }}
                          >
                            {friend.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {isOnline && (
                          <span
                            className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                            style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }}
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                            {friend.username}
                          </p>
                          {lastMsg && (
                            <span className="text-[10px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                              {formatTime(lastMsg.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {lastMsg
                              ? (lastMsg.senderId === userId ? "Вы: " : "") + simulateDecryptSync(lastMsg.content).slice(0, 40)
                              : isOnline ? "в сети" : formatLastSeen(status?.lastSeen ?? null)
                            }
                          </p>
                          {unread > 0 && (
                            <span
                              className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1 flex-shrink-0"
                              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                            >
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Chat panel ── */}
        {showChatPanel ? (
          <div className={`${isMobileView && !selectedContactId ? "hidden" : "flex"} flex-col flex-1 min-w-0`}>
            {selectedFriend ? (
              <>
                {/* Chat header */}
                <div
                  className="p-4 flex items-center gap-3 border-b"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  {isMobileView && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedContact(null)}
                      className="p-1"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </motion.button>
                  )}
                  <div className="relative flex-shrink-0">
                    {selectedFriend.avatar ? (
                      <img src={selectedFriend.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                        style={{
                          background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                          color: "#fff",
                        }}
                      >
                        {selectedFriend.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {onlineStatuses[selectedFriend.id]?.online && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                        style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                      {selectedFriend.username}
                    </p>
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      {showTyping ? (
                        <span style={{ color: "var(--mq-accent)" }}>печатает…</span>
                      ) : onlineStatuses[selectedFriend.id]?.online ? (
                        "в сети"
                      ) : (
                        formatLastSeen(onlineStatuses[selectedFriend.id]?.lastSeen ?? null)
                      )}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                  {conversationMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageCircle className="w-10 h-10 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                        Начните диалог с {selectedFriend.username}
                      </p>
                    </div>
                  ) : (
                    conversationMessages.map((msg: any, i) => {
                      const isMine = msg.senderId === userId;
                      const prevMsg = conversationMessages[i - 1];
                      const showAvatar = !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId);
                      const decrypted = simulateDecryptSync(msg.content);
                      return (
                        <motion.div
                          key={msg.id}
                          initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          {!isMine && (
                            <div className="w-7 flex-shrink-0">
                              {showAvatar && (
                                selectedFriend.avatar ? (
                                  <img src={selectedFriend.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                                    style={{
                                      background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                                      color: "#fff",
                                    }}
                                  >
                                    {selectedFriend.username.charAt(0).toUpperCase()}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          <div
                            className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                            style={{
                              backgroundColor: isMine
                                ? "var(--mq-accent)"
                                : "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))",
                              color: isMine ? "#fff" : "var(--mq-text)",
                            }}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{decrypted}</p>
                            <p
                              className="text-[10px] mt-1 text-right"
                              style={{ color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}
                            >
                              {formatTime(msg.createdAt)}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                  {showTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-end gap-2 justify-start"
                    >
                      <div className="w-7 flex-shrink-0" />
                      <div
                        className="px-4 py-3 rounded-2xl rounded-bl-md"
                        style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))" }}
                      >
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: "var(--mq-text-muted)" }}
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Сообщение…"
                      className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        color: "var(--mq-text)",
                      }}
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={handleSend}
                      disabled={!inputText.trim() || isSending}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: inputText.trim() && !isSending ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                        color: inputText.trim() && !isSending ? "#fff" : "var(--mq-text-muted)",
                      }}
                    >
                      {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </motion.button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageCircle className="w-12 h-12 mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                <p className="text-base font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                  Выберите чат
                </p>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Выберите собеседника слева, чтобы начать диалог
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── New chat dialog ── */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowNewChat(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новый чат</h3>
                <button onClick={() => setShowNewChat(false)} style={{ color: "var(--mq-text-muted)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
                  <input
                    type="text"
                    value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Поиск пользователей"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      backgroundColor: "var(--mq-input-bg)",
                      border: "1px solid rgba(255,255,255,0.04)",
                      color: "var(--mq-text)",
                    }}
                  />
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {newChatSearch.trim() && newChatUsers.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: "var(--mq-text-muted)" }}>
                      Никого не найдено
                    </p>
                  ) : (
                    newChatUsers.map((user) => (
                      <motion.button
                        key={user.id}
                        whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleStartChat(user)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left"
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                            style={{
                              background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                              color: "#fff",
                            }}
                          >
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                            {user.username}
                          </p>
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                            Нажмите, чтобы начать чат
                          </p>
                        </div>
                      </motion.button>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
