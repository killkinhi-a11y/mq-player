"use client";

// MQ Player — Messenger (Telegram-style rewrite)
// Safety-first: every state array is Array.isArray-guarded, every async op
// is wrapped in try/catch, and a recoverable error state replaces any white
// screen.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Search, Send, ArrowLeft, X, Plus, Loader2, UserPlus, Mic,
  Pin, Trash2, Smile, Users, Lock, Check, CheckCheck, Copy, Reply,
} from "lucide-react";
import { simulateDecryptSync, simulateEncrypt } from "@/lib/crypto";
import { useToast } from "@/hooks/use-toast";
import type { Message as ChatMessage } from "@/lib/musicApi";

// ─── Types ────────────────────────────────────────────────────────────────

interface FriendUser { id: string; username: string; avatar?: string; addedAt: string; }
interface OnlineStatus { online: boolean; lastSeen: string | null; }
interface GroupMember { id: string; username: string; avatar?: string; }
interface GroupChat {
  id: string; name: string; avatar?: string; members: GroupMember[]; createdAt: string;
}
interface ContextMenuState { id: string; x: number; y: number; }

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👍", "😮", "😢"];

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "был(а) недавно";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "был(а) недавно";
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `был(а) ${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `был(а) ${diffH} ч назад`;
    return `был(а) ${d.toLocaleDateString("ru-RU")}`;
  } catch { return "был(а) недавно"; }
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function getDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const msgDay = new Date(d); msgDay.setHours(0, 0, 0, 0);
    if (msgDay.getTime() === today.getTime()) return "Сегодня";
    if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch { return ""; }
}

function sameDay(a: string, b: string): boolean {
  try {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  } catch { return false; }
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #e03131, #b91c1c)",
  "linear-gradient(135deg, #db2777, #9d174d)",
  "linear-gradient(135deg, #9333ea, #6b21a8)",
  "linear-gradient(135deg, #0d9488, #134e4a)",
  "linear-gradient(135deg, #65a30d, #365314)",
  "linear-gradient(135deg, #d97706, #78350f)",
  "linear-gradient(135deg, #0891b2, #155e75)",
];

function colorForId(id: string): string {
  let hash = 0;
  const s = id || "x";
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name ? name.replace("@", "").charAt(0).toUpperCase() : "?";
}

function parseVoice(content: string): { voiceUrl: string; voiceDuration: number } | null {
  if (!content || typeof content !== "string") return null;
  try {
    const p = JSON.parse(content);
    if (p && typeof p.voiceUrl === "string") {
      return { voiceUrl: p.voiceUrl, voiceDuration: Number(p.voiceDuration) || 0 };
    }
  } catch {}
  return null;
}

function decrypt(content: string): string {
  try { return simulateDecryptSync(content || ""); } catch { return content || ""; }
}

// ─── Voice Message Bubble ─────────────────────────────────────────────────

function VoiceMessageBubble({ voiceUrl, duration, isMine }: {
  voiceUrl: string; duration: number; isMine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dur, setDur] = useState(duration || 0);

  useEffect(() => {
    let cancelled = false;
    try {
      const audio = new Audio(voiceUrl);
      audio.onloadedmetadata = () => { if (!cancelled) setDur(audio.duration || duration || 0); };
      audio.ontimeupdate = () => { if (!cancelled) setCurrentTime(audio.currentTime || 0); };
      audio.onended = () => { if (!cancelled) { setPlaying(false); setCurrentTime(0); } };
      audioRef.current = audio;
    } catch {}
    return () => {
      cancelled = true;
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
    };
  }, [voiceUrl, duration]);

  const toggle = useCallback(() => {
    try {
      const a = audioRef.current;
      if (!a) return;
      if (playing) { a.pause(); setPlaying(false); }
      else { a.play().catch(() => {}); setPlaying(true); }
    } catch {}
  }, [playing]);

  const progress = dur > 0 ? (currentTime / dur) * 100 : 0;
  // Deterministic waveform (no Math.random to avoid re-renders).
  const bars = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 28; i++) arr.push(0.25 + ((i * 7) % 10) / 12);
    return arr;
  }, []);

  return (
    <div className="flex items-center gap-2 min-w-[180px] py-0.5">
      <motion.button whileTap={{ scale: 0.9 }} onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isMine ? "rgba(255,255,255,0.22)" : "var(--mq-accent)", color: "#fff" }}
        aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <span className="text-[10px] leading-none">❚❚</span>
          : <span className="text-xs leading-none ml-0.5">▶</span>}
      </motion.button>
      <div className="flex-1">
        <div className="flex items-end gap-[2px] h-7">
          {bars.map((h, i) => {
            const isActive = (i / bars.length) * 100 < progress;
            return (
              <div key={i} className="w-[2px] rounded-full transition-colors"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isMine
                    ? (isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)")
                    : (isActive ? "var(--mq-accent)" : "var(--mq-text-muted)"),
                }} />
            );
          })}
        </div>
        <div className="text-[10px] mt-1"
          style={{ color: isMine ? "rgba(255,255,255,0.75)" : "var(--mq-text-muted)" }}>
          {formatDuration(playing ? currentTime : dur)}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────

function Avatar({ src, name, id, size = 44, isGroup = false }: {
  src?: string; name: string; id: string; size?: number; isGroup?: boolean;
}) {
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: isGroup ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : colorForId(id),
        color: "#fff", fontSize: size * 0.4,
      }}>
      {isGroup ? <Users style={{ width: size * 0.45, height: size * 0.45 }} /> : getInitials(name)}
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-[11px] px-3 py-1 rounded-full font-medium"
        style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function MessengerView() {
  const userId = useAppStore((s) => s.userId);
  const username = useAppStore((s) => s.username);
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const selectedContactId = useAppStore((s) => s.selectedContactId);
  const setSelectedContact = useAppStore((s) => s.setSelectedContact);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const unreadCounts = useAppStore((s) => s.unreadCounts) as Record<string, number>;
  const compactMode = useAppStore((s) => s.compactMode);
  const { toast } = useToast();

  // ── Local state ──
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, OnlineStatus>>({});
  const [inputText, setInputText] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [inChatSearch, setInChatSearch] = useState("");
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [newChatUsers, setNewChatUsers] = useState<any[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<Record<string, ChatMessage[]>>({});
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showQuickEmojis, setShowQuickEmojis] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastSeenTimeRef = useRef<string>(new Date(0).toISOString());
  const recordingDurationRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullStartYRef = useRef<number | null>(null);

  // ── Derived (always-defensive) ──
  const activeChatId = selectedGroupId || selectedContactId;
  const isGroupChat = !!selectedGroupId;
  const safeFriends = Array.isArray(friends) ? friends : [];
  const safeGroupChats = Array.isArray(groupChats) ? groupChats : [];
  const safeMessages = Array.isArray(messages) ? (messages as ChatMessage[]) : [];

  // ── Detect mobile ──
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Mobile view sync ──
  useEffect(() => { setMobileView(activeChatId ? "chat" : "list"); }, [activeChatId]);

  // ── Fetch friends ──
  const fetchFriends = useCallback(async () => {
    if (!userId) return;
    setIsLoadingFriends(true);
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      setFriends(Array.isArray(data.friends) ? data.friends : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [userId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Fetch group chats ──
  const fetchGroupChats = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/group-chats?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.groupChats) ? data.groupChats : Array.isArray(data) ? data : [];
      const normalized: GroupChat[] = list.map((g: any) => ({
        id: g.id, name: g.name || "Group", avatar: g.avatar,
        members: Array.isArray(g.members) ? g.members : [],
        createdAt: g.createdAt || new Date().toISOString(),
      }));
      setGroupChats(normalized);
    } catch {}
  }, [userId]);

  useEffect(() => { fetchGroupChats(); }, [fetchGroupChats]);

  // ── Fetch online statuses (poll every 30s) ──
  useEffect(() => {
    if (!userId || safeFriends.length === 0) return;
    let cancelled = false;
    const fetchStatuses = async () => {
      const statuses: Record<string, OnlineStatus> = {};
      await Promise.all(safeFriends.map(async (f) => {
        try {
          const res = await fetch(`/api/user/${f.id}/status`);
          if (res.ok) {
            const data = await res.json();
            statuses[f.id] = { online: !!data.online, lastSeen: data.lastSeen ?? null };
          } else {
            statuses[f.id] = { online: false, lastSeen: null };
          }
        } catch { statuses[f.id] = { online: false, lastSeen: null }; }
      }));
      if (!cancelled) setOnlineStatuses(statuses);
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, safeFriends]);

  // ── SSE for real-time DMs ──
  useEffect(() => {
    if (!userId) return;
    let destroyed = false;

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
          if (!destroyed) setTimeout(connect, 2000);
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

  // ── Document title with unread count ──
  useEffect(() => {
    if (!userId) return;
    try {
      const total = Object.values(unreadCounts || {}).reduce((sum, c) => sum + (c || 0), 0);
      document.title = total > 0 ? `(${total}) mq` : "mq";
    } catch {}
  }, [unreadCounts, userId]);

  // ── Load DM messages when contact selected ──
  useEffect(() => {
    if (!userId || !selectedContactId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}`);
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
    };
    load();
    return () => { cancelled = true; };
  }, [userId, selectedContactId]);

  // ── Load group messages + poll every 8s ──
  useEffect(() => {
    if (!userId || !selectedGroupId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/group-chats/${selectedGroupId}/messages?userId=${userId}`);
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
    };
    load();
    const interval = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, selectedGroupId]);

  // ── Auto-scroll on new message ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    try { el.scrollTop = el.scrollHeight; } catch {}
  }, [safeMessages, selectedContactId, groupMessages, selectedGroupId]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    try { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; } catch {}
  }, [inputText]);

  // ── Close context menu on outside click / Escape ──
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
    () => safeFriends.find((f) => f.id === selectedContactId) || null,
    [safeFriends, selectedContactId]
  );
  const selectedGroup = useMemo(
    () => safeGroupChats.find((g) => g.id === selectedGroupId) || null,
    [safeGroupChats, selectedGroupId]
  );

  // ── Conversation messages (sorted) ──
  const conversationMessages = useMemo<ChatMessage[]>(() => {
    if (isGroupChat) {
      const list = groupMessages[selectedGroupId || ""];
      return Array.isArray(list) ? list : [];
    }
    if (!userId || !selectedContactId) return [];
    return safeMessages
      .filter((m) =>
        (m.senderId === userId && m.receiverId === selectedContactId) ||
        (m.senderId === selectedContactId && m.receiverId === userId))
      .sort((a, b) => {
        try { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); }
        catch { return 0; }
      });
  }, [safeMessages, groupMessages, userId, selectedContactId, selectedGroupId, isGroupChat]);

  // ── In-chat message search (functional) ──
  // Filters conversationMessages by text content when inChatSearch is non-empty.
  // Highlights matched messages, allows user to find specific content in long chats.
  const filteredMessages = useMemo<ChatMessage[]>(() => {
    if (!inChatSearch.trim()) return conversationMessages;
    const q = inChatSearch.toLowerCase();
    return conversationMessages.filter(m => {
      let content = "";
      try { content = simulateDecryptSync(m.content || ""); } catch { content = m.content || ""; }
      return content.toLowerCase().includes(q);
    });
  }, [conversationMessages, inChatSearch]);

  // ── Last message preview per DM contact ──
  const lastMessageByContact = useMemo<Record<string, ChatMessage>>(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of safeMessages) {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!otherId) continue;
      const existing = map[otherId];
      if (!existing || new Date(m.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map[otherId] = m;
      }
    }
    return map;
  }, [safeMessages, userId]);

  // ── Sorted chat list (pinned first, then by last activity) ──
  const sortedChats = useMemo<Array<{
    type: "dm" | "group"; id: string; name: string; avatar?: string;
    lastTime: number; lastMsg?: ChatMessage; memberCount: number;
  }>>(() => {
    const items: Array<{
      type: "dm" | "group"; id: string; name: string; avatar?: string;
      lastTime: number; lastMsg?: ChatMessage; memberCount: number;
    }> = [];
    for (const f of safeFriends) {
      const last = lastMessageByContact[f.id];
      items.push({
        type: "dm", id: f.id, name: f.username, avatar: f.avatar,
        lastTime: last ? new Date(last.createdAt).getTime() : 0,
        lastMsg: last, memberCount: 0,
      });
    }
    for (const g of safeGroupChats) {
      const list = groupMessages[g.id];
      const last = Array.isArray(list) && list.length > 0 ? list[list.length - 1] : undefined;
      items.push({
        type: "group", id: g.id, name: g.name, avatar: g.avatar,
        lastTime: last ? new Date(last.createdAt).getTime() : 0,
        lastMsg: last, memberCount: Array.isArray(g.members) ? g.members.length : 0,
      });
    }
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
    return filtered.sort((a, b) => {
      const aP = pinnedChats.includes(a.id) ? 1 : 0;
      const bP = pinnedChats.includes(b.id) ? 1 : 0;
      if (aP !== bP) return bP - aP;
      return b.lastTime - a.lastTime;
    });
  }, [safeFriends, safeGroupChats, groupMessages, lastMessageByContact, searchQuery, pinnedChats]);

  // ── Toggle pin chat ──
  const togglePinChat = useCallback((chatId: string) => {
    setPinnedChats((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const next = arr.includes(chatId) ? arr.filter((x) => x !== chatId) : [...arr, chatId];
      try { localStorage.setItem("mq-pinned-chats", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Toggle pin message (per-chat, localStorage) ──
  const pinnedMsgId = activeChatId ? pinnedMessages[activeChatId] : undefined;
  const pinnedMessage = useMemo(() => {
    if (!pinnedMsgId) return null;
    return conversationMessages.find((m) => m.id === pinnedMsgId) || null;
  }, [pinnedMsgId, conversationMessages]);

  const togglePinMessage = useCallback((msgId: string) => {
    if (!activeChatId) return;
    setPinnedMessages((prev) => {
      const next = { ...prev };
      if (next[activeChatId] === msgId) delete next[activeChatId];
      else next[activeChatId] = msgId;
      try { localStorage.setItem("mq-pinned-messages", JSON.stringify(next)); } catch {}
      return next;
    });
    setContextMenu(null);
  }, [activeChatId]);

  // ── Delete message (local only) ──
  const handleDeleteMessage = useCallback((msgId: string) => {
    try {
      if (isGroupChat && selectedGroupId) {
        setGroupMessages((prev) => {
          const list = prev[selectedGroupId] || [];
          return { ...prev, [selectedGroupId]: list.filter((m) => m.id !== msgId) };
        });
      } else {
        useAppStore.setState((s) => ({
          messages: (Array.isArray(s.messages) ? s.messages : []).filter(
            (m: ChatMessage) => m.id !== msgId),
        }));
      }
      toast({ title: "Сообщение удалено" });
    } catch { toast({ title: "Не удалось удалить" }); }
    setContextMenu(null);
  }, [isGroupChat, selectedGroupId, toast]);

  // ── Copy message ──
  const handleCopyMessage = useCallback((msgId: string) => {
    try {
      const msg = conversationMessages.find((m) => m.id === msgId);
      if (!msg) return;
      const voice = parseVoice(msg.content);
      const text = voice ? "🎤 Голосовое сообщение" : decrypt(msg.content);
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      toast({ title: "Скопировано" });
    } catch {}
    setContextMenu(null);
  }, [conversationMessages, toast]);

  // ── Reply (quote into input) ──
  const handleReplyMessage = useCallback((msgId: string) => {
    try {
      const msg = conversationMessages.find((m) => m.id === msgId);
      if (!msg) return;
      const voice = parseVoice(msg.content);
      const text = voice ? "🎤 Голосовое сообщение" : decrypt(msg.content).slice(0, 60);
      setInputText((p) => (p ? p + "\n" : "") + `> ${text}\n`);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {}
    setContextMenu(null);
  }, [conversationMessages]);

  // ── Send message (DM or group) ──
  const handleSend = useCallback(async () => {
    const text = (inputText || "").trim();
    if (!text || !userId || !activeChatId || isSending) return;
    setIsSending(true);
    setInputText("");
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
  }, [inputText, userId, activeChatId, isGroupChat, isSending, addMessage, username, toast]);

  // ── Voice recording ──
  const startRecording = useCallback(async () => {
    if (!activeChatId || !userId) return;
    const chatIdSnap = activeChatId;
    const isGroupSnap = isGroupChat;
    const userSnap = userId;
    const usernameSnap = username;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        try {
          const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const base64Url = String(reader.result || "");
              const duration = recordingDurationRef.current;
              const content = JSON.stringify({ voiceUrl: base64Url, voiceDuration: duration });
              const now = new Date().toISOString();
              if (isGroupSnap) {
                setGroupMessages((prev) => ({
                  ...prev,
                  [chatIdSnap]: [...(prev[chatIdSnap] || []), {
                    id: `voice_${Date.now()}`, content, senderId: userSnap,
                    receiverId: chatIdSnap, encrypted: false, createdAt: now,
                    senderName: usernameSnap ? `@${usernameSnap}` : undefined,
                    messageType: "voice",
                  }],
                }));
                await fetch(`/api/group-chats/${chatIdSnap}/messages`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ senderId: userSnap, content, messageType: "voice" }),
                }).catch(() => {});
              } else {
                addMessage({
                  id: `voice_${Date.now()}`, content, senderId: userSnap,
                  receiverId: chatIdSnap, encrypted: false, createdAt: now,
                  senderName: usernameSnap ? `@${usernameSnap}` : undefined,
                  messageType: "voice",
                });
                await fetch("/api/messages", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ receiverId: chatIdSnap, content, encrypted: false, messageType: "voice" }),
                }).catch(() => {});
              }
            } catch {}
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        } catch {}
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingDurationRef.current = 0;
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration(recordingDurationRef.current);
      }, 1000);
    } catch {
      toast({ title: "Микрофон недоступен" });
    }
  }, [activeChatId, isGroupChat, userId, username, addMessage, toast]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // ── Search users (debounced) ──
  useEffect(() => {
    if (!showNewChat && !showNewGroup) return;
    const q = newChatSearch.trim();
    if (!q) { setNewChatUsers([]); return; }
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
  }, [showNewChat, showNewGroup, newChatSearch, userId]);

  // ── Start new chat ──
  const handleStartChat = useCallback((user: any) => {
    if (!user?.id) return;
    fetch("/api/friends", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, friendId: user.id }),
    })
      .then(() => {
        fetchFriends();
        fetchGroupChats();
        setSelectedContact(user.id);
        setSelectedGroupId(null);
        setShowNewChat(false);
        setNewChatSearch("");
        setNewChatUsers([]);
      })
      .catch(() => toast({ title: "Не удалось добавить" }));
  }, [userId, fetchFriends, fetchGroupChats, setSelectedContact, toast]);

  // ── Create group ──
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || !userId) return;
    try {
      const res = await fetch("/api/group-chats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(), creatorId: userId,
          memberIds: [...selectedMembers, userId],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newGroup: GroupChat = data.groupChat || data;
        setGroupChats((p) => (Array.isArray(p) ? [...p, newGroup] : [newGroup]));
        setSelectedGroupId(newGroup?.id || null);
        setSelectedContact(null);
        setShowNewGroup(false);
        setGroupName("");
        setSelectedMembers([]);
        setNewChatSearch("");
        setNewChatUsers([]);
        toast({ title: "Группа создана" });
      } else {
        toast({ title: "Не удалось создать группу" });
      }
    } catch { toast({ title: "Не удалось создать группу" }); }
  }, [groupName, selectedMembers, userId, setSelectedContact, toast]);

  // ── Typing indicator ──
  const typingTs = useAppStore((s) =>
    selectedContactId ? s.typingUsers[selectedContactId] : undefined);
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
  }, [selectedContactId, isGroupChat]);

  // ── Mobile back ──
  const handleMobileBack = useCallback(() => {
    setSelectedContact(null);
    setSelectedGroupId(null);
    setMobileView("list");
  }, [setSelectedContact]);

  // ── Pull-to-refresh on mobile list ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (mobileView !== "list") return;
    const el = e.currentTarget as HTMLElement;
    pullStartYRef.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, [mobileView]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return;
    const dy = e.changedTouches[0].clientY - pullStartYRef.current;
    pullStartYRef.current = null;
    if (dy > 80 && !isRefreshing) {
      setIsRefreshing(true);
      Promise.all([fetchFriends(), fetchGroupChats()]).finally(() => {
        setTimeout(() => setIsRefreshing(false), 600);
      });
    }
  }, [isRefreshing, fetchFriends, fetchGroupChats]);

  // ── Render flags ──
  const showListPanel = mobileView === "list" || !isMobileView;
  const showChatPanel = mobileView === "chat" || !isMobileView;

  // ── Recoverable error state (no white screen ever) ──
  if (loadError && safeFriends.length === 0 && safeGroupChats.length === 0) {
    return (
      <div className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container)] mx-auto`}
        style={{ height: "calc(100dvh - 90px - 56px)" }}>
        <div className="flex flex-col items-center justify-center h-full rounded-3xl"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)" }}>
          <MessageCircle className="w-10 h-10 mb-3"
            style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
          <p className="text-sm font-medium mb-2" style={{ color: "var(--mq-text)" }}>
            Не удалось загрузить чаты
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>
            Проверьте подключение и попробуйте снова
          </p>
          <motion.button whileTap={{ scale: 0.95 }}
            onClick={() => { setLoadError(false); fetchFriends(); fetchGroupChats(); }}
            className="px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
            Повторить
          </motion.button>
        </div>
      </div>
    );
  }

  const cardStyle = {
    backgroundColor: "var(--mq-card)" as const,
    border: "1px solid var(--mq-border-thin)" as const,
    boxShadow: "var(--mq-shadow-float)" as const,
  };
  const inputStyle = {
    backgroundColor: "var(--mq-input-bg)" as const,
    border: "1px solid var(--mq-border-hairline)" as const,
    color: "var(--mq-text)" as const,
  };
  const hairlineBorder = { borderColor: "var(--mq-border-hairline)" as const };

  return (
    <div className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container)] mx-auto`}
      style={{ height: "calc(100dvh - 90px - 56px)" }}>
      <div className="flex rounded-3xl overflow-hidden h-full" style={cardStyle}>
        {/* ── Contacts list ── */}
        {showListPanel && (
          <div className={`${isMobileView && mobileView === "chat" ? "hidden" : "flex"} flex-col w-full lg:w-[380px] flex-shrink-0 border-r`}
            style={hairlineBorder}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>Чаты</h2>
                {safeFriends.length + safeGroupChats.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                    {safeFriends.length + safeGroupChats.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }}
                  onClick={() => setShowNewGroup(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
                  aria-label="Новая группа" title="Новая группа">
                  <Users className="w-4 h-4" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }}
                  onClick={() => setShowNewChat(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                  aria-label="Новый чат">
                  <Plus className="w-4 h-4" />
                </motion.button>
              </div>
            </div>

            {/* Search */}
            <div className="p-3 border-b" style={hairlineBorder}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--mq-text-muted)" }} />
                <input type="text" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск чатов"
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={inputStyle} />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto"
              onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              {isRefreshing && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                </div>
              )}
              {isLoadingFriends && safeFriends.length === 0 && safeGroupChats.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                </div>
              ) : sortedChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <MessageCircle className="w-10 h-10 mb-3"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>
                    {/* UX Core #1 (Эвристика доступности): без императива,
                        позитивная формулировка снижает барьер. */}
                    {searchQuery.trim() ? "Ничего не найдено" : "Пока пусто"}
                  </p>
                  <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>
                    {searchQuery.trim() ? "Попробуйте другой запрос" : "Найдите друзей — и здесь появятся чаты"}
                  </p>
                  {!searchQuery.trim() && (
                    <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}
                      onClick={() => setShowNewChat(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                      style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
                      <UserPlus className="w-3.5 h-3.5" />
                      Найти друзей
                    </motion.button>
                  )}
                </div>
              ) : (
                sortedChats.map((item, i) => {
                  const isActive = item.type === "group"
                    ? selectedGroupId === item.id : selectedContactId === item.id;
                  const isPinned = pinnedChats.includes(item.id);
                  const isOnline = item.type === "dm" && onlineStatuses[item.id]?.online;
                  const unread = item.type === "dm" ? unreadCounts[item.id] || 0 : 0;
                  const last = item.lastMsg;
                  let lastText: string;
                  if (last) {
                    if (last.messageType === "voice") {
                      lastText = "🎤 Голосовое сообщение";
                    } else {
                      const prefix = last.senderId === userId && item.type === "group" ? "Вы: " : "";
                      lastText = prefix + decrypt(last.content).slice(0, 40);
                    }
                  } else if (item.type === "group") {
                    lastText = `${item.memberCount} участников`;
                  } else if (isOnline) {
                    lastText = "в сети";
                  } else {
                    lastText = formatLastSeen(onlineStatuses[item.id]?.lastSeen ?? null);
                  }
                  return (
                    <motion.button key={`${item.type}_${item.id}`}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.025, 0.3), duration: 0.2 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        if (item.type === "group") {
                          setSelectedGroupId(item.id); setSelectedContact(null);
                        } else {
                          setSelectedContact(item.id); setSelectedGroupId(null);
                        }
                      }}
                      onContextMenu={(e) => { e.preventDefault(); togglePinChat(item.id); }}
                      className="w-full flex items-center gap-3 p-3 text-left transition-colors"
                      style={{
                        backgroundColor: isActive
                          ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
                        borderLeft: isActive ? "3px solid var(--mq-accent)" : "3px solid transparent",
                      }}>
                      <div className="relative flex-shrink-0">
                        <Avatar src={item.avatar} name={item.name} id={item.id} size={44}
                          isGroup={item.type === "group"} />
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                            style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate flex items-center gap-1"
                            style={{ color: "var(--mq-text)" }}>
                            {isPinned && (
                              <Pin className="w-3 h-3 flex-shrink-0"
                                style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
                            )}
                            {item.name}
                          </p>
                          {last && (
                            <span className="text-[10px] flex-shrink-0"
                              style={{ color: isPinned ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                              {formatTime(last.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {lastText}
                          </p>
                          {unread > 0 && (
                            <span className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1 flex-shrink-0"
                              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
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
        {showChatPanel && (selectedFriend || selectedGroup) ? (
          <div className={`${isMobileView && mobileView === "list" ? "hidden" : "flex"} flex-col flex-1 min-w-0`}>
            {/* Header */}
            <div className="p-3 sm:p-4 flex items-center gap-3 border-b" style={hairlineBorder}>
              {isMobileView && (
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleMobileBack}
                  className="p-1" style={{ color: "var(--mq-text-muted)" }} aria-label="Назад">
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
              )}
              <div className="relative flex-shrink-0">
                {isGroupChat ? (
                  <Avatar name={selectedGroup?.name || "Group"} id={selectedGroupId || ""} size={40} isGroup />
                ) : (
                  <Avatar src={selectedFriend?.avatar} name={selectedFriend?.username || "User"}
                    id={selectedFriend?.id || ""} size={40} />
                )}
                {!isGroupChat && selectedFriend && onlineStatuses[selectedFriend.id]?.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                    style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-card)" }} />
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
                    `${selectedGroup && Array.isArray(selectedGroup.members) ? selectedGroup.members.length : 0} участников`
                  ) : onlineStatuses[selectedFriend?.id || ""]?.online ? (
                    "в сети"
                  ) : (
                    formatLastSeen(onlineStatuses[selectedFriend?.id || ""]?.lastSeen ?? null)
                  )}
                </p>
              </div>
              {isGroupChat && selectedGroup && Array.isArray(selectedGroup.members) &&
                selectedGroup.members.length > 0 && (
                <div className="hidden sm:flex -space-x-2">
                  {selectedGroup.members.slice(0, 4).map((m, idx) => (
                    <div key={m.id || `m${idx}`} className="rounded-full border-2"
                      style={{ borderColor: "var(--mq-card)" }}>
                      <Avatar src={m.avatar} name={m.username} id={m.id || `m${idx}`} size={24} />
                    </div>
                  ))}
                </div>
              )}
              {/* In-chat search toggle button */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setShowInChatSearch(!showInChatSearch);
                  if (showInChatSearch) setInChatSearch("");
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: showInChatSearch ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent",
                  color: showInChatSearch ? "var(--mq-accent)" : "var(--mq-text-muted)",
                }}
                title="Поиск по сообщениям"
              >
                <Search className="w-4 h-4" />
              </motion.button>
            </div>

            {/* In-chat search input (collapsible) */}
            <AnimatePresence>
              {showInChatSearch && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-2 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      <input
                        type="text"
                        value={inChatSearch}
                        onChange={(e) => setInChatSearch(e.target.value)}
                        placeholder="Поиск в чате..."
                        autoFocus
                        className="w-full pl-9 pr-9 py-2 rounded-xl text-sm outline-none"
                        style={{
                          backgroundColor: "var(--mq-card)",
                          color: "var(--mq-text)",
                          border: "1px solid var(--mq-border-thin)",
                        }}
                      />
                      {inChatSearch && (
                        <button
                          onClick={() => setInChatSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ color: "var(--mq-text-muted)" }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {inChatSearch.trim() && (
                      <p className="text-[11px] mt-1.5" style={{ color: "var(--mq-text-muted)" }}>
                        Найдено: {filteredMessages.length}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pinned message bar */}
            <AnimatePresence>
              {pinnedMessage && (
                <motion.div initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-2 border-b flex items-center gap-2 overflow-hidden"
                  style={{
                    borderColor: "var(--mq-border-hairline)",
                    backgroundColor: "color-mix(in srgb, var(--mq-accent) 6%, transparent)",
                  }}>
                  <Pin className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "var(--mq-accent)" }} fill="currentColor" />
                  <p className="text-xs truncate flex-1" style={{ color: "var(--mq-text-muted)" }}>
                    {pinnedMessage.messageType === "voice"
                      ? "🎤 Голосовое сообщение"
                      : decrypt(pinnedMessage.content).slice(0, 80)}
                  </p>
                  <button onClick={() => togglePinMessage(pinnedMessage.id)}
                    style={{ color: "var(--mq-text-muted)" }} aria-label="Открепить">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle className="w-10 h-10 mb-3"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    {/* UX Core #1: позитивная формулировка вместо императива */}
                    {inChatSearch.trim() ? "Ничего не найдено" : (isGroupChat ? "Пока тишина" : `Напишите ${selectedFriend?.username} — пусть начнётся`)}
                  </p>
                </div>
              ) : (
                filteredMessages.map((msg, i) => {
                  const isMine = msg.senderId === userId;
                  const prev = filteredMessages[i - 1];
                  const showDateSep = !prev || !sameDay(prev.createdAt, msg.createdAt);
                  const prevSameSender = prev && prev.senderId === msg.senderId && !showDateSep;
                  const voiceData = parseVoice(msg.content);
                  const text = voiceData ? "" : decrypt(msg.content);
                  const isTemp = String(msg.id).startsWith("temp_");
                  return (
                    <div key={msg.id}>
                      {showDateSep && <DateSeparator label={getDateLabel(msg.createdAt)} />}
                      <motion.div
                        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${prevSameSender ? "mt-0.5" : "mt-2"}`}>
                        {!isMine && (
                          <div className="w-7 flex-shrink-0">
                            {!prevSameSender && (
                              isGroupChat ? (
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                                  style={{ background: colorForId(msg.senderId), color: "#fff" }}>
                                  {getInitials(msg.senderName || msg.senderId)}
                                </div>
                              ) : (
                                <Avatar src={selectedFriend?.avatar}
                                  name={selectedFriend?.username || "U"}
                                  id={selectedFriend?.id || ""} size={28} />
                              )
                            )}
                          </div>
                        )}
                        <div className="relative group max-w-[85%]">
                          {isGroupChat && !isMine && !prevSameSender && (
                            <p className="text-[10px] mb-1 ml-1 font-medium"
                              style={{ color: colorForId(msg.senderId) }}>
                              {msg.senderName?.replace("@", "") || "User"}
                            </p>
                          )}
                          <div
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY });
                            }}
                            className={`px-3.5 py-2 cursor-pointer ${isMine ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md"}`}
                            style={{
                              backgroundColor: isMine ? "var(--mq-accent)"
                                : "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))",
                              color: isMine ? "#fff" : "var(--mq-text)",
                            }}>
                            {voiceData ? (
                              <VoiceMessageBubble voiceUrl={voiceData.voiceUrl}
                                duration={voiceData.voiceDuration || 0} isMine={isMine} />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
                            )}
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <span className="text-[10px]"
                                style={{ color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
                                {formatTime(msg.createdAt)}
                              </span>
                              {isMine && (isTemp ? (
                                <Check className="w-3 h-3" style={{ color: "rgba(255,255,255,0.7)" }} />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.85)" }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })
              )}
              {showTyping && !isGroupChat && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-2 justify-start mt-2">
                  <div className="w-7 flex-shrink-0" />
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, var(--mq-card))" }}>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: "var(--mq-text-muted)" }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t" style={hairlineBorder}>
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full"
                    style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <motion.span animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                    <span className="text-sm" style={{ color: "#ef4444" }}>
                      Запись… {formatDuration(recordingDuration)}
                    </span>
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={stopRecording}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                    aria-label="Отправить голосовое">
                    <Send className="w-4 h-4" />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={cancelRecording}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    aria-label="Отменить запись">
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {showQuickEmojis && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                      className="flex gap-1">
                      {QUICK_EMOJIS.map((emoji) => (
                        <motion.button key={emoji} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setInputText((p) => p + emoji);
                            setShowQuickEmojis(false);
                            inputRef.current?.focus();
                          }}
                          className="text-xl p-1.5 rounded-lg"
                          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                          {emoji}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                  <div className="flex items-end gap-2">
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                      onClick={() => setShowQuickEmojis((v) => !v)}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: showQuickEmojis
                          ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                          : "rgba(255,255,255,0.06)",
                        color: showQuickEmojis ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      }} aria-label="Эмодзи">
                      <Smile className="w-4 h-4" />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                      onClick={startRecording}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
                      aria-label="Записать голосовое">
                      <Mic className="w-4 h-4" />
                    </motion.button>
                    <textarea ref={inputRef} value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Сообщение…" rows={1}
                      className="flex-1 px-4 py-2.5 rounded-2xl text-sm outline-none resize-none max-h-[120px]"
                      style={inputStyle} />
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                      onClick={handleSend} disabled={!inputText.trim() || isSending}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: inputText.trim() && !isSending
                          ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                        color: inputText.trim() && !isSending ? "#fff" : "var(--mq-text-muted)",
                      }} aria-label="Отправить">
                      {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </motion.button>
                  </div>
                  <div className="flex items-center justify-center gap-1 text-[10px]"
                    style={{ color: "var(--mq-text-muted)" }}>
                    <Lock className="w-2.5 h-2.5" />
                    <span>Сообщения защищены TLS-шифрованием</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : showChatPanel ? (
          <div className={`${isMobileView && mobileView === "list" ? "hidden" : "flex"} flex-1 flex-col items-center justify-center text-center p-8`}>
            <MessageCircle className="w-12 h-12 mb-4"
              style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-base font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
              Выберите чат
            </p>
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              Выберите собеседника слева, чтобы начать диалог
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 min-w-[160px] rounded-xl overflow-hidden py-1"
            style={{
              left: Math.min(contextMenu.x,
                (typeof window !== "undefined" ? window.innerWidth : 9999) - 180),
              top: Math.min(contextMenu.y,
                (typeof window !== "undefined" ? window.innerHeight : 9999) - 220),
              ...cardStyle,
            }}>
            <button onClick={() => handleReplyMessage(contextMenu.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "var(--mq-text)" }}>
              <Reply className="w-3.5 h-3.5" /> Ответить
            </button>
            <button onClick={() => handleCopyMessage(contextMenu.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "var(--mq-text)" }}>
              <Copy className="w-3.5 h-3.5" /> Копировать
            </button>
            <button onClick={() => togglePinMessage(contextMenu.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "var(--mq-text)" }}>
              <Pin className="w-3.5 h-3.5"
                style={{ color: pinnedMsgId === contextMenu.id ? "var(--mq-accent)" : "currentColor" }}
                fill={pinnedMsgId === contextMenu.id ? "currentColor" : "none"} />
              {pinnedMsgId === contextMenu.id ? "Открепить" : "Закрепить"}
            </button>
            <button onClick={() => handleDeleteMessage(contextMenu.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "#ef4444" }}>
              <Trash2 className="w-3.5 h-3.5" /> Удалить
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New chat dialog ── */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowNewChat(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={cardStyle} onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новый чат</h3>
                <button onClick={() => setShowNewChat(false)}
                  style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--mq-text-muted)" }} />
                  <input type="text" value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Поиск пользователей" autoFocus
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={inputStyle} />
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!newChatSearch.trim() ? (
                    <p className="text-center text-sm py-8" style={{ color: "var(--mq-text-muted)" }}>
                      Начните искать по имени пользователя
                    </p>
                  ) : newChatUsers.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: "var(--mq-text-muted)" }}>
                      Никого не найдено
                    </p>
                  ) : (
                    newChatUsers.map((user) => (
                      <motion.button key={user.id}
                        whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleStartChat(user)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left">
                        <Avatar src={user.avatar} name={user.username} id={user.id} size={40} />
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

      {/* ── New group dialog ── */}
      <AnimatePresence>
        {showNewGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowNewGroup(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={cardStyle} onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новая группа</h3>
                <button onClick={() => setShowNewGroup(false)}
                  style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <input type="text" value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Название группы" autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={inputStyle} />
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--mq-text-muted)" }} />
                  <input type="text" value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Добавить участников"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={inputStyle} />
                </div>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map((id) => {
                      const u = newChatUsers.find((u) => u.id === id);
                      if (!u) return null;
                      return (
                        <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                            color: "var(--mq-accent)",
                          }}>
                          {u.username}
                          <button onClick={() => setSelectedMembers((p) => p.filter((x) => x !== id))}
                            aria-label="Убрать">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto">
                  {newChatUsers.map((user) => {
                    const selected = selectedMembers.includes(user.id);
                    return (
                      <motion.button key={user.id}
                        whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedMembers((p) =>
                          selected ? p.filter((x) => x !== user.id) : [...p, user.id])}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left">
                        <Avatar src={user.avatar} name={user.username} id={user.id} size={36} />
                        <p className="flex-1 text-sm font-semibold truncate"
                          style={{ color: "var(--mq-text)" }}>
                          {user.username}
                        </p>
                        {selected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--mq-accent)" }}>
                            <span className="text-[10px]" style={{ color: "#fff" }}>✓</span>
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: groupName.trim() && selectedMembers.length > 0
                      ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                    color: groupName.trim() && selectedMembers.length > 0
                      ? "#fff" : "var(--mq-text-muted)",
                  }}>
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
