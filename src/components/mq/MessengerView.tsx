"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Search, Send, ArrowLeft, X, Plus,
  Loader2, UserPlus, Mic, Pin, Trash2, MoreVertical,
  Smile, Users,
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

interface GroupChat {
  id: string;
  name: string;
  avatar?: string;
  members: { id: string; username: string; avatar?: string }[];
  createdAt: string;
}

interface ContextMenu {
  id: string;
  x: number;
  y: number;
}

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👍", "😮", "😢"];

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
    const diffMs = Date.now() - d.getTime();
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

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Voice Message Bubble ─────────────────────────────────────────────────

function VoiceMessageBubble({ voiceUrl, duration, isMine }: { voiceUrl: string; duration: number; isMine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dur, setDur] = useState(duration || 0);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceUrl);
      audioRef.current.onloadedmetadata = () => setDur(audioRef.current?.duration || duration || 0);
      audioRef.current.ontimeupdate = () => setCurrentTime(audioRef.current?.currentTime || 0);
      audioRef.current.onended = () => { setPlaying(false); setCurrentTime(0); };
    }
    return () => { audioRef.current?.pause(); audioRef.current = null; };
  }, [voiceUrl, duration]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); }
  };

  const progress = dur > 0 ? (currentTime / dur) * 100 : 0;
  const bars = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 24; i++) arr.push(0.3 + Math.random() * 0.7);
    return arr;
  }, []);

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: isMine ? "rgba(255,255,255,0.2)" : "var(--mq-accent)",
          color: isMine ? "#fff" : "#fff",
        }}
      >
        {playing ? (
          <span className="text-xs">❚❚</span>
        ) : (
          <span className="text-xs ml-0.5">▶</span>
        )}
      </motion.button>
      <div className="flex-1">
        <div className="flex items-end gap-[2px] h-7">
          {bars.map((h, i) => {
            const barProgress = (i / bars.length) * 100;
            const isActive = barProgress < progress;
            return (
              <div
                key={i}
                className="w-[2px] rounded-full transition-colors"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isMine
                    ? (isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)")
                    : (isActive ? "var(--mq-accent)" : "var(--mq-text-muted)"),
                }}
              />
            );
          })}
        </div>
        <div className="text-[10px] mt-1" style={{ color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
          {formatDuration(playing ? currentTime : dur)}
        </div>
      </div>
    </div>
  );
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
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [newChatUsers, setNewChatUsers] = useState<any[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<Record<string, any[]>>({});
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("mq-pinned-messages");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastSeenTimeRef = useRef<string>(new Date(0).toISOString());
  const lastFriendsSnapshotRef = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChatId = selectedGroupId || selectedContactId;
  const isGroupChat = !!selectedGroupId;

  // ── Detect mobile ──
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Mobile view sync ──
  useEffect(() => {
    if (activeChatId) setMobileView("chat");
    else setMobileView("list");
  }, [activeChatId]);

  // ── Fetch friends (deduped) ──
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
    } catch {} finally {
      setIsLoadingFriends(false);
    }
  }, [userId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Fetch group chats ──
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/group-chats?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setGroupChats(data.groupChats || data || []);
        }
      } catch {}
    };
    load();
  }, [userId]);

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
        } catch { statuses[f.id] = { online: false, lastSeen: null }; }
      }));
      setOnlineStatuses(statuses);
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [userId, friends]);

  // ── SSE ──
  useEffect(() => {
    if (!userId) return;
    let destroyed = false;
    const processIncoming = (m: any) => {
      const state = useAppStore.getState();
      const existing = state.messages.find((em: any) => em.id === m.id);
      if (existing) return;
      state.addMessage({
        id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
        encrypted: m.encrypted ?? true, createdAt: m.createdAt,
        senderName: m.senderUsername ? `@${m.senderUsername}` : undefined,
        messageType: m.messageType, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
      });
      if (m.senderId !== userId) {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
            const preview = simulateDecryptSync(m.content).slice(0, 60);
            new Notification(`Сообщение от ${m.senderUsername || "Someone"}`, { body: preview, icon: "/icon-192.png" });
          }
        } catch {}
      }
      if (m.createdAt) lastSeenTimeRef.current = m.createdAt;
    };
    const connect = () => {
      if (destroyed) return;
      const since = encodeURIComponent(lastSeenTimeRef.current);
      const es = new EventSource(`/api/messages/sse?userId=${userId}&since=${since}`);
      sseRef.current = es;
      es.addEventListener("connected", (event: any) => {
        try { const data = JSON.parse(event.data); if (data?.serverTime) lastSeenTimeRef.current = data.serverTime; } catch {}
      });
      es.addEventListener("new_message", (event: any) => {
        try { const data = JSON.parse(event.data); if (data?.message) processIncoming(data.message); } catch {}
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
      es.onerror = () => { es.close(); sseRef.current = null; if (!destroyed) setTimeout(connect, 2000); };
    };
    connect();
    return () => { destroyed = true; sseRef.current?.close(); sseRef.current = null; };
  }, [userId]);

  // ── BroadcastChannel for cross-tab notifications ──
  useEffect(() => {
    if (!userId) return;
    try {
      bcRef.current = new BroadcastChannel("mq-notifications");
      bcRef.current.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === "new_message" && payload?.senderId && payload?.id) {
          const state = useAppStore.getState();
          const existing = state.messages.find((em: any) => em.id === payload.id);
          if (!existing) {
            state.addMessage({
              id: payload.id, content: payload.content, senderId: payload.senderId,
              receiverId: payload.receiverId, encrypted: payload.encrypted ?? true,
              createdAt: payload.createdAt, senderName: payload.senderUsername ? `@${payload.senderUsername}` : undefined,
              messageType: payload.messageType, voiceUrl: payload.voiceUrl, voiceDuration: payload.voiceDuration,
            });
          }
        } else if (type === "friend_request") {
          fetchFriends();
        }
      };
    } catch {}
    return () => { try { bcRef.current?.close(); } catch {} };
  }, [userId, fetchFriends]);

  // ── Cross-tab: broadcast outgoing messages ──
  useEffect(() => {
    if (!userId) return;
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.messages.length > prev.messages.length) {
        const newMsg = state.messages[state.messages.length - 1];
        if (newMsg && newMsg.senderId === userId) {
          try { bcRef.current?.postMessage({ type: "self_message_sent" }); } catch {}
        }
      }
    });
    return unsub;
  }, [userId]);

  // ── Document title with unread count ──
  useEffect(() => {
    if (!userId) return;
    const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
    const baseTitle = "mq";
    document.title = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
  }, [unreadCounts, userId]);

  // ── Load DM messages ──
  useEffect(() => {
    if (!userId || !selectedContactId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages?.length > 0) {
            const serverMsgs = data.messages.map((m: any) => ({
              id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
              encrypted: m.encrypted, createdAt: m.createdAt,
              senderName: `@${m.sender?.username || "user"}`, messageType: m.messageType,
              voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
            }));
            setTimeout(() => useAppStore.getState().loadMessages(serverMsgs), 0);
          }
        }
      } catch {}
    };
    load();
  }, [userId, selectedContactId]);

  // ── Load group messages + poll ──
  useEffect(() => {
    if (!userId || !selectedGroupId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/group-chats/${selectedGroupId}/messages?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setGroupMessages((p) => ({
            ...p,
            [selectedGroupId]: (data.messages || []).map((m: any) => ({
              id: m.id, content: m.content, senderId: m.senderId || m.sender?.id,
              createdAt: m.createdAt, senderName: m.sender?.username || "User",
              messageType: m.messageType, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
            })),
          }));
        }
      } catch {}
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [userId, selectedGroupId]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selectedContactId, groupMessages, selectedGroupId]);

  // ── Close context menu on outside click ──
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    const timer = setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("keydown", onKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // ── Selected contact / group ──
  const selectedFriend = useMemo(
    () => friends.find((f) => f.id === selectedContactId) || null,
    [friends, selectedContactId]
  );
  const selectedGroup = useMemo(
    () => groupChats.find((g) => g.id === selectedGroupId) || null,
    [groupChats, selectedGroupId]
  );

  // ── Conversation messages ──
  const conversationMessages = useMemo(() => {
    if (isGroupChat) return groupMessages[selectedGroupId || ""] || [];
    if (!userId || !selectedContactId) return [];
    return messages
      .filter((m: any) =>
        (m.senderId === userId && m.receiverId === selectedContactId) ||
        (m.senderId === selectedContactId && m.receiverId === userId)
      )
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, groupMessages, userId, selectedContactId, selectedGroupId, isGroupChat]);

  // ── Pinned message ──
  const pinnedMsgId = activeChatId ? pinnedMessages[activeChatId] : undefined;
  const pinnedMessage = useMemo(() => {
    if (!pinnedMsgId) return null;
    return conversationMessages.find((m: any) => m.id === pinnedMsgId) || null;
  }, [pinnedMsgId, conversationMessages]);

  const togglePinMessage = useCallback((msgId: string) => {
    if (!activeChatId) return;
    setPinnedMessages(prev => {
      const next = { ...prev };
      if (next[activeChatId] === msgId) delete next[activeChatId];
      else next[activeChatId] = msgId;
      try { localStorage.setItem("mq-pinned-messages", JSON.stringify(next)); } catch {}
      return next;
    });
    setContextMenu(null);
  }, [activeChatId]);

  // ── Reactions ──
  const toggleReaction = useCallback((msgId: string, emoji: string) => {
    setMessageReactions(prev => {
      const current = prev[msgId] || [];
      const exists = current.includes(emoji);
      return { ...prev, [msgId]: exists ? current.filter((e) => e !== emoji) : [...current, emoji] };
    });
    setShowReactionsFor(null);
  }, []);

  // ── Filtered friends ──
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase();
    return friends.filter((f) => f.username.toLowerCase().includes(q));
  }, [friends, searchQuery]);

  // ── Send message (DM or group) ──
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !userId || !activeChatId || isSending) return;
    setIsSending(true);
    const tempId = `temp_${Date.now()}`;
    const msg: any = {
      id: tempId,
      content: text,
      senderId: userId,
      receiverId: isGroupChat ? userId : activeChatId,
      encrypted: !isGroupChat,
      createdAt: new Date().toISOString(),
      senderName: username ? `@${username}` : undefined,
      messageType: "text",
    };

    if (isGroupChat) {
      setGroupMessages(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), msg],
      }));
    } else {
      addMessage(msg);
    }
    setInputText("");

    try {
      if (isGroupChat) {
        await fetch(`/api/group-chats/${activeChatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId: userId, content: text, messageType: "text" }),
        });
      } else {
        const encrypted = await simulateEncrypt(text);
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: activeChatId, content: encrypted, encrypted: true, messageType: "text" }),
        });
        const data = await res.json();
        useAppStore.setState((s) => ({
          messages: s.messages.map((m: any) => m.id === tempId ? { ...m, id: data.id || tempId } : m),
        }));
        try { bcRef.current?.postMessage({ type: "new_message", payload: { ...msg, id: data.id || tempId, senderUsername: username } }); } catch {}
      }
    } catch {
      toast({ title: "Не удалось отправить" });
      if (!isGroupChat) {
        useAppStore.setState((s) => ({ messages: s.messages.filter((m: any) => m.id !== tempId) }));
      }
    } finally {
      setIsSending(false);
    }
  }, [inputText, userId, activeChatId, isGroupChat, isSending, addMessage, username, toast]);

  // ── Voice recording ──
  const startRecording = useCallback(async () => {
    if (!activeChatId || !userId) return;
    const chatIdSnapshot: string = activeChatId;
    const isGroupSnapshot = isGroupChat;
    const userSnapshot: string = userId;
    const usernameSnapshot = username;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
      });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Url = reader.result as string;
          const duration = recordingDuration;
          const content = JSON.stringify({ voiceUrl: base64Url, voiceDuration: duration });
          if (isGroupSnapshot) {
            setGroupMessages(prev => ({
              ...prev,
              [chatIdSnapshot]: [...(prev[chatIdSnapshot] || []), {
                id: `temp_voice_${Date.now()}`,
                content, senderId: userSnapshot, createdAt: new Date().toISOString(),
                senderName: usernameSnapshot ? `@${usernameSnapshot}` : undefined, messageType: "voice",
              }],
            }));
            await fetch(`/api/group-chats/${chatIdSnapshot}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ senderId: userSnapshot, content, messageType: "voice" }),
            }).catch(() => {});
          } else {
            const tempId = `temp_voice_${Date.now()}`;
            addMessage({
              id: tempId, content, senderId: userSnapshot, receiverId: chatIdSnapshot,
              encrypted: false, createdAt: new Date().toISOString(),
              senderName: usernameSnapshot ? `@${usernameSnapshot}` : undefined, messageType: "voice",
            });
            try {
              await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ receiverId: chatIdSnapshot, content, encrypted: false, messageType: "voice" }),
              });
            } catch {}
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch {
      toast({ title: "Микрофон недоступен" });
    }
  }, [activeChatId, isGroupChat, userId, username, addMessage, toast, recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }, []);

  // ── Search users ──
  useEffect(() => {
    if (!showNewChat && !showNewGroup) return;
    const q = newChatSearch.trim();
    if (!q) { setNewChatUsers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const excludeParam = userId ? `&excludeId=${userId}` : "";
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}${excludeParam}`);
        if (res.ok) setNewChatUsers((await res.json()).users || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [showNewChat, showNewGroup, newChatSearch, userId]);

  // ── Start new chat ──
  const handleStartChat = useCallback((user: any) => {
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
    }).catch(() => toast({ title: "Не удалось добавить" }));
  }, [userId, fetchFriends, setSelectedContact, toast]);

  // ── Create group ──
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || !userId) return;
    try {
      const res = await fetch("/api/group-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          creatorId: userId,
          memberIds: [...selectedMembers, userId],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroupChats(p => [...p, data.groupChat || data]);
        setSelectedGroupId(data.groupChat?.id || data.id);
        setShowNewGroup(false);
        setGroupName("");
        setSelectedMembers([]);
        setNewChatSearch("");
        toast({ title: "Группа создана" });
      }
    } catch {
      toast({ title: "Не удалось создать группу" });
    }
  }, [groupName, selectedMembers, userId, toast]);

  // ── Typing ──
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

  // ── Swipe to go back (mobile) ──
  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    setSwipeStartX(e.touches[0].clientX);
  }, []);
  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (swipeStartX === null) return;
    const diff = swipeStartX - e.changedTouches[0].clientX;
    if (diff < -80 && swipeStartX < 50 && mobileView === "chat") {
      setSelectedContact(null);
      setSelectedGroupId(null);
      setMobileView("list");
    }
    setSwipeStartX(null);
  }, [swipeStartX, mobileView, setSelectedContact]);

  const handleMobileBack = useCallback(() => {
    setSelectedContact(null);
    setSelectedGroupId(null);
    setMobileView("list");
  }, [setSelectedContact]);

  // ── Render ──
  const showListPanel = mobileView === "list" || !isMobileView;
  const showChatPanel = mobileView === "chat" || !isMobileView;

  return (
    <div
      className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container-narrow)] mx-auto`}
      style={{ height: "calc(100dvh - 90px - 56px)" }}
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      <div
        className="flex rounded-3xl overflow-hidden h-full"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border-thin)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Contacts list ── */}
        {showListPanel && (
          <div
            className={`${isMobileView && mobileView === "chat" ? "hidden" : "flex"} flex-col w-full lg:w-[320px] flex-shrink-0 border-r`}
            style={{ borderColor: "var(--mq-border-hairline)" }}
          >
            <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>Чаты</h2>
                {(friends.length + groupChats.length) > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                    {friends.length + groupChats.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setShowNewGroup(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
                  aria-label="Новая группа"
                  title="Новая группа"
                >
                  <Users className="w-4 h-4" />
                </motion.button>
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
            </div>

            <div className="p-3 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск чатов"
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-hairline)", color: "var(--mq-text)" }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoadingFriends && friends.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                </div>
              ) : friends.length === 0 && groupChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <MessageCircle className="w-10 h-10 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>Нет чатов</p>
                  <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>Найдите друзей, чтобы начать общение</p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setShowNewChat(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Найти друзей
                  </motion.button>
                </div>
              ) : (
                <>
                  {/* Group chats */}
                  {groupChats.map((group, i) => {
                    const isActive = selectedGroupId === group.id;
                    const lastMsg = groupMessages[group.id]?.[groupMessages[group.id].length - 1];
                    return (
                      <motion.button
                        key={group.id}
                        initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
                        whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { setSelectedGroupId(group.id); setSelectedContact(null); }}
                        className="w-full flex items-center gap-3 p-3 text-left transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
                          borderLeft: isActive ? "3px solid var(--mq-accent)" : "3px solid transparent",
                        }}
                      >
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: group.avatar ? "transparent" : "linear-gradient(135deg, #8b5cf6, #6366f1)",
                            color: "#fff",
                          }}
                        >
                          {group.avatar ? (
                            <img src={group.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <Users className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{group.name}</p>
                            {lastMsg && (
                              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{formatTime(lastMsg.createdAt)}</span>
                            )}
                          </div>
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {group.members.length} участников
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}

                  {/* Direct chats */}
                  {filteredFriends.map((friend, i) => {
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
                        transition={{ delay: Math.min((i + groupChats.length) * 0.03, 0.4), duration: 0.25 }}
                        whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => { setSelectedContact(friend.id); setSelectedGroupId(null); }}
                        className="w-full flex items-center gap-3 p-3 text-left transition-colors cursor-pointer"
                        style={{
                          backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
                          borderLeft: isActive ? "3px solid var(--mq-accent)" : "3px solid transparent",
                        }}
                      >
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
                            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2" style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{friend.username}</p>
                            {lastMsg && (
                              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{formatTime(lastMsg.createdAt)}</span>
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
                              <span className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1 flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Chat panel ── */}
        {showChatPanel && (selectedFriend || selectedGroup) ? (
          <div className={`${isMobileView && mobileView === "list" ? "hidden" : "flex"} flex-col flex-1 min-w-0`}>
            {/* Header */}
            <div className="p-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
              {isMobileView && (
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleMobileBack} className="p-1" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
              )}
              <div className="relative flex-shrink-0">
                {isGroupChat && selectedGroup ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff" }}>
                    <Users className="w-5 h-5" />
                  </div>
                ) : selectedFriend && (
                  selectedFriend.avatar ? (
                    <img src={selectedFriend.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))", color: "#fff" }}>
                      {selectedFriend.username.charAt(0).toUpperCase()}
                    </div>
                  )
                )}
                {!isGroupChat && selectedFriend && onlineStatuses[selectedFriend.id]?.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2" style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                  {isGroupChat ? selectedGroup?.name : selectedFriend?.username}
                </p>
                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {showTyping && !isGroupChat ? (
                    <span style={{ color: "var(--mq-accent)" }}>печатает…</span>
                  ) : isGroupChat ? (
                    `${selectedGroup?.members.length || 0} участников`
                  ) : onlineStatuses[selectedFriend?.id || ""]?.online ? (
                    "в сети"
                  ) : (
                    formatLastSeen(onlineStatuses[selectedFriend?.id || ""]?.lastSeen ?? null)
                  )}
                </p>
              </div>
            </div>

            {/* Pinned message bar */}
            <AnimatePresence>
              {pinnedMessage && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-2 border-b flex items-center gap-2 overflow-hidden"
                  style={{ borderColor: "var(--mq-border-hairline)", backgroundColor: "color-mix(in srgb, var(--mq-accent) 6%, transparent)" }}
                >
                  <Pin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} fill="currentColor" />
                  <p className="text-xs truncate flex-1" style={{ color: "var(--mq-text-muted)" }}>
                    {simulateDecryptSync(pinnedMessage.content).slice(0, 80)}
                  </p>
                  <button onClick={() => togglePinMessage(pinnedMessage.id)} style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {conversationMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle className="w-10 h-10 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    {isGroupChat ? "Нет сообщений в группе" : `Начните диалог с ${selectedFriend?.username}`}
                  </p>
                </div>
              ) : (
                conversationMessages.map((msg: any, i) => {
                  const isMine = msg.senderId === userId;
                  const prevMsg = conversationMessages[i - 1];
                  const showAvatar = !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId);
                  let voiceData: { voiceUrl: string; voiceDuration: number } | null = null;
                  try {
                    const parsed = JSON.parse(msg.content);
                    if (parsed.voiceUrl) voiceData = parsed;
                  } catch {}
                  const decrypted = voiceData ? "" : simulateDecryptSync(msg.content);
                  const reactions = messageReactions[msg.id] || [];

                  return (
                    <motion.div
                      key={msg.id}
                      initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      data-msg-id={msg.id}
                      className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      {!isMine && (
                        <div className="w-7 flex-shrink-0">
                          {showAvatar && (
                            isGroupChat ? (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff" }}>
                                {(msg.senderName || "U").replace("@", "").charAt(0).toUpperCase()}
                              </div>
                            ) : selectedFriend?.avatar ? (
                              <img src={selectedFriend.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))", color: "#fff" }}>
                                {(selectedFriend?.username || "U").charAt(0).toUpperCase()}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="relative group max-w-[75%]">
                        {isGroupChat && !isMine && showAvatar && (
                          <p className="text-[10px] mb-1 ml-1" style={{ color: "var(--mq-accent)" }}>
                            {msg.senderName?.replace("@", "")}
                          </p>
                        )}
                        <div
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY });
                          }}
                          onDoubleClick={() => setShowReactionsFor(showReactionsFor === msg.id ? null : msg.id)}
                          className={`px-3.5 py-2 rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"} cursor-pointer`}
                          style={{
                            backgroundColor: isMine ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))",
                            color: isMine ? "#fff" : "var(--mq-text)",
                          }}
                        >
                          {voiceData ? (
                            <VoiceMessageBubble voiceUrl={voiceData.voiceUrl} duration={voiceData.voiceDuration || 0} isMine={isMine} />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap break-words">{decrypted}</p>
                          )}
                          <p className="text-[10px] mt-1 text-right" style={{ color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>

                        {/* Reactions */}
                        {reactions.length > 0 && (
                          <div className={`flex gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                            {reactions.map((emoji, ri) => (
                              <motion.button
                                key={ri}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                whileTap={{ scale: 1.2 }}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className="px-1.5 py-0.5 rounded-full text-xs"
                                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}
                              >
                                {emoji}
                              </motion.button>
                            ))}
                          </div>
                        )}

                        {/* Reaction picker */}
                        <AnimatePresence>
                          {showReactionsFor === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: -5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className={`absolute z-10 flex gap-1 p-1.5 rounded-full ${isMine ? "right-0" : "left-0"} -top-10`}
                              style={{
                                backgroundColor: "var(--mq-card)",
                                border: "1px solid var(--mq-border-medium)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                              }}
                            >
                              {QUICK_EMOJIS.map(emoji => (
                                <motion.button
                                  key={emoji}
                                  whileHover={{ scale: 1.3, y: -2 }}
                                  whileTap={{ scale: 1.1 }}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className="text-base p-0.5"
                                >
                                  {emoji}
                                </motion.button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })
              )}
              {showTyping && !isGroupChat && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 justify-start">
                  <div className="w-7 flex-shrink-0" />
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))" }}>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-text-muted)" }}
                          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t" style={{ borderColor: "var(--mq-border-hairline)" }}>
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                    <span className="text-sm" style={{ color: "#ef4444" }}>Запись… {formatDuration(recordingDuration)}</span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={stopRecording}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                  >
                    <Send className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { if (mediaRecorderRef.current) mediaRecorderRef.current.state === "recording" && mediaRecorderRef.current.stop(); setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); }}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={startRecording}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
                    aria-label="Записать голосовое"
                  >
                    <Mic className="w-4 h-4" />
                  </motion.button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Сообщение…"
                    className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-hairline)", color: "var(--mq-text)" }}
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
              )}
            </div>
          </div>
        ) : showChatPanel ? (
          <div className={`${isMobileView && mobileView === "list" ? "hidden" : "flex"} flex-1 flex-col items-center justify-center text-center p-8`}>
            <MessageCircle className="w-12 h-12 mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-base font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Выберите чат</p>
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Выберите собеседника слева, чтобы начать диалог</p>
          </div>
        ) : null}
      </div>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 min-w-[160px] rounded-xl overflow-hidden py-1"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 180),
              top: Math.min(contextMenu.y, window.innerHeight - 200),
              backgroundColor: "var(--mq-surface, #1a1a1a)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          >
            <button
              onClick={() => { setShowReactionsFor(contextMenu.id); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "var(--mq-text)" }}
            >
              <Smile className="w-3.5 h-3.5" />
              Реакция
            </button>
            <button
              onClick={() => togglePinMessage(contextMenu.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "var(--mq-text)" }}
            >
              <Pin className="w-3.5 h-3.5" style={{ color: pinnedMsgId === contextMenu.id ? "var(--mq-accent)" : "currentColor" }} fill={pinnedMsgId === contextMenu.id ? "currentColor" : "none"} />
              {pinnedMsgId === contextMenu.id ? "Открепить" : "Закрепить"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New chat dialog ── */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowNewChat(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новый чат</h3>
                <button onClick={() => setShowNewChat(false)} style={{ color: "var(--mq-text-muted)" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
                  <input
                    type="text" value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Поиск пользователей" autoFocus
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-hairline)", color: "var(--mq-text)" }}
                  />
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {newChatSearch.trim() && newChatUsers.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: "var(--mq-text-muted)" }}>Никого не найдено</p>
                  ) : (
                    newChatUsers.map((user) => (
                      <motion.button
                        key={user.id} whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }} whileTap={{ scale: 0.98 }}
                        onClick={() => handleStartChat(user)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left"
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))", color: "#fff" }}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{user.username}</p>
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Нажмите, чтобы начать чат</p>
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

      {/* ── New group dialog ── */}
      <AnimatePresence>
        {showNewGroup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowNewGroup(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новая группа</h3>
                <button onClick={() => setShowNewGroup(false)} style={{ color: "var(--mq-text-muted)" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                <input
                  type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Название группы" autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-hairline)", color: "var(--mq-text)" }}
                />
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
                  <input
                    type="text" value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Добавить участников"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-hairline)", color: "var(--mq-text)" }}
                  />
                </div>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map(id => {
                      const u = newChatUsers.find(u => u.id === id);
                      if (!u) return null;
                      return (
                        <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)", color: "var(--mq-accent)" }}>
                          {u.username}
                          <button onClick={() => setSelectedMembers(p => p.filter(x => x !== id))}><X className="w-3 h-3" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto">
                  {newChatUsers.map((user) => {
                    const selected = selectedMembers.includes(user.id);
                    return (
                      <motion.button
                        key={user.id} whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }} whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedMembers(p => selected ? p.filter(x => x !== user.id) : [...p, user.id])}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left"
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))", color: "#fff" }}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <p className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{user.username}</p>
                        {selected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                            <span className="text-[10px]" style={{ color: "#fff" }}>✓</span>
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: groupName.trim() && selectedMembers.length > 0 ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                    color: groupName.trim() && selectedMembers.length > 0 ? "#fff" : "var(--mq-text-muted)",
                  }}
                >
                  Создать группу
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
