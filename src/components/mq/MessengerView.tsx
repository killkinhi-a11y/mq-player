"use client";

// MQ Player — Messenger (premium iMessage-grade glass redesign, v14)
// Safety-first: every state array is Array.isArray-guarded, every async op
// is wrapped in try/catch, and a recoverable error state replaces any white
// screen. Visual language lives in ./messenger.css (mqms-* classes) on the
// MQ material system tokens.

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { canPollProtected, controlled401Recovery, isDemoUser } from "@/lib/authGate";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Search, Send, ArrowLeft, X, Plus, Loader2, UserPlus, Mic,
  Pin, Trash2, Smile, Users, Lock, Check, CheckCheck, Copy, Reply, User, Contact,
  Play, Pause, Music2, Image as ImageIcon, AlertCircle, Clock,
  ChevronDown, SquarePen, MessagesSquare, ChevronRight, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { simulateDecryptSync, simulateEncrypt } from "@/lib/crypto";
import { useToast } from "@/hooks/use-toast";
import type { Message as ChatMessage } from "@/lib/musicApi";
import { formatDuration as formatDurationCanonical } from "@/lib/musicApi";
import { hoverProps } from "@/lib/hoverCapability";
import {
  DEMO_FRIENDS, DEMO_GROUP, DEMO_ONLINE,
  DEMO_DEFAULT_CHAT_ID, buildDemoThreads,
} from "./demoChat";
import "./messenger.css";

// ─── Types ────────────────────────────────────────────────────────────────

interface FriendUser { id: string; username: string; avatar?: string; addedAt: string; }
interface OnlineStatus { online: boolean; lastSeen: string | null; }
interface GroupMember { id: string; username: string; avatar?: string; userId?: string; role?: string; }
interface GroupChat {
  id: string; name: string; avatar?: string; members: GroupMember[]; createdAt: string;
  /** Count from the list API (owner included) — filled before the detail load. */
  memberCount?: number;
  createdBy?: string;
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

// v69: canonical formatter (guards + h:mm:ss) replaces the guarded local
// copy — one formatter everywhere.
const formatDuration = formatDurationCanonical;

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
    <div className="flex items-center gap-3 min-w-[200px] py-0.5">
      <motion.button onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform"
        whileTap={{ scale: 0.94 }}
        style={{
          backgroundColor: isMine
            ? "color-mix(in srgb, var(--mq-text) 18%, transparent)"
            : "var(--mq-platinum-lift)",
          boxShadow: isMine
            ? "none"
            : "inset 0 1px 0 rgba(255,255,255,0.09), 0 2px 10px rgba(0,0,0,0.32)",
          color: "#fff",
        }}
        aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <Pause className="w-4 h-4" />
          : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </motion.button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-[2px] h-7" aria-hidden="true">
          {bars.map((h, i) => {
            const isActive = (i / bars.length) * 100 < progress;
            return (
              <div key={i} className="w-[2px] rounded-full transition-colors"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isMine
                    ? (isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)")
                    : (isActive ? "var(--mq-platinum-hi)" : "color-mix(in srgb, var(--mq-text) 30%, transparent)"),
                }} />
            );
          })}
        </div>
        <div className="mq-t-meta-2 mt-1 tabular-nums"
          style={{ color: isMine ? "rgba(244,246,250,0.72)" : "var(--mq-text-muted)" }}>
          {formatDuration(playing ? currentTime : dur)}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────

function Avatar({ src, name, id, size = 44, isGroup = false, ring = false }: {
  src?: string; name: string; id: string; size?: number; isGroup?: boolean; ring?: boolean;
}) {
  const ringShadow = ring
    ? { boxShadow: "0 0 0 1px color-mix(in srgb, var(--mq-text) 14%, transparent), 0 0 0 4px color-mix(in srgb, var(--mq-text) 4%, transparent)" }
    : undefined;
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size, boxShadow: ringShadow ? ringShadow.boxShadow : undefined }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: isGroup ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : colorForId(id),
        color: "#fff", fontSize: size * 0.4,
        boxShadow: ringShadow ? ringShadow.boxShadow : undefined,
      }}>
      {isGroup ? <Users style={{ width: size * 0.45, height: size * 0.45 }} /> : getInitials(name)}
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="mqms-date" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

// ─── List preview: type icon for the last message (voice / photo / track) ──

function previewIconFor(last: ChatMessage | undefined): LucideIcon | null {
  if (!last) return null;
  if (last.messageType === "voice") return Mic;
  try {
    const raw = decrypt(last.content || "").trim();
    if (/^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp|svg)([?#]|$)/i.test(raw)) return ImageIcon;
    if (raw.startsWith("🎵")) return Music2;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "track_share") return Music2;
  } catch { /* plain text — no icon */ }
  return null;
}

// ─── History skeleton (loading state) ─────────────────────────────────────

function HistorySkeleton() {
  const rows = [
    { mine: false, w: "w-40 sm:w-52", h: "h-11" },
    { mine: true, w: "w-56 sm:w-72", h: "h-12" },
    { mine: false, w: "w-32 sm:w-40", h: "h-9" },
    { mine: true, w: "w-44 sm:w-60", h: "h-11" },
  ];
  return (
    <div className="flex flex-col gap-4 pt-2" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
          <div
            className={`mqms-skel ${r.w} ${r.h} ${r.mine ? "mqms-tail-out" : "mqms-tail-in"}`}
            style={{ animationDelay: `${i * 0.14}s` }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function MessengerView() {
  const userId = useAppStore((s) => s.userId);
  const username = useAppStore((s) => s.username);
  const avatar = useAppStore((s) => s.avatar);
  // P1: demo sessions have no social graph — the empty-chats state says so.
  // (isDemoUser() helper stays module-level; this is just the local flag.)
  const isDemoSession = userId === "demo-user-id";
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const selectedContactId = useAppStore((s) => s.selectedContactId);
  const setSelectedContact = useAppStore((s) => s.setSelectedContact);
  const setView = useAppStore((s) => s.setView);
  const currentView = useAppStore((s) => s.currentView);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const unreadCounts = useAppStore((s) => s.unreadCounts) as Record<string, number>;
  const compactMode = useAppStore((s) => s.compactMode);
  const { toast } = useToast();

  // ── Local state ──
  // Demo sessions (v14): seeded friends/group/status so the messenger
  // shows the reference layout without an account; threads live in
  // demoThreads below. Real sessions start empty exactly as before.
  const [friends, setFriends] = useState<FriendUser[]>(() =>
    isDemoSession ? DEMO_FRIENDS : []);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, OnlineStatus>>(() =>
    isDemoSession ? { ...DEMO_ONLINE } : {});
  // Demo threads — in-memory conversations (nothing persists, no API).
  const [demoThreads, setDemoThreads] = useState<Record<string, ChatMessage[]>>(() =>
    isDemoSession ? buildDemoThreads() : {});
  const [inputText, setInputText] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  // Add-members flow for an EXISTING group (empty-group state, §13).
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMembersTarget, setAddMembersTarget] = useState<string[]>([]);
  const [inChatSearch, setInChatSearch] = useState("");
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [showProfile, setShowProfile] = useState<string | null>(null); // userId for profile modal
  const [newChatSearch, setNewChatSearch] = useState("");
  const [newChatUsers, setNewChatUsers] = useState<any[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Reference-style section filter (desktop nav rows): "all" = DMs + groups,
  // "groups" = group chats only. Real filter over the loaded social graph —
  // no dead sections.
  const [listFilter, setListFilter] = useState<"all" | "groups">("all");
  const [groupChats, setGroupChats] = useState<GroupChat[]>(() =>
    isDemoSession ? [DEMO_GROUP] : []);
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
  // v-redesign: visual-layer states — history skeleton + failed-send retry.
  const [historyLoading, setHistoryLoading] = useState(false);
  const [failedDraft, setFailedDraft] = useState<{ text: string; chatId: string } | null>(null);

  // ── Refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
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

  // ── Measured shell top → --mq-msgr-top (v14 P0) ──
  // messenger.css sizes the shell as 100dvh − measured top − player zone.
  // The top offset is real geometry (nav + banners + paddings above the
  // shell), re-measured on viewport resizes and body layout changes
  // (banner mount/unmount) — no magic constants.
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const top = Math.round(el.getBoundingClientRect().top);
      if (top > 0) el.style.setProperty("--mq-msgr-top", `${top}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [compactMode]);

  // ── Demo: auto-open the seeded thread so the chat panel shows bubbles ──
  // (acceptance: 1 open thread with messages on first entry).
  // Run-guard: fires ONCE per mount — a reactive dep-only effect would
  // re-select the thread every time the user taps «Назад» on mobile,
  // making the list unreachable in demo mode.
  const demoAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!isDemoSession || demoAutoOpenedRef.current) return;
    demoAutoOpenedRef.current = true;
    if (!selectedContactId && !selectedGroupId) {
      setSelectedContact(DEMO_DEFAULT_CHAT_ID);
    }
  }, [isDemoSession, selectedContactId, selectedGroupId, setSelectedContact]);

  // ── v72 iOS keyboard: visualViewport compensation ──
  // Android is covered by viewport.interactiveWidget=resizes-content
  // (layout.tsx). iOS Safari never resizes the layout viewport — fixed
  // composers sit BEHIND the keyboard. Track the visual viewport and
  // expose the keyboard height as a CSS var the composer consumes
  // (padding-bottom), so it rides just above the keys.
  useEffect(() => {
    const root = document.documentElement;
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--mq-kb-offset", kb > 24 ? `${Math.round(kb)}px` : "0px");
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.setProperty("--mq-kb-offset", "0px");
    };
  }, []);

  // ── Mobile view sync ──
  useEffect(() => { setMobileView(activeChatId ? "chat" : "list"); }, [activeChatId]);

  // ── Fetch friends (with auto-retry) ──
  const fetchFriends = useCallback(async (retryCount = 0) => {
    // Phase 2C: gated — demo sessions use local friends, no 401 + retry.
    if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return;
    if (!userId) return;
    setIsLoadingFriends(true);
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (res.status === 401) {
        // Auth loss: no auto-retry (that would be the 401→retry→401 loop).
        controlled401Recovery("messenger/friends");
        return;
      }
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      setFriends(Array.isArray(data.friends) ? data.friends : []);
      setLoadError(false);
    } catch {
      // Auto-retry once after 2s delay (handles transient Turso connection issues)
      if (retryCount < 2) {
        setTimeout(() => fetchFriends(retryCount + 1), 2000);
        return;
      }
      setLoadError(true);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [userId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Fetch group chats ──
  const fetchGroupChats = useCallback(async () => {
    // Phase 2C: gated — demo sessions have no server-side group chats.
    if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return;
    if (!userId) return;
    try {
      const res = await fetch(`/api/group-chats?userId=${userId}`);
      if (res.status === 401) { controlled401Recovery("group-chats"); return; }
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.groupChats) ? data.groupChats : Array.isArray(data) ? data : [];
      const normalized: GroupChat[] = list.map((g: any) => ({
        id: g.id, name: g.name || "Group", avatar: g.avatar,
        // List API has no members array — but it has the true DB count.
        members: Array.isArray(g.members) ? g.members : [],
        memberCount: Number(g.memberCount ?? (Array.isArray(g.members) ? g.members.length : 0)),
        createdBy: g.createdBy,
        createdAt: g.createdAt || new Date().toISOString(),
      }));
      setGroupChats(normalized);
    } catch {}
  }, [userId]);

  useEffect(() => { fetchGroupChats(); }, [fetchGroupChats]);

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
        const members: GroupMember[] = Array.isArray(g.members) ? g.members.map((m: any) => ({
          id: String(m.userId ?? m.id ?? ""),
          userId: String(m.userId ?? m.id ?? ""),
          username: String(m.user?.username ?? m.username ?? "Участник"),
          avatar: m.user?.avatar ?? m.avatar,
          role: String(m.role ?? "member"),
        })) : [];
        if (cancelled) return;
        setGroupChats((prev) => (Array.isArray(prev) ? prev.map((gc) =>
          gc.id === selectedGroupId ? { ...gc, members, memberCount: members.length, createdBy: g.createdBy ?? gc.createdBy } : gc
        ) : prev));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedGroupId, userId]);

  // ── Fetch online statuses (poll every 30s) ──
  useEffect(() => {
    if (!userId || safeFriends.length === 0) return;
    // Phase 2C: gated — demo/unauthenticated sessions never poll.
    const gate = () => canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated);
    if (!gate()) return;
    let cancelled = false;
    const fetchStatuses = async () => {
      if (!gate()) return;
      const statuses: Record<string, OnlineStatus> = {};
      await Promise.all(safeFriends.map(async (f) => {
        try {
          const res = await fetch(`/api/user/${f.id}/status`);
          if (res.status === 401) {
            controlled401Recovery("user/status");
            return;
          }
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
    const interval = setInterval(() => {
      if (!gate()) { clearInterval(interval); return; }
      fetchStatuses();
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, safeFriends]);

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
  // Demo sessions read from the in-memory threads (never the store/SSE).
  const conversationMessages = useMemo<ChatMessage[]>(() => {
    if (isDemoSession) {
      const list = isGroupChat
        ? demoThreads[selectedGroupId || ""]
        : demoThreads[selectedContactId || ""];
      return Array.isArray(list) ? list : [];
    }
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
  }, [isDemoSession, demoThreads, safeMessages, groupMessages, userId, selectedContactId, selectedGroupId, isGroupChat]);

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
    // Demo: previews from the in-memory threads; real: from the store log.
    const source: ChatMessage[] = isDemoSession
      ? Object.values(demoThreads).flat()
      : safeMessages;
    for (const m of source) {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!otherId) continue;
      const existing = map[otherId];
      if (!existing || new Date(m.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map[otherId] = m;
      }
    }
    return map;
  }, [isDemoSession, demoThreads, safeMessages, userId]);

  // ── Stories row contacts (reference): friends, online first, capped to
  // the visible track width. Empty for friendless sessions (row hidden).
  const storyContacts = useMemo<FriendUser[]>(() => {
    const list = [...safeFriends];
    list.sort((a, b) => {
      const aOn = onlineStatuses[a.id]?.online ? 0 : 1;
      const bOn = onlineStatuses[b.id]?.online ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      const aLast = lastMessageByContact[a.id]?.createdAt;
      const bLast = lastMessageByContact[b.id]?.createdAt;
      return (bLast ? new Date(bLast).getTime() : 0) - (aLast ? new Date(aLast).getTime() : 0);
    });
    return list.slice(0, 12);
  }, [safeFriends, onlineStatuses, lastMessageByContact]);

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
    const byQuery = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
    const bySection = listFilter === "groups" ? byQuery.filter((it) => it.type === "group") : byQuery;
    return bySection.sort((a, b) => {
      const aP = pinnedChats.includes(a.id) ? 1 : 0;
      const bP = pinnedChats.includes(b.id) ? 1 : 0;
      if (aP !== bP) return bP - aP;
      return b.lastTime - a.lastTime;
    });
  }, [safeFriends, safeGroupChats, groupMessages, lastMessageByContact, searchQuery, pinnedChats, listFilter]);

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
      if (isDemoSession) {
        setDemoThreads((prev) => {
          const next: Record<string, ChatMessage[]> = {};
          for (const [k, list] of Object.entries(prev)) {
            next[k] = list.filter((m) => m.id !== msgId);
          }
          return next;
        });
        toast({ title: "Сообщение удалено" });
        setContextMenu(null);
        return;
      }
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
  // v-redesign: accepts an optional text override so the failed-send
  // bubble can retry a draft without touching the composer state. Call
  // sites without arguments keep the exact previous behavior.
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
  }, [isDemoSession, inputText, userId, activeChatId, isGroupChat, isSending, addMessage, username, toast]);

  // ── Retry a failed send (re-runs the exact same pipeline) ──
  const retryFailedSend = useCallback(() => {
    if (!failedDraft) return;
    const draft = failedDraft;
    setFailedDraft(null);
    handleSend(draft.text);
  }, [failedDraft, handleSend]);

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
    if (!showNewChat && !showNewGroup && !showAddMembers) return;
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
  }, [showNewChat, showNewGroup, showAddMembers, newChatSearch, userId]);

  // ── Start new chat ──
  // FIX (Task 9): the POST /api/friends route reads `addresseeId` from the
  // body (requester comes from the session cookie) — the old `friendId` field
  // silently 400'd, so "new chat" opened a chat without creating a real
  // friendship. Real body field now.
  const handleStartChat = useCallback((user: any) => {
    if (!user?.id) return;
    fetch("/api/friends", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: user.id }),
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
  // Phase O §13: creating a group requires ONLY a name — participants are
  // optional and can be added later. The backend (POST /api/group-chats)
  // accepts an empty memberIds list and stores the creator as the owner
  // (role 'admin') — no fake members, real DB persistence.
  // Demo sessions send x-demo-user-* headers → the API's demo path returns
  // a mock group (creator = admin) so the flow works in demo mode too.
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || !userId) return;
    const demo = isDemoUser(userId);
    try {
      const res = await fetch("/api/group-chats", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          // ASCII-only header values (fetch rejects non-ISO-8859-1); the
          // server defaults x-demo-user-name to «Демо» when absent.
          ...(demo ? { "x-demo-user-id": userId } : {}),
        },
        body: JSON.stringify({
          name: groupName.trim(), creatorId: userId,
          memberIds: [...selectedMembers, userId],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw: any = data.groupChat || data;
        // POST returns members as {id, userId, role, user:{username, avatar}} —
        // normalize to the same shape as the detail endpoint (id = userId).
        const members: GroupMember[] = Array.isArray(raw.members) ? raw.members.map((m: any) => ({
          id: String(m.userId ?? m.id ?? ""),
          userId: String(m.userId ?? m.id ?? ""),
          username: String(m.user?.username ?? m.username ?? "Участник"),
          avatar: m.user?.avatar ?? m.avatar,
          role: String(m.role ?? "member"),
        })) : [];
        const newGroup: GroupChat = {
          id: raw.id, name: raw.name || groupName.trim(), avatar: raw.avatar,
          members, memberCount: members.length, createdBy: raw.createdBy ?? userId,
          createdAt: raw.createdAt || new Date().toISOString(),
        };
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

  // ── Add members to an EXISTING group (§13 empty-group flow) ──
  // POST /api/group-chats/[id]/members — server enforces admin-only (403
  // otherwise), so a non-owner cannot add members.
  const handleAddMembers = useCallback(async () => {
    if (!selectedGroupId || addMembersTarget.length === 0 || !userId) return;
    try {
      let ok = 0;
      for (const memberId of addMembersTarget) {
        const res = await fetch(`/api/group-chats/${selectedGroupId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: memberId }),
        });
        if (res.ok) ok++;
      }
      if (ok > 0) {
        // Refresh the group list so memberCount/members reflect the DB.
        await fetchGroupChats();
        toast({ title: ok === addMembersTarget.length ? "Участники добавлены" : `Добавлено: ${ok}` });
      } else {
        toast({ title: "Не удалось добавить участников" });
      }
    } catch { toast({ title: "Не удалось добавить участников" }); }
    finally {
      setShowAddMembers(false);
      setAddMembersTarget([]);
      setNewChatSearch("");
      setNewChatUsers([]);
    }
  }, [selectedGroupId, addMembersTarget, userId, fetchGroupChats, toast]);

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
      <div className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container-wide)] mx-auto mqms-shell`}>
        <div className="flex flex-col items-center justify-center h-full rounded-[var(--mq-mat-radius-lg)] gap-1"
          style={{ backgroundColor: "var(--mq-mat-2-bg)", border: "1px solid var(--mq-mat-2-edge)", boxShadow: "var(--mq-mat-3-shadow)" }}>
          <div className="mqms-empty-icon mb-2" aria-hidden="true">
            <MessageCircle className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
            Не удалось загрузить чаты
          </p>
          <p className="text-xs mb-5 max-w-[260px] text-center" style={{ color: "var(--mq-text-muted)" }}>
            Проверьте подключение и попробуйте снова
          </p>
          <motion.button
            onClick={() => { setLoadError(false); fetchFriends(); fetchGroupChats(); }}
            className="mq-btn-neutral flex items-center gap-2 px-5 h-11 rounded-full text-xs font-semibold">
            Повторить
          </motion.button>
        </div>
      </div>
    );
  }

  const cardStyle = {
    backgroundColor: "var(--mq-mat-2-bg)" as const,
    border: "1px solid var(--mq-mat-2-edge)" as const,
    boxShadow: "var(--mq-mat-3-shadow)" as const,
  };
  const hairlineBorder = { borderColor: "var(--mq-border-hairline)" as const };

  return (
    <div ref={shellRef} className={`${compactMode ? "p-2 lg:p-3" : "p-3 lg:p-4"} max-w-[var(--mq-container-wide)] mx-auto mqms-shell`}>
      <div className="flex h-full min-w-0 gap-2 lg:gap-3">
      {/* ── LEFT ICON RAIL (reference, desktop ≥lg) — vertical glass capsule
          with the messenger's section anchors. Active section highlighted;
          every button is a REAL action (filter / view switch), no dead icons.
          Mobile skips the rail (the list header already has the actions). ── */}
      <nav className="mqms-rail hidden lg:flex" aria-label="Разделы мессенджера">
        <button
          onClick={() => setListFilter("all")}
          data-active={listFilter === "all"}
          className="mqms-rail-btn"
          aria-label="Чаты"
          title="Чаты"
          aria-current={listFilter === "all" ? "true" : undefined}
        >
          <MessageCircle className="w-[19px] h-[19px]" aria-hidden="true" />
        </button>
        <button
          onClick={() => { setListFilter("groups"); if (safeGroupChats.length === 0 && !isDemoSession) setShowNewGroup(true); }}
          data-active={listFilter === "groups"}
          className="mqms-rail-btn"
          aria-label="Группы"
          title="Группы"
          aria-current={listFilter === "groups" ? "true" : undefined}
        >
          <Users className="w-[19px] h-[19px]" aria-hidden="true" />
        </button>
        <button
          onClick={() => setView("friends")}
          data-active={currentView === "friends"}
          className="mqms-rail-btn"
          aria-label="Друзья"
          title="Друзья"
        >
          <Contact className="w-[19px] h-[19px]" aria-hidden="true" />
        </button>
        <span className="flex-1" aria-hidden="true" />
        <button
          onClick={() => setView("settings")}
          className="mqms-rail-btn"
          aria-label="Настройки"
          title="Настройки"
        >
          <Settings className="w-[19px] h-[19px]" aria-hidden="true" />
        </button>
      </nav>
      <div className="flex rounded-[var(--mq-mat-radius-lg)] overflow-hidden h-full flex-1 min-w-0 mqms-window" style={cardStyle}>
        {/* ── Contacts list ── */}
        {showListPanel && (
          <div className={`${isMobileView && mobileView === "chat" ? "hidden" : "flex"} flex-col w-full lg:w-[340px] flex-shrink-0 border-r`}
            style={hairlineBorder}>
            {/* Profile row (reference: account header) — avatar + name +
                chevron opens the user's own profile. Mobile keeps the
                section actions inline (no room for nav rows below). */}
            <div className="px-3.5 sm:px-4 pt-3 pb-2.5 flex items-center gap-2.5 border-b" style={hairlineBorder}>
              <button
                onClick={() => setView("profile")}
                className="flex items-center gap-2.5 min-w-0 flex-1 rounded-xl pl-1 pr-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--mq-text)_55%,transparent)]"
                aria-label="Открыть профиль"
                title="Профиль"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    style={{ boxShadow: "0 0 0 1px var(--mq-edge-strong)" }} />
                ) : (
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}>
                    <User className="w-4.5 h-4.5" style={{ color: "var(--mq-text-muted)" }} />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[15px] font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                    {username || "Профиль"}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                    Ваш профиль
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} aria-hidden="true" />
              </button>
              {/* Mobile: section actions live here (no nav rows below) */}
              <div className="flex items-center gap-1 flex-shrink-0 lg:hidden">
                <motion.button whileHover={hoverProps({ scale: 1.04, transition: { duration: 0.12, ease: "easeOut" } })}
                  onClick={() => setView("friends")}
                  className="mqms-icon-btn"
                  aria-label="Друзья" title="Друзья">
                  <Contact className="w-[18px] h-[18px]" />
                </motion.button>
                <motion.button whileHover={hoverProps({ scale: 1.04, transition: { duration: 0.12, ease: "easeOut" } })}
                  onClick={() => {
                    if (isDemoSession) {
                      toast({ title: "Создание групп доступно после регистрации", duration: 2500 });
                      return;
                    }
                    setShowNewGroup(true);
                  }}
                  className="mqms-icon-btn"
                  aria-label="Новая группа" title="Новая группа">
                  <Users className="w-[18px] h-[18px]" />
                </motion.button>
              </div>
              {/* Compose (new chat) — the reference's square-pencil action.
                  Demo sessions can't create chats (no social graph) — the
                  button explains instead of opening a dead dialog. */}
              <motion.button whileHover={hoverProps({ scale: 1.04, transition: { duration: 0.12, ease: "easeOut" } })}
                onClick={() => {
                  if (isDemoSession) {
                    toast({ title: "Создание чатов доступно после регистрации", duration: 2500 });
                    return;
                  }
                  setShowNewChat(true);
                }}
                className="mq-platinum-btn w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                aria-label="Новый чат" title="Новый чат">
                <SquarePen className="w-[18px] h-[18px]" />
              </motion.button>
            </div>

            {/* Section nav (reference: Chats / groups / friends rows) —
                desktop only; real actions: filters + FriendsView. */}
            <nav className="hidden lg:flex flex-col px-2 py-2 gap-0.5 border-b" style={hairlineBorder} aria-label="Разделы чатов">
              <button
                onClick={() => setListFilter("all")}
                data-active={listFilter === "all"}
                className="mqms-nav-row"
                aria-current={listFilter === "all" ? "true" : undefined}
              >
                <MessagesSquare className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="flex-1 text-left">Чаты</span>
                {safeFriends.length + safeGroupChats.length > 0 && (
                  <span className="mqms-nav-count tabular-nums">
                    {safeFriends.length + safeGroupChats.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setListFilter("groups"); if (safeGroupChats.length === 0) setShowNewGroup(true); }}
                data-active={listFilter === "groups"}
                className="mqms-nav-row"
                aria-current={listFilter === "groups" ? "true" : undefined}
              >
                <Users className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="flex-1 text-left">Группы</span>
                <span className="mqms-nav-count tabular-nums">{safeGroupChats.length}</span>
                <Plus className="w-3.5 h-3.5 mqms-nav-add" aria-hidden="true" />
              </button>
              <button
                onClick={() => setView("friends")}
                className="mqms-nav-row"
              >
                <Contact className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="flex-1 text-left">Друзья</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" style={{ color: "var(--mq-text-muted)" }} />
              </button>
            </nav>

            {/* Search */}
            <div className="px-3.5 pt-3 pb-2.5 border-b" style={hairlineBorder}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--mq-text-muted)" }} />
                <input type="text" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск чатов"
                  aria-label="Поиск чатов"
                  className="mqms-input-pill h-11 pl-10 pr-4 text-sm outline-none" />
              </div>
            </div>

            {/* Stories — horizontal round avatars (reference row).
                Real sessions: friends, online first. Demo: the seeded cast.
                Click = open that DM. Online contacts wear the platinum ring. */}
            {storyContacts.length > 0 && (
              <div className="mqms-stories border-b" style={hairlineBorder}>
                <div className="mqms-stories-track" role="list" aria-label="Быстрый доступ к чатам">
                  {storyContacts.map((f) => {
                    const online = onlineStatuses[f.id]?.online;
                    const isActive = selectedContactId === f.id && !isGroupChat;
                    return (
                      <button
                        key={f.id}
                        role="listitem"
                        onClick={() => { setSelectedContact(f.id); setSelectedGroupId(null); }}
                        data-online={online ? "true" : undefined}
                        data-active={isActive ? "true" : undefined}
                        className="mqms-story"
                        aria-label={`Открыть чат с ${f.username}${online ? " (в сети)" : ""}`}
                        title={f.username}
                      >
                        <Avatar src={f.avatar} name={f.username} id={f.id} size={48} ring={online} />
                        <span className="mqms-story-name">{f.username}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Demo badge — honest labeling of the seeded data (nothing
                persists; messages stay in memory for this session only). */}
            {isDemoSession && (
              <div className="flex items-center gap-1.5 px-4 pt-2.5" aria-label="Демо-режим">
                <span className="mqms-demo-chip">Демо</span>
                <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
                  Диалоги не сохраняются — только для обзора интерфейса
                </span>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-2"
              onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              {isRefreshing && (
                <div className="flex items-center justify-center gap-2 py-2.5" role="status">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                  <span className="mq-t-meta-2">Обновление…</span>
                </div>
              )}
              {isLoadingFriends && safeFriends.length === 0 && safeGroupChats.length === 0 ? (
                <div className="flex flex-col gap-4 px-2 pt-2" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-2">
                      <div className="mqms-skel w-12 h-12 rounded-full flex-shrink-0"
                        style={{ animationDelay: `${i * 0.1}s` }} />
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="mqms-skel h-3 rounded-full"
                          style={{ width: `${52 - i * 6}%`, animationDelay: `${i * 0.1 + 0.05}s` }} />
                        <div className="mqms-skel h-2.5 rounded-full"
                          style={{ width: `${70 - i * 8}%`, animationDelay: `${i * 0.1 + 0.1}s` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : sortedChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center mq-empty-anim">
                  <div className="mqms-empty-icon mb-3" aria-hidden="true">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                    {/* UX Core #1 (Эвристика доступности): без императива,
                        позитивная формулировка снижает барьер. */}
                    {searchQuery.trim() ? "Ничего не найдено" : "Пока пусто"}
                  </p>
                  {/* P1: honest demo answer — in demo mode there is no social
                      graph at all, so instead of a dead-end «найдите друзей»
                      loop we say exactly what's going on. */}
                  {isDemoSession ? (
                    <p className="text-xs leading-relaxed max-w-[280px]" style={{ color: "var(--mq-text-muted)" }}>
                      В демо-режиме чаты недоступны — здесь нет собеседников.
                      Создайте аккаунт, чтобы переписываться и слушать музыку вместе
                    </p>
                  ) : (
                    <p className="text-xs mb-5 max-w-[280px]" style={{ color: "var(--mq-text-muted)" }}>
                      {searchQuery.trim() ? "Попробуйте другой запрос" : "Найдите друзей — и здесь появятся чаты"}
                    </p>
                  )}
                  {!searchQuery.trim() && !isDemoSession && (
                    <motion.button whileHover={hoverProps({ scale: 1.02, transition: { duration: 0.12, ease: "easeOut" } })}
                      onClick={() => setShowNewChat(true)}
                      className="mq-btn-neutral flex items-center gap-1.5 px-5 h-11 rounded-full text-xs font-semibold">
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
                      lastText = "Голосовое сообщение";
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
                  const PreviewIcon = previewIconFor(last);
                  return (
                    <motion.button key={`${item.type}_${item.id}`}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.025, 0.3), duration: 0.2 }}
                      /* §HOVER: own tap transition — entrance delay never leaks. */

                      onClick={() => {
                        if (item.type === "group") {
                          setSelectedGroupId(item.id); setSelectedContact(null);
                        } else {
                          setSelectedContact(item.id); setSelectedGroupId(null);
                        }
                      }}
                      onContextMenu={(e) => { e.preventDefault(); togglePinChat(item.id); }}
                      data-active={isActive}
                      aria-current={isActive ? "true" : undefined}
                      className="mqms-row">
                      <div className="relative flex-shrink-0">
                        <Avatar src={item.avatar} name={item.name} id={item.id} size={48}
                          isGroup={item.type === "group"} />
                        {isOnline && <span className="mqms-online" aria-hidden="true" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[15px] font-semibold truncate flex items-center gap-1.5"
                            style={{ color: "var(--mq-text)", lineHeight: 1.25 }}>
                            {isPinned && (
                              <Pin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}
                                fill="currentColor" aria-hidden="true" />
                            )}
                            {item.name}
                          </p>
                          {last && (
                            <span className="mq-t-meta flex-shrink-0 tabular-nums"
                              style={{ color: "var(--mq-text-muted)" }}>
                              {formatTime(last.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-[13px] truncate flex items-center gap-1.5"
                            style={{ color: "var(--mq-text-muted)", lineHeight: 1.3 }}>
                            {PreviewIcon && <PreviewIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
                            {lastText}
                          </p>
                          {unread > 0 && (
                            <span className="mqms-badge flex-shrink-0" aria-label={`${unread} непрочитанных`}>
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
            {/* Header — 80px tall (reference): avatar 56 + name 18px + status */}
            <div className="px-3 sm:px-4 py-3 min-h-[80px] flex items-center gap-2.5 sm:gap-3 border-b" style={hairlineBorder}>
              {isMobileView && (
                <motion.button onClick={handleMobileBack}
                  className="mqms-icon-btn" aria-label="Назад к списку чатов" title="Назад">
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
              )}
              <div
                className="relative flex-shrink-0 cursor-pointer"
                onClick={() => {
                  if (!isGroupChat && selectedFriend) {
                    setShowProfile(selectedFriend.id);
                  }
                }}
              >
                {isGroupChat ? (
                  <Avatar name={selectedGroup?.name || "Group"} id={selectedGroupId || ""} size={56} isGroup ring />
                ) : (
                  <Avatar src={selectedFriend?.avatar} name={selectedFriend?.username || "User"}
                    id={selectedFriend?.id || ""} size={56} ring />
                )}
                {!isGroupChat && selectedFriend && onlineStatuses[selectedFriend.id]?.online && (
                  <span className="mqms-online" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold truncate" style={{ color: "var(--mq-text)", lineHeight: 1.25 }}>
                  {isGroupChat ? selectedGroup?.name : selectedFriend?.username}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                  {showTyping && !isGroupChat ? (
                    <span className="flex items-center gap-1.5" style={{ color: "var(--mq-text)" }}>
                      <span className="mq-typing-dot" aria-hidden="true" />
                      печатает…
                    </span>
                  ) : isGroupChat ? (
                    (selectedGroup && Array.isArray(selectedGroup.members)
                      ? selectedGroup.members.filter((m) => m.id !== userId).length : 0) > 0
                      ? `${selectedGroup && Array.isArray(selectedGroup.members) ? selectedGroup.members.filter((m) => m.id !== userId).length : 0} участников`
                      : "Участников пока нет"
                  ) : onlineStatuses[selectedFriend?.id || ""]?.online ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#30d158" }} aria-hidden="true" />
                      в сети
                    </span>
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
                      style={{ borderColor: "var(--mq-mat-2-bg)" }}>
                      <Avatar src={m.avatar} name={m.username} id={m.id || `m${idx}`} size={24} />
                    </div>
                  ))}
                </div>
              )}
              {/* In-chat search toggle button */}
              <motion.button

                onClick={() => {
                  setShowInChatSearch(!showInChatSearch);
                  if (showInChatSearch) setInChatSearch("");
                }}
                data-on={showInChatSearch}
                className="mqms-icon-btn"
                aria-label="Поиск по чату"
                title="Поиск по сообщениям"
              >
                <Search className="w-[18px] h-[18px]" />
              </motion.button>
              {/* Profile / chat menu (DMs open the profile modal) */}
              {!isGroupChat && selectedFriend && (
                <motion.button
                  onClick={() => setShowProfile(selectedFriend.id)}
                  className="mqms-icon-btn"
                  aria-label="Профиль собеседника"
                  title="Профиль"
                >
                  <User className="w-[18px] h-[18px]" />
                </motion.button>
              )}
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
                  <div className="px-3.5 sm:px-5 pt-2.5 pb-3 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--mq-text-muted)" }} />
                      <input
                        type="text"
                        value={inChatSearch}
                        onChange={(e) => setInChatSearch(e.target.value)}
                        placeholder="Поиск в чате…"
                        autoFocus
                        aria-label="Поиск в чате"
                        className="mqms-input-pill h-11 pl-10 pr-11 text-sm outline-none"
                      />
                      {inChatSearch && (
                        <button
                          onClick={() => setInChatSearch("")}
                          className="mqms-inline-x absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                          aria-label="Очистить поиск"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {inChatSearch.trim() && (
                      <p className="mq-t-meta-2 mt-2 tabular-nums" style={{ color: "var(--mq-text-muted)" }} role="status">
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
                  className="px-4 py-2 border-b flex items-center gap-2.5 overflow-hidden"
                  style={{
                    borderColor: "var(--mq-border-hairline)",
                    backgroundColor: "color-mix(in srgb, var(--mq-text) 4%, transparent)",
                  }}>
                  <Pin className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "var(--mq-platinum-hi)" }} fill="currentColor" aria-hidden="true" />
                  <span className="w-px h-4 flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 12%, transparent)" }} aria-hidden="true" />
                  <p className="text-xs truncate flex-1" style={{ color: "var(--mq-text-muted)" }}>
                    {pinnedMessage.messageType === "voice"
                      ? "Голосовое сообщение"
                      : decrypt(pinnedMessage.content).slice(0, 80)}
                  </p>
                  <button onClick={() => togglePinMessage(pinnedMessage.id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors mqms-inline-x"
                    aria-label="Открепить сообщение">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages — live log of the conversation */}
            <div ref={scrollRef} role="log" aria-live="polite" aria-label="Лента сообщений"
              className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4">
              {historyLoading && conversationMessages.length === 0 ? (
                <HistorySkeleton />
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center mq-empty-anim">
                  {isGroupChat && (selectedGroup?.members?.length ?? 0) <= 1 ? (
                    <>
                      <div className="mqms-empty-icon mb-3" aria-hidden="true">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                        Группа создана
                      </p>
                      <p className="text-xs mb-5 max-w-[260px]" style={{ color: "var(--mq-text-muted)" }}>
                        Участников пока нет
                      </p>
                      <button
                        onClick={() => { setShowAddMembers(true); setNewChatSearch(""); }}
                        className="mq-btn-neutral px-5 h-11 rounded-full text-xs font-semibold">
                        Добавить участников
                      </button>
                    </>
                  ) : (
                    <>
                      {inChatSearch.trim() ? (
                        <>
                          <div className="mqms-empty-icon mb-3" aria-hidden="true">
                            <Search className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                            Ничего не найдено
                          </p>
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                            Попробуйте другой запрос
                          </p>
                        </>
                      ) : isGroupChat ? (
                        <>
                          <div className="mqms-empty-icon mb-3" aria-hidden="true">
                            <Users className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                            Пока тишина
                          </p>
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                            {/* UX Core #1: позитивная формулировка вместо императива */}
                            Напишите первое сообщение — разговор начнётся здесь
                          </p>
                        </>
                      ) : (
                        <>
                          {/* Premium empty chat: big avatar + name + invitation */}
                          <div className="relative mb-4">
                            <Avatar src={selectedFriend?.avatar} name={selectedFriend?.username || "User"}
                              id={selectedFriend?.id || ""} size={72} ring />
                            {onlineStatuses[selectedFriend?.id || ""]?.online && (
                              <span className="mqms-online" aria-hidden="true" />
                            )}
                          </div>
                          <p className="text-lg font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                            {selectedFriend?.username}
                          </p>
                          <p className="text-xs max-w-[240px]" style={{ color: "var(--mq-text-muted)" }}>
                            {/* UX Core #1: позитивная формулировка вместо императива */}
                            Напишите первое сообщение
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                filteredMessages.map((msg, i) => {
                  const isMine = msg.senderId === userId;
                  const prev = filteredMessages[i - 1];
                  const next = filteredMessages[i + 1];
                  const showDateSep = !prev || !sameDay(prev.createdAt, msg.createdAt);
                  const prevSameSender = prev && prev.senderId === msg.senderId && !showDateSep;
                  const isLastOfGroup = !next || next.senderId !== msg.senderId ||
                    !sameDay(next.createdAt, msg.createdAt);
                  const voiceData = parseVoice(msg.content);
                  const text = voiceData ? "" : decrypt(msg.content);
                  const isTemp = String(msg.id).startsWith("temp_");
                  return (
                    <div key={msg.id}>
                      {showDateSep && <DateSeparator label={getDateLabel(msg.createdAt)} />}
                      <motion.div
                        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"} ${prevSameSender ? "mt-[3px]" : "mt-2.5"}`}>
                        {!isMine && (
                          <div className="w-7 h-7 flex-shrink-0">
                            {!prevSameSender && (
                              isGroupChat ? (
                                <div className="w-7 h-7 rounded-full flex items-center justify-center mq-t-meta-2 font-bold"
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
                        <div className="relative group max-w-[86%] sm:max-w-[78%] lg:max-w-[70%]">
                          {isGroupChat && !isMine && !prevSameSender && (
                            <p className="mq-t-meta-2 mb-1 ml-2 font-semibold"
                              style={{ color: colorForId(msg.senderId) }}>
                              {msg.senderName?.replace("@", "") || "User"}
                            </p>
                          )}
                          <div
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY });
                            }}
                            className={`mqms-bubble cursor-default ${isMine ? "mqms-bubble-out" : "mqms-bubble-in"} ${
                              isLastOfGroup ? "mqms-tail" : ""
                            } ${isTemp ? "mqms-pending" : ""}`}>
                            {voiceData ? (
                              <VoiceMessageBubble voiceUrl={voiceData.voiceUrl}
                                duration={voiceData.voiceDuration || 0} isMine={isMine} />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
                            )}
                            <div className="mqms-meta">
                              <span className="tabular-nums">{formatTime(msg.createdAt)}</span>
                              {isMine && (isTemp ? (
                                <Clock className="w-3.5 h-3.5" aria-label="Отправляется" />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5" aria-label="Доставлено" />
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })
              )}
              {/* Failed send — error bubble with retry (draft kept locally) */}
              {failedDraft && failedDraft.chatId === activeChatId && !inChatSearch.trim() && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }} className="flex items-end justify-end gap-2 mt-2.5">
                  <div className="mqms-bubble mqms-bubble-out mqms-failed max-w-[86%] sm:max-w-[78%] lg:max-w-[70%]"
                    role="alert">
                    <p className="text-sm whitespace-pre-wrap break-words">{failedDraft.text}</p>
                    <div className="flex items-center justify-between gap-3 mt-1.5 -mb-0.5">
                      <span className="flex items-center gap-1.5 mq-t-meta-2"
                        style={{ color: "rgba(244,246,250,0.72)" }}>
                        <AlertCircle className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} aria-hidden="true" />
                        Не отправлено
                      </span>
                      <span className="flex items-center gap-1">
                        <button onClick={retryFailedSend} className="mqms-retry-btn">Повторить</button>
                        <button onClick={() => setFailedDraft(null)}
                          className="mqms-inline-x w-9 h-9 rounded-full flex items-center justify-center"
                          aria-label="Скрыть ошибку">
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
              {showTyping && !isGroupChat && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-end gap-2 justify-start mt-2.5">
                  <div className="w-7 h-7 flex-shrink-0">
                    <Avatar src={selectedFriend?.avatar} name={selectedFriend?.username || "U"}
                      id={selectedFriend?.id || ""} size={28} />
                  </div>
                  {/* v68: premium typing indicator — pure CSS dots (mq-typing-dot),
                      no per-frame JS; dots breathe with a staggered lift */}
                  <div className="mqms-bubble mqms-bubble-in mqms-tail px-4 py-3.5 flex items-center gap-1.5"
                    aria-label="Собеседник печатает…">
                    <span className="mq-typing-dot" />
                    <span className="mq-typing-dot" />
                    <span className="mq-typing-dot" />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input (composer) — pill textarea + 44px controls + safe areas */}
            <div className="mqms-composer border-t" style={hairlineBorder}>
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-3 px-4 h-12 rounded-full"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 28%, transparent)" }}>
                    <motion.span animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} />
                    <span className="text-sm font-medium tabular-nums" style={{ color: "var(--mq-text)" }}>
                      Запись… {formatDuration(recordingDuration)}
                    </span>
                  </div>
                  <motion.button onClick={stopRecording}
                    className="mqms-icon-btn mqms-send" data-ready="true"
                    aria-label="Отправить голосовое">
                    <Send className="w-[18px] h-[18px]" />
                  </motion.button>
                  <motion.button onClick={cancelRecording}
                    className="mqms-icon-btn"
                    style={{ color: "var(--mq-accent)", background: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
                    aria-label="Отменить запись">
                    <X className="w-[18px] h-[18px]" />
                  </motion.button>
                </div>
              ) : (
                <div className="flex flex-col gap-2" style={{ paddingBottom: "var(--mq-kb-offset, 0px)" }}>
                  {showQuickEmojis && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                      className="flex gap-1.5 flex-wrap px-1">
                      {QUICK_EMOJIS.map((emoji) => (
                        <motion.button key={emoji} whileHover={hoverProps({ scale: 1.15, transition: { duration: 0.12, ease: "easeOut" } })}
                          onClick={() => {
                            setInputText((p) => p + emoji);
                            setShowQuickEmojis(false);
                            inputRef.current?.focus();
                          }}
                          className="text-xl w-11 h-11 flex items-center justify-center rounded-xl transition-colors"
                          style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)" }}
                          aria-label={`Вставить ${emoji}`}>
                          {emoji}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                  {/* Reference composer: ONE pill containing every control —
                      emoji + mic on the left, autogrowing textarea in the
                      middle, the accent send button docked right INSIDE the
                      pill (44px). */}
                  <div className="mqms-composer-pill" data-armed={!!(inputText.trim() && !isSending)}>
                    <motion.button whileHover={hoverProps({ scale: 1.05, transition: { duration: 0.12, ease: "easeOut" } })}
                      onClick={() => setShowQuickEmojis((v) => !v)}
                      data-on={showQuickEmojis}
                      className="mqms-composer-btn"
                      aria-label="Эмодзи" title="Эмодзи">
                      <Smile className="w-[18px] h-[18px]" />
                    </motion.button>
                    <motion.button whileHover={hoverProps({ scale: 1.05, transition: { duration: 0.12, ease: "easeOut" } })}
                      onClick={() => {
                        if (isDemoSession) {
                          toast({ title: "Голосовые сообщения доступны после регистрации", duration: 2500 });
                          return;
                        }
                        startRecording();
                      }}
                      className="mqms-composer-btn"
                      aria-label="Записать голосовое" title="Голосовое сообщение">
                      <Mic className="w-[18px] h-[18px]" />
                    </motion.button>
                    <textarea ref={inputRef} value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Сообщение…" rows={1} aria-label="Сообщение"
                      className="mqms-composer-input flex-1 min-w-0" />
                    <motion.button whileHover={hoverProps({ scale: 1.05, transition: { duration: 0.12, ease: "easeOut" } })}
                      onClick={() => handleSend()} disabled={!inputText.trim() || isSending}
                      data-ready={!!(inputText.trim() && !isSending)}
                      className="mqms-composer-send" aria-label="Отправить сообщение">
                      {isSending ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Send className="w-[18px] h-[18px]" />}
                    </motion.button>
                  </div>
                  <div className="flex items-center justify-center gap-1 mq-t-meta-2"
                    style={{ color: "var(--mq-text-muted)" }}>
                    <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                    <span>Сообщения защищены TLS-шифрованием</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : showChatPanel ? (
          <div className={`${isMobileView && mobileView === "list" ? "hidden" : "flex"} flex-1 flex-col items-center justify-center text-center p-8 mq-empty-anim`}>
            <div className="mqms-empty-icon mb-4" style={{ width: 64, height: 64 }} aria-hidden="true">
              <MessageCircle className="w-7 h-7" />
            </div>
            <p className="text-base font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
              Выберите чат
            </p>
            <p className="text-sm max-w-[260px]" style={{ color: "var(--mq-text-muted)" }}>
              Выберите собеседника слева, чтобы начать диалог
            </p>
          </div>
        ) : null}
      </div>
      </div>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Действия с сообщением"
            className="fixed z-50 min-w-[200px] rounded-[var(--mq-mat-radius)] overflow-hidden py-1.5"
            style={{
              left: Math.min(contextMenu.x,
                (typeof window !== "undefined" ? window.innerWidth : 9999) - 200),
              top: Math.min(contextMenu.y,
                (typeof window !== "undefined" ? window.innerHeight : 9999) - 240),
              ...cardStyle,
            }}>
            <button onClick={() => handleReplyMessage(contextMenu.id)} role="menuitem"
              className="mqms-ctx-item">
              <Reply className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> Ответить
            </button>
            <button onClick={() => handleCopyMessage(contextMenu.id)} role="menuitem"
              className="mqms-ctx-item">
              <Copy className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> Копировать
            </button>
            <button onClick={() => togglePinMessage(contextMenu.id)} role="menuitem"
              className="mqms-ctx-item">
              <Pin className="w-4 h-4 flex-shrink-0"
                style={{ color: pinnedMsgId === contextMenu.id ? "var(--mq-platinum-hi)" : "currentColor" }}
                fill={pinnedMsgId === contextMenu.id ? "currentColor" : "none"} aria-hidden="true" />
              {pinnedMsgId === contextMenu.id ? "Открепить" : "Закрепить"}
            </button>
            <button onClick={() => handleDeleteMessage(contextMenu.id)} role="menuitem"
              className="mqms-ctx-item" style={{ color: "var(--mq-accent)" }}>
              <Trash2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> Удалить
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New chat dialog ── */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "var(--mq-overlay-scrim)" }}
            onClick={() => setShowNewChat(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-[var(--mq-card-r-md)] overflow-hidden"
              style={cardStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Новый чат">
              <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новый чат</h3>
                <button onClick={() => setShowNewChat(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--mq-text-muted)" }} />
                  <input type="text" value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Поиск пользователей" autoFocus aria-label="Поиск пользователей"
                    className="mqms-input-pill h-11 pl-10 pr-4 text-sm outline-none" />
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
                        /* §HOVER one-owner: CSS owns background (class below), Framer owns
                           only the tap transform. */

                        onClick={() => handleStartChat(user)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_4%,transparent)]">
                        <Avatar src={user.avatar} name={user.username} id={user.id} size={44} />
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
            style={{ backgroundColor: "var(--mq-overlay-scrim)" }}
            onClick={() => setShowNewGroup(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-[var(--mq-card-r-md)] overflow-hidden"
              style={cardStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Новая группа">
              <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новая группа</h3>
                <button onClick={() => setShowNewGroup(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <input type="text" value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Название группы" autoFocus aria-label="Название группы"
                  className="mqms-input-pill h-11 px-4 text-sm outline-none" />
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--mq-text-muted)" }} />
                  <input type="text" value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Добавить участников (необязательно)"
                    aria-label="Поиск участников"
                    className="mqms-input-pill h-11 pl-10 pr-4 text-sm outline-none" />
                </div>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map((id) => {
                      const u = newChatUsers.find((u) => u.id === id);
                      if (!u) return null;
                      return (
                        <span key={id} className="flex items-center gap-1.5 pl-3 pr-1.5 h-8 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--mq-text) 9%, transparent)",
                            color: "var(--mq-text)",
                          }}>
                          {u.username}
                          <button onClick={() => setSelectedMembers((p) => p.filter((x) => x !== id))}
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            aria-label={`Убрать ${u.username}`}>
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
                        /* §HOVER one-owner: CSS owns background (class below), Framer owns
                           only the tap transform. */

                        onClick={() => setSelectedMembers((p) =>
                          selected ? p.filter((x) => x !== user.id) : [...p, user.id])}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_4%,transparent)]">
                        <Avatar src={user.avatar} name={user.username} id={user.id} size={40} />
                        <p className="flex-1 text-sm font-semibold truncate"
                          style={{ color: "var(--mq-text)" }}>
                          {user.username}
                        </p>
                        {selected && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                            aria-hidden="true"
                            style={{ backgroundColor: "var(--mq-platinum-lift)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}>
                            <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={handleCreateGroup}
                  disabled={!groupName.trim()}
                  className="mq-platinum-btn w-full h-11 rounded-xl text-sm font-semibold">
                  Создать группу
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add members dialog (existing group, §13) ── */}
      <AnimatePresence>
        {showAddMembers && selectedGroupId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "var(--mq-overlay-scrim)" }}
            onClick={() => setShowAddMembers(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-[var(--mq-card-r-md)] overflow-hidden"
              style={cardStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Добавить участников">
              <div className="p-4 flex items-center justify-between border-b" style={hairlineBorder}>
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>
                  Добавить участников
                </h3>
                <button onClick={() => setShowAddMembers(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--mq-text-muted)" }} />
                  <input type="text" value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    placeholder="Поиск пользователей" autoFocus aria-label="Поиск пользователей"
                    className="mqms-input-pill h-11 pl-10 pr-4 text-sm outline-none" />
                </div>
                {addMembersTarget.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {addMembersTarget.map((id) => {
                      const u = newChatUsers.find((u) => u.id === id);
                      if (!u) return null;
                      return (
                        <span key={id} className="flex items-center gap-1.5 pl-3 pr-1.5 h-8 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--mq-text) 9%, transparent)",
                            color: "var(--mq-text)",
                          }}>
                          {u.username}
                          <button onClick={() => setAddMembersTarget((p) => p.filter((x) => x !== id))}
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            aria-label={`Убрать ${u.username}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto">
                  {newChatUsers.length === 0 && newChatSearch.trim() === "" ? (
                    <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)" }}>
                      Начните вводить имя, чтобы найти пользователей
                    </p>
                  ) : newChatUsers.map((user) => {
                    const selected = addMembersTarget.includes(user.id);
                    const alreadyIn = selectedGroup?.members?.some((m) => m.id === user.id);
                    return (
                      <motion.button key={user.id}
                        /* §HOVER one-owner: CSS owns background (class below), Framer owns
                           only the tap transform. */

                        disabled={alreadyIn}
                        onClick={() => setAddMembersTarget((p) =>
                          selected ? p.filter((x) => x !== user.id) : [...p, user.id])}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_4%,transparent)]"
                        style={{ opacity: alreadyIn ? 0.45 : 1 }}>
                        <Avatar src={user.avatar} name={user.username} id={user.id} size={40} />
                        <p className="flex-1 text-sm font-semibold truncate"
                          style={{ color: "var(--mq-text)" }}>
                          {user.username}
                        </p>
                        {alreadyIn ? (
                          <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>уже в группе</span>
                        ) : selected && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                            aria-hidden="true"
                            style={{ backgroundColor: "var(--mq-platinum-lift)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}>
                            <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <button onClick={handleAddMembers}
                  disabled={addMembersTarget.length === 0}
                  className="mq-platinum-btn w-full h-11 rounded-xl text-sm font-semibold">
                  Добавить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── User Profile Modal ──
          Shows when clicking on a friend's avatar in chat header.
          Displays avatar, username, online status, and actions. */}
      <AnimatePresence>
        {showProfile && (() => {
          const friend = safeFriends.find(f => f.id === showProfile);
          if (!friend) return null;
          const status = onlineStatuses[friend.id];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
              onClick={() => setShowProfile(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                role="dialog"
                aria-label={`Профиль ${friend.username}`}
                className="rounded-[var(--mq-mat-radius-float)] overflow-hidden w-full max-w-sm"
                style={{
                  backgroundColor: "var(--mq-mat-2-bg)",
                  border: "1px solid var(--mq-mat-2-edge)",
                  boxShadow: "var(--mq-mat-3-shadow)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Cover gradient */}
                <div
                  className="h-24 relative"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, #2c3a67 60%, var(--mq-bg)), color-mix(in srgb, #10141f 40%, var(--mq-bg)))",
                  }}
                >
                  <button
                    onClick={() => setShowProfile(null)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "#fff" }}
                    aria-label="Закрыть профиль"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Avatar + name */}
                <div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center">
                  <div className="relative mb-3">
                    <Avatar src={friend.avatar} name={friend.username} id={friend.id} size={80} ring />
                    {status?.online && (
                      <span
                        className="mqms-online"
                        style={{ width: 16, height: 16, bottom: 2, right: 2 }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                    {friend.username}
                  </h3>
                  <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: "var(--mq-text-muted)" }}>
                    {status?.online ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#30d158" }} aria-hidden="true" />
                        в сети
                      </>
                    ) : formatLastSeen(status?.lastSeen ?? null)}
                  </p>

                  {/* Added date */}
                  {friend.addedAt && (
                    <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                      В друзьях с {new Date(friend.addedAt).toLocaleDateString("ru-RU")}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-5 w-full">
                    <motion.button

                      onClick={() => {
                        setShowProfile(null);
                      }}
                      className="mq-platinum-btn flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Написать
                    </motion.button>
                    <motion.button

                      onClick={() => {
                        setSelectedContact(friend.id);
                        setShowProfile(null);
                        if (isMobileView) setMobileView("chat");
                      }}
                      className="mq-btn-neutral flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
                      aria-label="Открыть чат"
                    >
                      <User className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
