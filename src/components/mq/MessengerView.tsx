"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import NotificationPanel from "./NotificationPanel";
import { Input } from "@/components/ui/input";
import {
  Lock, Shield, Send, ArrowLeft, Search, ShieldCheck, Smile, Trash2,
  Plus, Music2, X, Loader2, Copy, Reply, UserPlus, UserCheck, Users, AlertCircle,
  Play, Pause, ChevronLeft, ChevronRight, BookOpen, Pin,
  Mic, MicOff, Edit3, MessageSquare, Sticker,
  MoreVertical, Check, Bell, Ban, Download, MessageCircle, Phone
} from "lucide-react";
import { simulateEncrypt, getEncryptionStatus, generateMockFingerprint, simulateDecryptSync } from "@/lib/crypto";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface Story {
  id: string; userId: string; username: string; avatar: string;
  content: string; contentType: "text" | "image" | "track";
  createdAt: string; expiresAt: string; viewed: boolean; likes: number;
  trackData?: { id: string; title: string; artist: string; cover: string; duration: number; streamUrl: string };
}

interface FriendUser { id: string; username: string; avatar: string; addedAt: string; }
interface PendingRequest { id: string; username: string; requestId: string; }
interface FetchedUser { id: string; username: string; email: string; createdAt: string; }

interface GroupChat {
  id: string; name: string; description?: string; creatorId: string;
  memberIds: string[]; createdAt: string;
}

interface EditingMessage { id: string; content: string; }
interface ReplyingTo { id: string; content: string; senderName: string; senderId: string; }

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS & DATA
// ═══════════════════════════════════════════════════════════════

const storyGradients = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

const quickEmojis = ["😀", "😂", "❤️", "🎵", "🔥", "👍", "😎", "🤔", "💪", "🫡", "✨", "🥳"];

const stickerCategories = [
  { name: "Смайлы", items: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪"] },
  { name: "Жесты", items: ["👍", "👎", "👋", "🤝", "👏", "🙌", "🤞", "✌️", "🤟", "🫶", "💪", "🫡", "🤙", "🖕", "✋", "🖖", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️"] },
  { name: "Животные", items: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐔", "🐧", "🦄", "🐙", "🦋", "🐢", "🦀", "🐬", "🦜", "🐝", "🦉"] },
  { name: "Еда", items: ["🍕", "🍔", "🍟", "🌮", "🍣", "🍦", "🍩", "🍪", "🍫", "☕", "🧋", "🍺", "🥗", "🍝", "🍜", "🥐", "🧇", "🥞", "🍿", "🧁", "🎂", "🍰", "🥧", "🍬"] },
  { name: "Сердца", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💗", "💖", "💝", "💞", "💕", "💓", "💔", "❤️‍🔥", "❤️‍🩹", "💌", "💗", "💘", "💝", "💟", "♥️", "🏳️"] },
  { name: "Музыка", items: ["🎵", "🎶", "🎸", "🎹", "🥁", "🎺", "🎻", "🪗", "🎙️", "🎧", "🎤", "🎼", "🪕", "🎷", "🪘", "🥁", "🔊", "🔉", "🔈", "🔇", "📻", "🪇", "🎹", "🎵"] },
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function AvatarImg({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [errored, setErrored] = useState(false);
  const initials = alt.replace("@", "").split(" ").map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("");
  const useFallback = errored || !src || src.trim() === "" || src === "null" || src === "undefined";
  if (useFallback) {
    const colors = ["#e03131", "#0ea5e9", "#f43f5e", "#f97316", "#34d399", "#a78bfa", "#ff2a6d", "#e040fb"];
    const colorIdx = (alt.charCodeAt(0) + (alt.charCodeAt(1) || 0)) % colors.length;
    return (
      <div className={className} style={{ backgroundColor: colors[colorIdx], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.8em", ...style }}>
        {initials || "?"}
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} onError={() => setErrored(true)} />;
}

function getDateLabel(dateStr: string): string {
  const msgDate = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
  if (msgDay.getTime() === today.getTime()) return "Сегодня";
  if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
  return msgDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "давно";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "только что";
  if (diff < 5) return `${diff} мин назад`;
  if (diff < 60) return `был(а) ${diff} мин назад`;
  if (diff < 1440) return `был(а) ${Math.floor(diff / 60)} ч назад`;
  return `был(а) ${Math.floor(diff / 1440)} дн назад`;
}

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ═══════════════════════════════════════════════════════════════
//  GLASSMORPHISM STYLE HELPERS
// ═══════════════════════════════════════════════════════════════

const glassPanel: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const glassPanelSolid: React.CSSProperties = {
  background: "var(--mq-card)",
  border: "1px solid var(--mq-border)",
};

const shadowDeep = "0 8px 32px rgba(0,0,0,0.35)";

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function MessengerView() {
  const {
    userId, username, email, messages, addMessage, selectedContactId, setSelectedContact,
    animationsEnabled, currentTrack, isPlaying, unreadCounts, addContact, contacts,
    loadMessages,
  } = useAppStore();

  // ── Core UI state ──
  const [inputText, setInputText] = useState("");
  const [searchContact, setSearchContact] = useState("");
  const [fingerprint] = useState(generateMockFingerprint);
  const [showEmojis, setShowEmojis] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [contextMenuMsgId, setContextMenuMsgId] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [showStoryCreate, setShowStoryCreate] = useState(false);
  const [storyText, setStoryText] = useState("");
  const [newChatSearch, setNewChatSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showProfileView, setShowProfileView] = useState<string | null>(null);
  const [showProfileMore, setShowProfileMore] = useState(false);
  const [friendNowPlaying, setFriendNowPlaying] = useState<{ title: string; artist: string; cover: string } | null>(null);
  const [friendNowPlayingActive, setFriendNowPlayingActive] = useState(false);
  const [hideOnline, setHideOnline] = useState(() => {
    if (typeof window !== "undefined") {
      try { const v = localStorage.getItem("mq-hide-online"); return v === "true"; } catch { return false; }
    }
    return false;
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);

  // ── Responsive viewport height tracking ──
  const [isMobileView, setIsMobileView] = useState(false);
  /* useEffect moved to bottom of declarations */

  // ── Pinned chats (persisted to localStorage) ──
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mq-pinned-chats");
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });

  // ── New features state ──
  const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerTab, setStickerTab] = useState(0);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, { online: boolean; lastSeen: string | null }>>({});
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<Record<string, any[]>>({});

  // ── Friends system state ──
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendRequestStatus, setFriendRequestStatus] = useState<Record<string, string>>({});
  const [showFriendRequests, setShowFriendRequests] = useState(false);

  // ── New chat dialog search results ──
  const [newChatUsers, setNewChatUsers] = useState<FetchedUser[]>([]);
  const [isLoadingNewChat, setIsLoadingNewChat] = useState(false);

  // ── Server messages loaded flag ──
  const [serverMessagesLoaded, setServerMessagesLoaded] = useState<Record<string, boolean>>({});

  // ── Stories state ──
  const [stories, setStories] = useState<Story[]>([]);
  const [viewingStoryIndex, setViewingStoryIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  const storyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── All refs declared here before any useEffect to avoid TDZ in SWC minifier ──
  const bcRef = useRef<BroadcastChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sseRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifAudioCtxRef = useRef<AudioContext | null>(null);
  const lastSeenTimeRef = useRef<string>(new Date(Date.now() - 10000).toISOString());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingDurationRef = useRef(0);

  // ═══════════════════════════════════════════════════════════
  //  COMPUTED VALUES (useCallback / useMemo)
  //  Defined before useEffects to avoid TDZ in Turbopack minifier
  // ═══════════════════════════════════════════════════════════

  // ── Fetch friends list ──
  const fetchFriends = useCallback(async () => {
    if (!userId) return;
    setIsLoadingFriends(true);
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setPendingRequests(data.pendingRequests || []);
      }
    } catch { /* silent */ } finally { setIsLoadingFriends(false); }
  }, [userId]);

  // ── Notification permission ──
  const requestNotifPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    } catch { /* ignore */ }
  }, []);

  const playNotifSound = useCallback(() => {
    try {
      if (!notifAudioCtxRef.current || notifAudioCtxRef.current.state === "closed") {
        notifAudioCtxRef.current = new AudioContext();
      }
      const ctx = notifAudioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* ignore */ }
  }, []);

  const closeStoryViewer = useCallback(() => { setViewingStoryIndex(null); setStoryProgress(0); }, []);
  const viewingStory = viewingStoryIndex !== null ? stories[viewingStoryIndex] : null;

  /* useEffect: fetch stories moved to bottom of declarations */

  const processIncomingMessage = useCallback((m: any) => {
    const state = useAppStore.getState();
    const existing = state.messages.find((em: any) => em.id === m.id);
    if (existing) return;

    const msg = {
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      receiverId: m.receiverId,
      encrypted: m.encrypted ?? true,
      createdAt: m.createdAt,
      senderName: m.senderUsername ? `@${m.senderUsername}` : undefined,
      messageType: m.messageType,
      replyToId: m.replyToId,
      edited: m.edited,
      voiceUrl: m.voiceUrl,
      voiceDuration: m.voiceDuration,
    };
    state.addMessage(msg);

    // Push notification for new messages (all states, if permission granted)
    if (m.senderId !== userId) {
      playNotifSound();
      // Show browser notification
      if (notificationPermission === "granted" && document.visibilityState === "hidden") {
        try {
          const decrypted = simulateDecryptSync(m.content);
          const preview = decrypted.length > 60 ? decrypted.slice(0, 60) + "..." : decrypted;
          const senderName = m.senderUsername || "Someone";
          new Notification(`Сообщение от ${senderName}`, {
            body: preview,
            icon: "/icon-192.png",
            tag: m.id,
          });
        } catch { /* ignore */ }
      } else if (notificationPermission === "default") {
        requestNotifPermission();
      }
      // Broadcast to other tabs — include full message data
      try {
        bcRef.current?.postMessage({
          type: "new_message",
          payload: m,
        });
      } catch { /* BroadcastChannel not available */ }
    }

    // Update cursor
    if (m.createdAt) {
      lastSeenTimeRef.current = m.createdAt;
    }
  }, [userId]);

  const contactList = useMemo(() => {
    return friends.map((f) => ({
      id: f.id, name: f.username, username: f.username, avatar: f.avatar || "",
      online: onlineStatuses[f.id]?.online ?? false,
      lastSeen: onlineStatuses[f.id]?.lastSeen ?? new Date(f.addedAt).toISOString(),
    }));
  }, [friends, onlineStatuses]);

  const filteredContacts = useMemo(() => {
    if (!searchContact.trim()) return contactList;
    const q = searchContact.toLowerCase();
    return contactList.filter((c) => c.username.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [contactList, searchContact]);

  const sortedContacts = useMemo(() => {
    const pinned: typeof filteredContacts = [];
    const unpinned: typeof filteredContacts = [];
    for (const c of filteredContacts) {
      if (pinnedChatIds.has(c.id)) pinned.push(c);
      else unpinned.push(c);
    }
    return [...pinned, ...unpinned];
  }, [filteredContacts, pinnedChatIds]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || contactList.find((c) => c.id === selectedContactId),
    [selectedContactId, contacts, contactList],
  );

  const selectedGroup = useMemo(
    () => groupChats.find((g) => g.id === selectedGroupId),
    [groupChats, selectedGroupId],
  );

  const getLastMessage = useCallback((contactId: string) => {
    if (!userId) return null;
    const msgs = messages.filter((m) => (m.senderId === userId && m.receiverId === contactId) || (m.senderId === contactId && m.receiverId === userId));
    if (msgs.length === 0) return null;
    return msgs[msgs.length - 1];
  }, [messages, userId]);

  const getUnreadCount = useCallback((contactId: string) => unreadCounts[contactId] || 0, [unreadCounts]);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const newChatFilteredContacts = useMemo(() => {
    return newChatUsers.filter((u) => !friendIds.has(u.id)).map((u) => ({
      id: u.id, name: u.username, username: u.username, avatar: "", online: false,
      lastSeen: new Date(u.createdAt).toLocaleDateString("ru-RU"),
    }));
  }, [newChatUsers, friendIds]);

  // ── DM Messages ──
  const contactMessages = useMemo(() => {
    if (!userId || !selectedContactId) return [];
    return messages.filter((m) => (m.senderId === userId && m.receiverId === selectedContactId) || (m.senderId === selectedContactId && m.receiverId === userId));
  }, [messages, userId, selectedContactId]);

  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: typeof contactMessages }[] = [];
    let currentLabel = "";
    for (const msg of contactMessages) {
      const label = getDateLabel(msg.createdAt);
      if (label !== currentLabel) { currentLabel = label; groups.push({ label, messages: [] }); }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [contactMessages]);

  // ── Group messages for selected group ──
  const currentGroupMessages = useMemo(() => groupMessages[selectedGroupId || ""] || [], [groupMessages, selectedGroupId]);

  /* useEffect: scroll to bottom moved to bottom of declarations */

  const sendMessageOptimistic = useCallback(async (content: string, extra?: Record<string, unknown>) => {
    const targetId = selectedGroupId || selectedContactId;
    if (!targetId || !userId) return;
    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();
    const msg: any = {
      id: msgId,
      senderId: userId, receiverId: selectedGroupId ? userId : targetId,
      createdAt: now, senderName: `@${username || "user"}`,
    };
    // For sticker/voice/track_share: content is JSON with type
    // For reply with text: content is the encrypted text, replyToId is separate
    if (extra && extra.type && extra.type !== "reply") {
      msg.content = JSON.stringify(extra);
      msg.encrypted = false;
      msg.messageType = extra.type;
    } else {
      msg.content = content;
      msg.encrypted = true;
      msg.messageType = "text";
    }
    if (extra?.replyToId) { msg.replyToId = extra.replyToId; }
    addMessage(msg);
    try {
      const body: any = {
        id: msgId, content: msg.content, senderId: userId,
        encrypted: msg.encrypted, messageType: msg.messageType,
      };
      if (extra?.voiceUrl) { body.voiceUrl = extra.voiceUrl; }
      if (extra?.voiceDuration) { body.voiceDuration = extra.voiceDuration; }
      if (extra?.sticker) { body.content = JSON.stringify({ type: "sticker", sticker: extra.sticker }); }
      if (extra?.track) { body.content = JSON.stringify({ type: "track_share", track: extra.track }); }
      if (extra?.replyToId) { body.replyToId = extra.replyToId; }
      if (selectedGroupId) {
        body.groupChatId = selectedGroupId;
        await fetch(`/api/group-chats/${selectedGroupId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        body.receiverId = targetId;
        await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    } catch { /* best-effort */ }
  }, [selectedContactId, selectedGroupId, userId, username, addMessage]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      recordingDurationRef.current = 0;
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const finalDuration = recordingDurationRef.current;
        if (finalDuration < 1) { setIsRecording(false); return; } // Too short, discard
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Url = reader.result as string;
          // Use selectedGroupId || selectedContactId directly from store
          // to avoid TDZ from referencing activeChatId before its declaration
          const chatId = (useAppStore.getState() as any).selectedGroupId || useAppStore.getState().selectedContactId;
          if (base64Url && chatId && userId) {
            await sendMessageOptimistic("", { type: "voice", voiceUrl: base64Url, voiceDuration: finalDuration });
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration(recordingDurationRef.current);
      }, 1000);
    } catch (err) {
      showToast("Нет доступа к микрофону");
    }
  }, [userId, sendMessageOptimistic]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    recordingDurationRef.current = 0;
  }, []);

  const togglePinChat = useCallback((contactId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId); else next.add(contactId);
      try { localStorage.setItem("mq-pinned-chats", JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  }, []);

  // barHeights removed from here — it was referencing undefined `duration`/`barCount`.
  // Waveform bars are now computed inside VoiceMessageBubble where they belong.

  // ═══════════════════════════════════════════════════════════
  //  EFFECTS — all useEffects placed after all useCallback/useMemo declarations
  //  to avoid TDZ errors in SWC/Turbopack minifier
  // ═══════════════════════════════════════════════════════════

  // ── Responsive viewport height tracking (moved from above useState block) ──
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Fetch stories on mount (moved from above useCallback block) ──
  useEffect(() => {
    const fetchStories = async () => {
      try {
        const res = await fetch("/api/stories?all=true");
        if (res.ok) {
          const data = await res.json();
          const mapped: Story[] = (data.stories || []).map((s: any) => {
            let trackData: Story["trackData"] | undefined;
            let contentType: Story["contentType"] = "text";
            const cStr = typeof s.content === "string" ? s.content : "";
            if (s.type === "music" || s.type === "track") {
              contentType = "track";
              try { const p = JSON.parse(cStr); if (p.track) trackData = p.track; } catch { /* */ }
            } else if (s.type === "image") { contentType = "image"; }
            return { id: s.id, userId: s.userId, username: s.user?.username || "User", avatar: "", content: cStr, contentType, createdAt: s.createdAt, expiresAt: s.expiresAt, viewed: false, likes: s.likes?.length || 0, trackData };
          });
          setStories(mapped);
        }
      } catch { /* silent */ }
    };
    fetchStories();
  }, []);

  // ── Scroll to bottom (moved from above sendMessageOptimistic) ──
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selectedContactId, groupMessages, selectedGroupId]);

  // ── Cross-tab BroadcastChannel for notifications ──
  useEffect(() => {
    if (!userId) return;
    try {
      bcRef.current = new BroadcastChannel("mq-notifications");
      bcRef.current.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === "new_message") {
          // Add message to store (deduped by processIncomingMessage / addMessage)
          if (payload?.senderId && payload?.id) {
            const state = useAppStore.getState();
            const existing = state.messages.find((em: any) => em.id === payload.id);
            if (!existing) {
              state.addMessage({
                id: payload.id,
                content: payload.content,
                senderId: payload.senderId,
                receiverId: payload.receiverId,
                encrypted: payload.encrypted ?? true,
                createdAt: payload.createdAt,
                senderName: payload.senderUsername ? `@${payload.senderUsername}` : undefined,
                messageType: payload.messageType,
                replyToId: payload.replyToId,
                edited: payload.edited,
                voiceUrl: payload.voiceUrl,
                voiceDuration: payload.voiceDuration,
              } as any);
            }
          }
          // Show notification if from another user
          if (payload?.senderId !== userId) {
            playNotifSound();
            if (notificationPermission === "granted") {
              try {
                let preview = "";
                try { preview = simulateDecryptSync(payload.content); } catch { preview = (payload.content || "").slice(0, 60); }
                const senderName = payload.senderUsername || "Someone";
                new Notification(`Сообщение от ${senderName}`, {
                  body: preview.length > 60 ? preview.slice(0, 60) + "..." : preview,
                  icon: "/icon-192.png",
                  tag: payload.id || "",
                });
              } catch { /* ignore */ }
            }
          }
        } else if (type === "friend_request") {
          playNotifSound();
          fetchFriends();
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { try { bcRef.current?.close(); } catch { /* */ } };
  }, [userId, notificationPermission, playNotifSound, fetchFriends]);

  // ── Cross-tab: broadcast new message to other tabs ──
  useEffect(() => {
    if (!userId) return;
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.messages.length > prev.messages.length) {
        const newMsg = state.messages[state.messages.length - 1];
        if (newMsg && newMsg.senderId === userId) {
          // This is a message WE sent — broadcast to other tabs (they are the receivers)
          try {
            bcRef.current?.postMessage({ type: "self_message_sent" });
          } catch { /* */ }
        }
      }
    });
    return unsub;
  }, [userId]);

  // ── Document title with unread count for background tab indication ──
  useEffect(() => {
    if (!userId) return;
    const updateTitle = () => {
      const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
      const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
    };
    updateTitle();
  }, [unreadCounts, userId]);

  // ── Visibility change: poll notifications when tab becomes visible ──
  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        // Refresh messages, notifications, and friends when returning to tab
        if (selectedContactId) {
          fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}&since=${encodeURIComponent(lastSeenTimeRef.current)}`)
            .then(r => r.json()).then(data => {
              (data.messages || []).forEach((m: any) => {
                const existing = useAppStore.getState().messages.find((em: any) => em.id === m.id);
                if (!existing) {
                  useAppStore.getState().addMessage({
                    id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
                    encrypted: m.encrypted, createdAt: m.createdAt,
                    senderName: `@${m.sender?.username || "user"}`,
                    messageType: m.messageType, replyToId: m.replyToId, edited: m.edited,
                    voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
                  } as any);
                }
              });
            }).catch(() => {});
        }
        // Refresh unread counts
        fetch(`/api/notifications?userId=${userId}`)
          .then(r => r.json()).then(data => { setNotifUnreadCount(data.unreadCount || 0); }).catch(() => {});
        // Refresh friends
        fetchFriends();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [userId, selectedContactId, fetchFriends]);

  // ── Stories grouping ──
  const storyGroups = stories.reduce<Record<string, Story[]>>((acc, s) => {
    if (!acc[s.userId]) acc[s.userId] = [];
    acc[s.userId].push(s);
    return acc;
  }, {});
  const storyGroupKeys = Object.keys(storyGroups);

  // ═══════════════════════════════════════════════════════════
  //  CALLBACKS (defined before effects to avoid TDZ in minifier)
  // ═══════════════════════════════════════════════════════════



  // ── Play notification sound ──

  // ═══════════════════════════════════════════════════════════
  //  EFFECTS
  // ═══════════════════════════════════════════════════════════

  // Prevent hydration
  useEffect(() => { setMounted(true); }, []);

  // Auto-advance story
  useEffect(() => {
    if (viewingStoryIndex === null) return;
    setStoryProgress(0);
    if (storyPaused) { if (storyTimerRef.current) clearInterval(storyTimerRef.current); return; }
    storyTimerRef.current = setInterval(() => {
      setStoryProgress((prev) => {
        if (prev >= 100) {
          clearInterval(storyTimerRef.current!);
          if (viewingStoryIndex < stories.length - 1) setViewingStoryIndex((p) => (p !== null ? p + 1 : null));
          else setViewingStoryIndex(null);
          return 0;
        }
        return prev + 2;
      });
    }, 100);
    return () => { if (storyTimerRef.current) clearInterval(storyTimerRef.current); };
  }, [viewingStoryIndex, storyPaused, stories.length]);


  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Fetch group chats on mount ──
  useEffect(() => {
    if (!userId) return;
    const fetchGroups = async () => {
      try {
        const res = await fetch(`/api/group-chats?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setGroupChats(data.groupChats || data || []);
        }
      } catch { /* silent */ }
    };
    fetchGroups();
  }, [userId]);

  // ═══════════════════════════════════════════════════════════
  //  REAL-TIME MESSAGES: SSE (primary) + Polling (fallback)
  // ═══════════════════════════════════════════════════════════


  // SSE connection
  useEffect(() => {
    if (!userId) return;

    let es: EventSource | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;

      const since = encodeURIComponent(lastSeenTimeRef.current);
      es = new EventSource(`/api/messages/sse?userId=${userId}&since=${since}`);
      sseRef.current = es;

      es.addEventListener("connected", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.serverTime) {
            lastSeenTimeRef.current = data.serverTime;
          }
        } catch { /* ignore */ }
      });

      es.addEventListener("new_message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.message) {
            processIncomingMessage(data.message);
          }
        } catch { /* ignore parse errors */ }
      });

      es.onerror = () => {
        es?.close();
        sseRef.current = null;
        // Reconnect after 2s, but only if not destroyed
        if (!destroyed) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      es?.close();
      sseRef.current = null;
    };
  }, [userId, processIncomingMessage]);

  // ═══════════════════════════════════════════════════════════
  //  POLLING FALLBACK — every 3s for selected chat
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!userId || !selectedContactId) return;
    let latestTime = lastSeenTimeRef.current;

    const poll = async () => {
      try {
        const since = encodeURIComponent(latestTime);
        const res = await fetch(
          `/api/messages?senderId=${userId}&receiverId=${selectedContactId}&since=${since}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const msgs: any[] = data.messages || [];
        if (msgs.length > 0) {
          const newest = msgs[msgs.length - 1].createdAt;
          if (newest > latestTime) {
            latestTime = newest;
            lastSeenTimeRef.current = newest;
            msgs.forEach((m: any) => {
              const existing = useAppStore.getState().messages.find((em: any) => em.id === m.id);
              if (!existing) {
                useAppStore.getState().addMessage({
                  id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
                  encrypted: m.encrypted, createdAt: m.createdAt,
                  senderName: `@${m.sender?.username || "user"}`,
                  messageType: m.messageType, replyToId: m.replyToId, edited: m.edited,
                  voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
                } as any);
              }
            });
          }
        }
      } catch { /* silent */ }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [userId, selectedContactId]);

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 7: Heartbeat + online status
  // ═══════════════════════════════════════════════════════════

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Send heartbeat (skip if hideOnline is enabled)
  useEffect(() => {
    if (!userId || hideOnline) return;
    const sendHeartbeat = async () => {
      try { await fetch("/api/user/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); } catch { /* */ }
    };
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [userId, hideOnline]);

  // Persist hideOnline
  useEffect(() => {
    try { localStorage.setItem("mq-hide-online", JSON.stringify(hideOnline)); } catch { /* */ }
  }, [hideOnline]);

  // Poll friend requests periodically for notifications
  useEffect(() => {
    if (!userId) return;
    let prevCount = pendingRequests.length;
    const checkNewRequests = async () => {
      try {
        const res = await fetch(`/api/friends?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          const newPending = data.pendingRequests || [];
          if (newPending.length > prevCount && prevCount >= 0) {
            playNotifSound();
            if (notificationPermission === "granted") {
              try {
                new Notification("Новая заявка в друзья", {
                  body: `${newPending[newPending.length - 1].username} хочет добавить вас в друзья`,
                  icon: "/icon-192.png",
                });
              } catch { /* ignore */ }
            }
          }
          prevCount = newPending.length;
          setPendingRequests(newPending);
        }
      } catch { /* silent */ }
    };
    const interval = setInterval(checkNewRequests, 15000);
    return () => clearInterval(interval);
  }, [userId, pendingRequests.length, notificationPermission, playNotifSound]);

  // ── Server-side notifications: create notification when receiving a message ──
  useEffect(() => {
    if (!userId) return;
    const handler = (msg: any) => {
      if (msg.senderId !== userId) {
        // Create server-side notification for the recipient
        fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            type: "message",
            title: `Сообщение от ${msg.senderUsername || "пользователя"}`,
            body: (() => { try { const d = JSON.parse(msg.content); return d.type === "sticker" ? "Стикер" : d.type === "voice" ? "Голосовое сообщение" : d.type === "track_share" ? "Поделился треком" : (d.text || msg.content).slice(0, 60); } catch { return msg.content.slice(0, 60); } })(),
            data: { senderId: msg.senderId, senderUsername: msg.senderUsername },
          }),
        }).catch(() => {});
      }
    };
    // Hook into processIncomingMessage by listening to store changes
    const origMessages = useAppStore.getState().messages;
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.messages.length > prev.messages.length) {
        const newMsg = state.messages[state.messages.length - 1];
        if (newMsg && newMsg.senderId !== userId) {
          handler(newMsg);
        }
      }
    });
    return unsub;
  }, [userId]);

  // ── Poll notification unread count ──
  useEffect(() => {
    if (!userId) return;
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/notifications?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setNotifUnreadCount(data.unreadCount || 0);
        }
      } catch { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 20000);
    return () => clearInterval(interval);
  }, [userId]);

  // Fetch friend statuses on mount and when friends change
  useEffect(() => {
    if (!userId || friends.length === 0) return;
    const fetchStatuses = async () => {
      const statuses: Record<string, { online: boolean; lastSeen: string | null }> = {};
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
    // Refresh every 60s
    const interval = setInterval(fetchStatuses, 5000);
    return () => clearInterval(interval);
  }, [userId, friends]);

  // ═══════════════════════════════════════════════════════════
  //  Load messages from server on contact select
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!userId || !selectedContactId) return;
    const cacheKey = `${userId}-${selectedContactId}`;
    if (serverMessagesLoaded[cacheKey]) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/messages?senderId=${userId}&receiverId=${selectedContactId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages?.length > 0) {
            const serverMsgs = data.messages.map((m: any) => ({
              id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
              encrypted: m.encrypted, createdAt: m.createdAt, senderName: `@${m.sender?.username || "user"}`,
              messageType: m.messageType, replyToId: m.replyToId, edited: m.edited,
              voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration, editedAt: m.editedAt,
            }));
            loadMessages(serverMsgs);
          }
        }
      } catch { /* silent */ } finally { setServerMessagesLoaded((p) => ({ ...p, [cacheKey]: true })); }
    };
    load();
  }, [userId, selectedContactId, serverMessagesLoaded, loadMessages]);

  // ── Group chat messages polling ──
  useEffect(() => {
    if (!userId || !selectedGroupId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/group-chats/${selectedGroupId}/messages?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setGroupMessages((p) => ({ ...p, [selectedGroupId]: (data.messages || []).map((m: any) => ({
            id: m.id, content: m.content, senderId: m.senderId,
            createdAt: m.createdAt, senderName: m.sender?.username || "User",
            messageType: m.messageType,
          })) }));
        }
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [userId, selectedGroupId]);

  // ── New chat dialog: search users API with debounce ──
  useEffect(() => {
    let cancelled = false;
    const q = newChatSearch.trim();
    if (!q) { setNewChatUsers([]); return; }
    const timer = setTimeout(async () => {
      setIsLoadingNewChat(true);
      try {
        const excludeParam = userId ? `&excludeId=${userId}` : "";
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}${excludeParam}`);
        if (!res.ok) { if (!cancelled) setNewChatUsers([]); return; }
        const data = await res.json();
        if (!cancelled) setNewChatUsers(data.users || []);
      } catch { if (!cancelled) setNewChatUsers([]); } finally { if (!cancelled) setIsLoadingNewChat(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [newChatSearch, userId]);

  // ── Push own now-playing status when track changes ──
  useEffect(() => {
    if (!userId || !mounted) return;
    const pushNowPlaying = async () => {
      try {
        const store = useAppStore.getState();
        const track = store.currentTrack;
        const playing = store.isPlaying;
        if (track && playing) {
          await fetch("/api/user/now-playing", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              track: { title: track.title, artist: track.artist, cover: track.cover || "" },
            }),
          });
        } else {
          await fetch("/api/user/now-playing", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track: {} }),
          });
        }
      } catch { /* silent */ }
    };
    pushNowPlaying();
  }, [currentTrack?.id, isPlaying, userId, mounted]);

  // ── Fetch friend's now-playing when viewing their profile ──
  useEffect(() => {
    if (!showProfileView || showProfileView === userId || !mounted) {
      setFriendNowPlaying(null);
      setFriendNowPlayingActive(false);
      return;
    }
    let cancelled = false;
    const fetchFriendNowPlaying = async () => {
      try {
        // Add cache-busting to avoid Vercel edge caching
        const bust = Date.now();
        const res = await fetch(`/api/user/now-playing?userId=${showProfileView}&_=${bust}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.nowPlaying) {
          setFriendNowPlaying(data.nowPlaying);
          setFriendNowPlayingActive(true);
        } else {
          setFriendNowPlaying(null);
          setFriendNowPlayingActive(false);
        }
      } catch { if (!cancelled) { setFriendNowPlaying(null); setFriendNowPlayingActive(false); } }
    };
    fetchFriendNowPlaying();
    // Poll every 3 seconds for near-real-time updates
    const interval = setInterval(fetchFriendNowPlaying, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showProfileView, userId, mounted]);

  // ═══════════════════════════════════════════════════════════
  //  COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════






  // Active chat: either DM or group
  const activeChatId = selectedGroupId || selectedContactId;






  // ── Close context menu on click/touch/Escape anywhere ──
  useEffect(() => {
    if (!contextMenuMsgId) return;
    const close = (e: Event) => {
      // Don't close if click/touch is inside the context menu
      const menu = document.querySelector("[data-context-menu]");
      if (menu && menu.contains(e.target as Node)) return;
      setContextMenuMsgId(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenuMsgId(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchstart", close, { passive: true });
      document.addEventListener("click", close);
      document.addEventListener("keydown", handleEscape);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuMsgId]);

  // ═══════════════════════════════════════════════════════════
  //  @MENTIONS
  // ═══════════════════════════════════════════════════════════

  const handleInputChange = (value: string) => {
    setInputText(value);
    const lastWord = value.split(/\s/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) { setMentionSearch(lastWord.slice(1).toLowerCase()); setShowMentions(true); }
    else { setShowMentions(false); setMentionSearch(""); }
  };

  const filteredMentions = mentionSearch
    ? contactList.filter((c) => c.username.toLowerCase().includes(mentionSearch) || c.name.toLowerCase().includes(mentionSearch))
    : contactList;

  const handleMentionSelect = (contact: typeof contactList[0]) => {
    const words = inputText.split(/\s/);
    words[words.length - 1] = `@${contact.username} `;
    setInputText(words.join(" "));
    setShowMentions(false);
    setMentionSearch("");
    inputRef.current?.focus();
  };

  // ═══════════════════════════════════════════════════════════
  //  MESSAGE SENDING
  // ═══════════════════════════════════════════════════════════


  const handleSend = async () => {
    if (!inputText.trim() || !activeChatId || !userId) return;
    const text = inputText.trim();
    setInputText("");
    setShowEmojis(false);
    setShowStickers(false);
    try {
      const encryptedContent = await simulateEncrypt(text);
      await sendMessageOptimistic(encryptedContent, replyingTo ? { replyToId: replyingTo.id } : undefined);
    } catch { await sendMessageOptimistic(text, replyingTo ? { replyToId: replyingTo.id } : undefined); }
    setReplyingTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 3: MESSAGE EDITING
  // ═══════════════════════════════════════════════════════════

  const handleStartEdit = (msg: any) => {
    if (msg.senderId !== userId) return;
    try {
      const decrypted = simulateDecryptSync(msg.content);
      setEditingMessage({ id: msg.id, content: decrypted });
    } catch { setEditingMessage({ id: msg.id, content: msg.content }); }
    setContextMenuMsgId(null);
    inputRef.current?.focus();
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !userId) return;
    try {
      const encrypted = await simulateEncrypt(editingMessage.content);
      await fetch(`/api/messages/${editingMessage.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: encrypted }) });
      // Update local state with encrypted content
      useAppStore.setState({ messages: useAppStore.getState().messages.map((m) => m.id === editingMessage.id ? { ...m, content: encrypted, edited: true, editedAt: new Date().toISOString() } : m) });
    } catch { /* */ }
    setEditingMessage(null);
  };

  const handleCancelEdit = () => { setEditingMessage(null); setInputText(""); };

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 4: REPLY TO MESSAGES
  // ═══════════════════════════════════════════════════════════

  const handleReplyMessage = (msg: any) => {
    let replyText = "";
    try { const d = simulateDecryptSync(msg.content); replyText = d.length > 50 ? d.slice(0, 50) + "..." : d; } catch { replyText = msg.content.slice(0, 50) + "..."; }
    const senderName = msg.senderId === userId ? "Вы" : (selectedContact?.name || "User");
    setReplyingTo({ id: msg.id, content: replyText, senderName, senderId: msg.senderId });
    setContextMenuMsgId(null);
    inputRef.current?.focus();
  };

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 6: VOICE MESSAGES
  // ═══════════════════════════════════════════════════════════




  // ═══════════════════════════════════════════════════════════
  //  FEATURE 5: SEARCH MESSAGES
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!searchMode || !searchQuery.trim() || !userId || !selectedContactId) { setSearchResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/messages/search?userId=${userId}&q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSearchResults(data.messages || []);
        }
      } catch { if (!cancelled) setSearchResults([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, userId, selectedContactId, searchMode]);

  const handleSearchResultClick = (msg: any) => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    // Scroll to message
    setTimeout(() => {
      const el = document.getElementById(`msg-${msg.id}`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.outline = "2px solid var(--mq-accent)"; setTimeout(() => { el.style.outline = ""; }, 2000); }
    }, 100);
  };

  // ═══════════════════════════════════════════════════════════
  //  CONTEXT MENU ACTIONS
  // ═══════════════════════════════════════════════════════════

  const handleDeleteMessage = (messageId: string) => {
    useAppStore.setState({ messages: useAppStore.getState().messages.filter((m) => m.id !== messageId) });
    setContextMenuMsgId(null);
  };

  const handleCopyMessage = (msg: any) => {
    try { navigator.clipboard.writeText(simulateDecryptSync(msg.content)).catch(() => {}); } catch { navigator.clipboard.writeText(msg.content).catch(() => {}); }
    setContextMenuMsgId(null);
  };

  const handleSendSticker = (emoji: string) => {
    if (!activeChatId || !userId) return;
    sendMessageOptimistic("", { type: "sticker", sticker: emoji });
    setShowStickers(false);
  };

  // ═══════════════════════════════════════════════════════════
  //  CHAT ACTIONS: Export, Clear, Delete
  // ═══════════════════════════════════════════════════════════

  const handleExportChat = (targetUserId?: string) => {
    const targetId = targetUserId || selectedContactId;
    if (!targetId || !userId) return;
    const msgs = messages.filter((m) =>
      (m.senderId === userId && m.receiverId === targetId) ||
      (m.senderId === targetId && m.receiverId === userId)
    );
    if (msgs.length === 0) { showToast("Нет сообщений для экспорта"); return; }
    const contactName = contactList.find(c => c.id === targetId)?.name || contactList.find(c => c.id === targetId)?.username || "chat";
    let text = `Чат с @${contactName}\nЭкспортирован: ${new Date().toLocaleString("ru-RU")}\n${"═".repeat(40)}\n\n`;
    msgs.forEach((m) => {
      const time = new Date(m.createdAt).toLocaleString("ru-RU");
      const sender = m.senderId === userId ? "Вы" : `@${contactName}`;
      let content = "";
      try { content = simulateDecryptSync(m.content); } catch { content = m.content; }
      if ((m as any).edited) content += " (ред.)";
      text += `[${time}] ${sender}: ${content}\n`;
    });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_${contactName}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("История экспортирована");
  };

  const handleClearHistory = (targetUserId?: string) => {
    const targetId = targetUserId || selectedContactId;
    if (!targetId || !userId) return;
    useAppStore.setState({
      messages: useAppStore.getState().messages.filter(
        (m) => !((m.senderId === userId && m.receiverId === targetId) ||
                 (m.senderId === targetId && m.receiverId === userId))
      ),
    });
    setServerMessagesLoaded((p) => ({ ...p, [`${userId}-${targetId}`]: false }));
    showToast("История очищена");
    if (!targetUserId) {
      setSelectedContact(null);
      setSelectedGroupId(null);
    }
  };

  const handleDeleteChat = (targetUserId?: string) => {
    const targetId = targetUserId || selectedContactId;
    if (!targetId || !userId) return;
    handleClearHistory(targetUserId);
    showToast("Чат удалён");
  };

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 13: RESET PASSWORD
  // ═══════════════════════════════════════════════════════════

  // Password reset is available in Settings only

  // ═══════════════════════════════════════════════════════════
  //  FEATURE 10: GROUP CHATS
  // ═══════════════════════════════════════════════════════════

  const handleCreateGroup = async () => {
    if (!userId || !groupName.trim()) return;
    try {
      const res = await fetch("/api/group-chats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName.trim(), description: groupDesc.trim(), memberIds: [...groupMembers] }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroupChats((p) => [...p, data.groupChat || data]);
        setSelectedGroupId(data.groupChat?.id || data.id);
        setSelectedContact(null);
        setShowGroupCreate(false);
        setGroupName("");
        setGroupDesc("");
        setGroupMembers(new Set());
      }
    } catch { /* silent */ }
  };

  // ═══════════════════════════════════════════════════════════
  //  TRACK SHARING & FRIEND REQUESTS
  // ═══════════════════════════════════════════════════════════

  const shareTrack = async () => {
    if (!currentTrack || !selectedContactId || !userId) return;
    await sendMessageOptimistic("", { type: "track_share", track: { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, cover: currentTrack.cover || "", duration: currentTrack.duration, streamUrl: currentTrack.audioUrl || "" } });
  };

  const sendFriendRequest = async (targetUserId: string) => {
    if (!userId) return;
    setFriendRequestStatus((p) => ({ ...p, [targetUserId]: "loading" }));
    try {
      const res = await fetch("/api/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresseeId: targetUserId }) });
      const data = await res.json();
      if (res.ok) { setFriendRequestStatus((p) => ({ ...p, [targetUserId]: "sent" })); if (data.message?.includes("друзья")) fetchFriends(); }
      else { setFriendRequestStatus((p) => ({ ...p, [targetUserId]: data.error || "error" })); }
    } catch { setFriendRequestStatus((p) => ({ ...p, [targetUserId]: "error" })); }
  };

  const handleFriendRequest = async (requestId: string, action: "accept" | "reject") => {
    try { const res = await fetch(`/api/friends/${requestId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); if (res.ok) fetchFriends(); } catch { /* */ }
  };


  const handleSelectContact = (contact: { id: string; name: string; username: string; avatar: string; online: boolean; lastSeen: string }) => {
    addContact(contact);
    setSelectedContact(contact.id);
    setSelectedGroupId(null);
    setShowNewChatDialog(false);
    setNewChatSearch("");
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedContact(null);
  };

  // ═══════════════════════════════════════════════════════════
  //  LOADING STATE
  // ═══════════════════════════════════════════════════════════

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--mq-bg)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--mq-accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  const isGroupChat = !!selectedGroupId && !selectedContactId;
  const displayMessages = isGroupChat ? currentGroupMessages : contactMessages;

  // Compute messenger container height
  // PlayerBar actual height on desktop: progress(~6px) + controls(~72px) + canvas(~28px) ≈ 106px ≈ 6.6rem
  // PlayerBar actual height on mobile: progress(~6px) + controls(~56px) + canvas(~20px) + mobileNav(~56px) ≈ 138px
  const messengerHeight = (() => {
    const topNav = isMobileView ? 4 : 3.5;
    const mobileNav = isMobileView ? 3.5 : 0;
    const playerBar = currentTrack ? (isMobileView ? 8.75 : 7.5) : 0;
    return `calc(100dvh - ${topNav + mobileNav + playerBar}rem)`;
  })();

  return (
    <div className="flex flex-col lg:flex-row overflow-hidden" style={{ backgroundColor: "var(--mq-bg)", height: messengerHeight }}>
      {/* ════════════════════════════════════════════════════════ */}
      {/*  LEFT SIDEBAR                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      <div
        className={`w-full lg:w-80 flex-shrink-0 ${activeChatId ? "hidden lg:flex" : "flex"} flex-col`}
        style={{ borderRight: "1px solid var(--mq-border)", flex: "0 0 auto", overflow: "hidden", ...glassPanel }}
      >
        {/* ── Sidebar header ── */}
        <div className="p-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--mq-border)" }}>
          <h2 className="font-bold text-lg" style={{ color: "var(--mq-text)" }}>Мессенджер</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg" title="Сквозное шифрование" style={glassPanel}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
              <span className="text-[10px] font-semibold" style={{ color: "var(--mq-accent)" }}>E2E</span>
            </div>
            <div className="relative">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowNotifications(true)}
                className="p-2 rounded-xl cursor-pointer" style={{ ...glassPanel, color: "var(--mq-text)" }} title="Уведомления">
                <Bell className="w-4 h-4" />
              </motion.button>
              {notifUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full text-[9px] flex items-center justify-center px-0.5 font-bold" style={{ backgroundColor: "#ef4444", color: "#fff" }}>
                  {notifUnreadCount > 99 ? "99" : notifUnreadCount}
                </span>
              )}
            </div>
            <div className="relative">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowFriendRequests(!showFriendRequests)}
                className="p-2 rounded-xl cursor-pointer" style={{ ...glassPanel, color: "var(--mq-text)" }} title="Заявки в друзья">
                <Users className="w-4 h-4" />
              </motion.button>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full text-[9px] flex items-center justify-center px-0.5 font-bold" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                  {pendingRequests.length}
                </span>
              )}
            </div>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowNewChatDialog(true); setShowFriendRequests(false); }}
              className="p-2 rounded-xl cursor-pointer" style={{ ...glassPanel, color: "var(--mq-text)" }} title="Новый чат">
              <Plus className="w-4 h-4" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowGroupCreate(true)}
              className="p-2 rounded-xl cursor-pointer" style={{ ...glassPanel, color: "var(--mq-text)" }} title="Создать группу">
              <MessageSquare className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* ── Stories carousel ── */}
        <div className="flex-shrink-0" style={{ borderBottom: "1px solid var(--mq-border)" }}>
          <div className="flex gap-3 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
            {storyGroupKeys.map((uid) => {
              const userStories = storyGroups[uid];
              const firstStory = userStories[0];
              const hasUnviewed = userStories.some((s) => !s.viewed);
              const startIdx = stories.findIndex((s) => s.userId === uid && !s.viewed) >= 0
                ? stories.findIndex((s) => s.userId === uid && !s.viewed)
                : stories.indexOf(firstStory);
              return (
                <motion.button key={uid} whileTap={{ scale: 0.95 }} onClick={() => setViewingStoryIndex(startIdx)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer">
                  <div className="w-14 h-14 rounded-full p-[2.5px]"
                    style={{ background: hasUnviewed ? "linear-gradient(135deg, var(--mq-accent), #f5576c, #fa709a)" : "var(--mq-border)" }}>
                    <div className="w-full h-full rounded-full overflow-hidden" style={{ border: "2px solid var(--mq-bg)" }}>
                      <AvatarImg src={firstStory.avatar} alt={firstStory.username} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <span className="text-[10px] max-w-[56px] truncate" style={{ color: hasUnviewed ? "var(--mq-text)" : "var(--mq-text-muted)" }}>
                    {firstStory.username}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── Friend requests panel ── */}
        <AnimatePresence>
          {showFriendRequests && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
              <div className="p-3" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>Заявки в друзья ({pendingRequests.length})</p>
                {pendingRequests.length === 0 ? (
                  <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Нет заявок</p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div key={req.requestId} className="flex items-center gap-2 p-2 rounded-xl" style={{ ...glassPanel }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                          {req.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm flex-1 truncate" style={{ color: "var(--mq-text)" }}>@{req.username}</span>
                        <button onClick={() => handleFriendRequest(req.requestId, "accept")} className="p-1 rounded-md" style={{ color: "#4ade80" }} title="Принять"><UserCheck className="w-4 h-4" /></button>
                        <button onClick={() => handleFriendRequest(req.requestId, "reject")} className="p-1 rounded-md" style={{ color: "#ef4444" }} title="Отклонить"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search contacts ── */}
        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <Input placeholder="Поиск друзей..." value={searchContact} onChange={(e) => setSearchContact(e.target.value)}
              className="pl-10 min-h-[40px] rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
          </div>
        </div>

        {/* ── E2E badge ── */}
        <div className="mx-3 mb-2 p-2.5 rounded-xl text-xs flex items-start gap-2 flex-shrink-0" style={glassPanel}>
          <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          <p style={{ color: "var(--mq-text-muted)" }}>Все сообщения защищены шифрованием {getEncryptionStatus()}</p>
        </div>

        {/* ── Contacts list ── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
          {isLoadingFriends ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} /></div>
          ) : (
            <>
              {/* ── Pinned section ── */}
              {sortedContacts.filter((c) => pinnedChatIds.has(c.id)).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2" style={{ color: "var(--mq-text-muted)" }}>
                    📌 Закреплённые
                  </p>
                  {sortedContacts.filter((c) => pinnedChatIds.has(c.id)).map((contact, i) => (
                    <ContactItem key={contact.id} contact={contact} selected={selectedContactId === contact.id} userId={userId || ""}
                      lastMsg={getLastMessage(contact.id)} unread={getUnreadCount(contact.id)} pinned onlineStatus={onlineStatuses[contact.id]}
                      animationsEnabled={animationsEnabled} index={i} onClick={() => setSelectedContact(contact.id)} onContextMenu={() => togglePinChat(contact.id)} />
                  ))}
                </div>
              )}

              {/* ── Group chats section ── */}
              {groupChats.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider px-4 py-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    👥 Группы
                  </p>
                  {groupChats.map((g, i) => {
                    const lastMsg = currentGroupMessages[0];
                    return (
                      <motion.button key={g.id} initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                        onClick={() => handleSelectGroup(g.id)}
                        className="w-full flex items-center gap-3 p-3 hover:opacity-80 transition-all text-left cursor-pointer"
                        style={{ backgroundColor: selectedGroupId === g.id ? "var(--mq-accent)" : "transparent", borderBottom: "1px solid var(--mq-border)" }}>
                        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, var(--mq-accent), #f5576c)", color: "#fff" }}>
                          {g.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{g.name}</p>
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {g.memberIds?.length || 0} участников
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* ── All contacts ── */}
              {sortedContacts.filter((c) => !pinnedChatIds.has(c.id)).map((contact, i) => (
                <ContactItem key={contact.id} contact={contact} selected={selectedContactId === contact.id} userId={userId || ""}
                  lastMsg={getLastMessage(contact.id)} unread={getUnreadCount(contact.id)} pinned={false} onlineStatus={onlineStatuses[contact.id]}
                  animationsEnabled={animationsEnabled} index={i} onClick={() => setSelectedContact(contact.id)} onContextMenu={() => togglePinChat(contact.id)} />
              ))}

              {sortedContacts.length === 0 && groupChats.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>{searchContact.trim() ? "Друзья не найдены" : "У вас пока нет друзей"}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>Нажмите + чтобы найти и добавить друзей</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/*  RIGHT — CHAT AREA                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className={`flex-1 flex flex-col ${!activeChatId ? "hidden lg:flex" : "flex"} min-h-0 overflow-hidden`}>
        {activeChatId ? (
          <>
            {/* ── Chat header ── */}
            <div className="flex items-center gap-3 p-3 lg:p-4 flex-shrink-0 sticky top-0 z-10" style={{ borderBottom: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)", backdropFilter: "blur(10px)" }}>
              <button onClick={() => { setSelectedContact(null); setSelectedGroupId(null); }} className="lg:hidden p-1 cursor-pointer" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="relative cursor-pointer" onClick={() => { if (!isGroupChat && selectedContactId) setShowProfileView(selectedContactId); }}>
                {isGroupChat ? (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: "linear-gradient(135deg, var(--mq-accent), #f5576c)", color: "#fff" }}>
                    {selectedGroup?.name.charAt(0).toUpperCase() || "G"}
                  </div>
                ) : (
                  <AvatarImg src={selectedContact?.avatar || ""} alt={selectedContact?.name || ""} className="w-9 h-9 rounded-full object-cover" />
                )}
                {/* Online indicator */}
                {!isGroupChat && onlineStatuses[selectedContactId || ""]?.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2" style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-player-bg)" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                  {isGroupChat ? selectedGroup?.name : selectedContact?.name}
                </p>
                <div className="flex items-center gap-1">
                  {!isGroupChat && (
                    <>
                      <Lock className="w-2.5 h-2.5" style={{ color: "var(--mq-accent)" }} />
                      <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                        {onlineStatuses[selectedContactId || ""]?.online ? "В сети" : formatLastSeen(onlineStatuses[selectedContactId || ""]?.lastSeen || null)}
                        {!onlineStatuses[selectedContactId || ""]?.online && " • "}
                        {!onlineStatuses[selectedContactId || ""]?.online && "Зашифровано"}
                      </span>
                    </>
                  )}
                  {isGroupChat && (
                    <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                      {selectedGroup?.memberIds?.length || 0} участников
                    </span>
                  )}
                </div>
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-1">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setSearchMode(!searchMode)}
                  className="p-2 rounded-xl cursor-pointer" style={{ color: searchMode ? "var(--mq-accent)" : "var(--mq-text-muted)" }} title="Поиск сообщений">
                  <Search className="w-4.5 h-4.5" />
                </motion.button>
                {!isGroupChat && currentTrack && (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={shareTrack}
                    className="p-2 rounded-xl cursor-pointer" style={{ color: "var(--mq-accent)" }} title="Поделиться треком">
                    <Music2 className="w-4.5 h-4.5" />
                  </motion.button>
                )}
                <div className="relative">
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowChatSettings(!showChatSettings)}
                    className="p-2 rounded-xl cursor-pointer" style={{ color: "var(--mq-text-muted)" }}>
                    <MoreVertical className="w-4.5 h-4.5" />
                  </motion.button>
                  <AnimatePresence>
                    {showChatSettings && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute right-0 top-full mt-1 rounded-xl py-1 min-w-[220px] z-50"
                        style={{ ...glassPanelSolid, boxShadow: shadowDeep }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-chat-settings="true"
                        onClick={(e) => { e.stopPropagation(); setShowChatSettings(false); }}>
                        {!isGroupChat && selectedContactId && (
                          <>
                            <button onClick={() => { setShowChatSettings(false); setShowProfileView(selectedContactId); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                              <Users className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Профиль
                            </button>
                            <button onClick={() => { setShowChatSettings(false); showToast("Запрет копирования включён"); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                              <Ban className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Запретить копирование
                            </button>
                            <button onClick={() => { setShowChatSettings(false); handleExportChat(); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                              <Download className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Экспорт истории чата
                            </button>
                            <button onClick={() => { setShowChatSettings(false); handleClearHistory(); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                              <Trash2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Очистить историю
                            </button>
                            <div className="my-1" style={{ borderTop: "1px solid var(--mq-border)" }} />
                            <button onClick={() => { setShowChatSettings(false); handleDeleteChat(); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "#ef4444" }}>
                              <Trash2 className="w-4 h-4" /> Удалить чат
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* ── Reply preview bar ── */}
            <AnimatePresence>
              {replyingTo && !editingMessage && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
                  <div className="mx-3 mt-2 p-2.5 rounded-xl flex items-center gap-2" style={{ ...glassPanel }}>
                    <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold" style={{ color: "var(--mq-accent)" }}>{replyingTo.senderName}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>{replyingTo.content}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="p-1 cursor-pointer" style={{ color: "var(--mq-text-muted)" }}><X className="w-3.5 h-3.5" /></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Edit mode bar ── */}
            <AnimatePresence>
              {editingMessage && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
                  <div className="mx-3 mt-2 p-2.5 rounded-xl flex items-center gap-2" style={{ ...glassPanel }}>
                    <Edit3 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                    <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: "var(--mq-accent)" }}>Редактирование</span>
                    <div className="flex gap-1 ml-auto flex-shrink-0">
                      <button onClick={handleCancelEdit} className="px-2.5 py-1 rounded-lg text-[10px] cursor-pointer" style={{ color: "var(--mq-text-muted)", ...glassPanel }}>Отмена</button>
                      <button onClick={handleSaveEdit} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>Сохранить</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Search messages panel ── */}
            <AnimatePresence>
              {searchMode && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
                  <div className="p-3" style={{ borderBottom: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)" }}>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      <Input placeholder="Поиск сообщений..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 min-h-[38px] rounded-xl" autoFocus
                        style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                      <button onClick={() => { setSearchMode(false); setSearchQuery(""); setSearchResults([]); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer" style={{ color: "var(--mq-text-muted)" }}><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-xl" style={{ ...glassPanelSolid }}>
                        {searchResults.map((m: any) => {
                          let preview = m.content || "";
                          try { preview = simulateDecryptSync(preview); } catch { /* */ }
                          if (preview.length > 50) preview = preview.slice(0, 50) + "...";
                          return (
                            <button key={m.id} onClick={() => handleSearchResultClick(m)}
                              className="w-full text-left p-2.5 hover:opacity-80 transition-opacity cursor-pointer" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                              <p className="text-[10px] font-semibold" style={{ color: "var(--mq-accent)" }}>
                                {m.senderId === userId ? "Вы" : m.sender?.username || "User"}
                              </p>
                              <p className="text-xs truncate" style={{ color: "var(--mq-text)" }}>{preview}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {searchQuery.trim() && searchResults.length === 0 && (
                      <p className="text-xs text-center py-3" style={{ color: "var(--mq-text-muted)" }}>Ничего не найдено</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Messages area ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
              <div className="flex justify-center mb-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs" style={glassPanel}>
                  <Shield className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                  <span style={{ color: "var(--mq-text-muted)" }}>
                    {isGroupChat ? "Групповой чат" : `Сообщения зашифрованы • ${getEncryptionStatus()}`}
                  </span>
                </div>
              </div>

              {/* Typing indicator */}
              {isGroupChat && (
                <div className="flex justify-center mb-2">
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full" style={glassPanel}>
                    {[0, 1, 2].map((i) => (
                      <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }}
                        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                </div>
              )}

              {displayMessages.length === 0 && !isGroupChat && (
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  {/* Empty state card — player style */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-[280px] rounded-2xl p-6 text-center"
                    style={{ ...glassPanelSolid, boxShadow: shadowDeep }}>
                    {/* Cute character / icon */}
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, var(--mq-accent), rgba(255,255,255,0.1))" }}>
                      <motion.span
                        className="text-4xl"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                        🎵
                      </motion.span>
                    </div>
                    <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
                      Здесь пока ничего нет...
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                      Отправьте сообщение или поделитесь треком, чтобы начать общение
                    </p>
                  </motion.div>

                  {/* Quick action buttons */}
                  <div className="flex gap-2 mt-5 w-full max-w-[280px]">
                    {currentTrack && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={shareTrack}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium cursor-pointer"
                        style={{ ...glassPanelSolid }}>
                        <Music2 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                        <span style={{ color: "var(--mq-text)" }}>Поделиться треком</span>
                      </motion.button>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setShowEmojis(true); inputRef.current?.focus(); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium cursor-pointer"
                      style={{ ...glassPanelSolid }}>
                      <Smile className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                      <span style={{ color: "var(--mq-text)" }}>Привет! 👋</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {displayMessages.length === 0 && isGroupChat && (
                <div className="text-center py-16">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ ...glassPanel }}>
                    <Users className="w-10 h-10" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>Нет сообщений</p>
                  <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                    Напишите первое сообщение в группе
                  </p>
                </div>
              )}

              {!isGroupChat && groupedMessages.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center justify-center my-4">
                    <div className="px-3 py-1 rounded-full text-[11px] font-medium" style={{ ...glassPanel, color: "var(--mq-text-muted)" }}>{group.label}</div>
                  </div>
                  {group.messages.map((msg) => renderMessageBubble(msg))}
                </div>
              ))}

              {isGroupChat && displayMessages.map((msg: any) => renderGroupMessageBubble(msg))}
            </div>

            {/* ── @Mentions dropdown ── */}
            <AnimatePresence>
              {showMentions && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mx-3 mb-1 rounded-xl flex-shrink-0" style={glassPanelSolid}>
                  <div className="px-3 py-1.5"><p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Упомянуть пользователя</p></div>
                  {filteredMentions.length > 0 ? (
                    filteredMentions.slice(0, 5).map((c) => (
                      <button key={c.id} onClick={() => handleMentionSelect(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:opacity-80 transition-opacity text-left cursor-pointer" style={{ color: "var(--mq-text)" }}>
                        <AvatarImg src={c.avatar} alt={c.name} className="w-6 h-6 rounded-full" />
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>@{c.username}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2"><p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Пользователь не найден</p></div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ═══ INPUT AREA ═══ */}
            {/* ── Voice recording mode: replaces input area ── */}
            {isRecording ? (
              <div className="px-3 py-2 flex items-center gap-3 flex-shrink-0 relative z-50" style={{ borderTop: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)" }}>
                {/* Cancel button */}
                <motion.button whileTap={{ scale: 0.85 }} onClick={cancelRecording}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)" }}>
                  <X className="w-4 h-4" style={{ color: "#ef4444" }} />
                </motion.button>

                {/* Recording wave indicator */}
                <div className="flex-1 flex items-center gap-1 h-8 overflow-hidden">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <motion.div key={i} className="w-[3px] rounded-full flex-shrink-0"
                      style={{ backgroundColor: "#ef4444" }}
                      animate={{ height: [4, 6 + Math.random() * 22, 4] }}
                      transition={{ duration: 0.4 + (i % 3) * 0.15, repeat: Infinity, delay: i * 0.02, ease: "easeInOut" }}
                    />
                  ))}
                </div>

                {/* Timer */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[11px] font-mono font-medium" style={{ color: "#ef4444" }}>{formatRecordingTime(recordingDuration)}</span>
                </div>

                {/* Send voice button */}
                <motion.button whileTap={{ scale: 0.85 }} onClick={stopRecording}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", boxShadow: "0 4px 15px rgba(239,68,68,0.3)" }}>
                <Send className="w-4 h-4 text-white" style={{ marginLeft: 1 }} />
              </motion.button>
              </div>
            ) : (
              /* ── Normal input mode ── */
              <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0 relative z-50" style={{ borderTop: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)" }}>
                {/* Emoji / Sticker toggle */}
                <motion.button whileTap={{ scale: 0.9 }}
                  onClick={() => { if (showEmojis) { setShowEmojis(false); } else if (showStickers) { setShowStickers(false); } else { setShowEmojis(true); } }}
                  className="p-2 rounded-full cursor-pointer flex-shrink-0"
                  style={{ color: (showEmojis || showStickers) ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                  <Smile className="w-5 h-5" />
                </motion.button>

                {/* Text input */}
                <div className="flex-1 min-w-0">
                  <Input
                    ref={inputRef}
                    value={editingMessage ? editingMessage.content : inputText}
                    onChange={(e) => { if (editingMessage) setEditingMessage({ ...editingMessage, content: e.target.value }); else handleInputChange(e.target.value); }}
                    onKeyDown={(e) => { if (editingMessage) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } return; } handleKeyDown(e); }}
                    placeholder={editingMessage ? "Редактирование..." : replyingTo ? `Ответ для ${replyingTo.senderName}...` : "Сообщение"}
                    className="min-h-[42px] rounded-full"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)", paddingLeft: 16 }}
                  />
                </div>

                {/* Mic button (when no text) OR Send button (when has text) */}
                {(!inputText.trim() && !editingMessage) ? (
                  <motion.button whileTap={{ scale: 0.85 }} onClick={startRecording}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer"
                    style={{ background: "var(--mq-accent)", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}
                    title="Голосовое сообщение">
                    <Mic className="w-4.5 h-4.5" style={{ color: "var(--mq-text)" }} />
                  </motion.button>
                ) : (
                  <motion.button whileTap={{ scale: 0.85 }}
                    onClick={editingMessage ? handleSaveEdit : handleSend}
                    disabled={editingMessage ? !editingMessage.content.trim() : !inputText.trim()}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-all"
                    style={{
                      background: (editingMessage ? editingMessage.content.trim() : inputText.trim())
                        ? "var(--mq-accent)"
                        : "var(--mq-card)",
                      boxShadow: (editingMessage ? editingMessage.content.trim() : inputText.trim())
                        ? "0 2px 12px rgba(0,0,0,0.15)" : "none",
                      opacity: (editingMessage ? editingMessage.content.trim() : inputText.trim()) ? 1 : 0.5,
                    }}>
                    {editingMessage
                      ? <Check className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
                      : <Send className="w-4 h-4" style={{ color: "var(--mq-text)", marginLeft: 1 }} />}
                  </motion.button>
                )}
              </div>
            )}

            {/* ── Unified Emoji/Sticker picker ── */}
            <AnimatePresence>
              {(showEmojis || showStickers) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="flex-shrink-0" style={{ borderTop: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)", maxHeight: "280px" }}>
                  {/* Tabs: Emojis | Stickers */}
                  <div className="flex gap-1 px-3 pt-2 pb-1">
                    <button onClick={() => { setShowEmojis(true); setShowStickers(false); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all"
                      style={showEmojis ? { backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" } : { ...glassPanel, color: "var(--mq-text-muted)" }}>
                      Эмодзи
                    </button>
                    <button onClick={() => { setShowStickers(true); setShowEmojis(false); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all"
                      style={showStickers ? { backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" } : { ...glassPanel, color: "var(--mq-text-muted)" }}>
                      Стикеры
                    </button>
                  </div>

                  {/* Emoji grid */}
                  {showEmojis && (
                    <div className="grid grid-cols-8 gap-1 px-3 pb-3 pt-1 overflow-y-auto" style={{ maxHeight: "220px", scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
                      {[...quickEmojis, ...stickerCategories[0].items, ...stickerCategories[1].items].map((emoji) => (
                        <motion.button key={emoji} whileTap={{ scale: 1.2 }}
                          onClick={() => { setInputText((p) => p + emoji); inputRef.current?.focus(); }}
                          className="w-full aspect-square flex items-center justify-center text-xl rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                          style={glassPanel}>
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {/* Sticker grid with categories */}
                  {showStickers && (
                    <>
                      <div className="flex gap-1 px-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                        {stickerCategories.map((cat, i) => (
                          <button key={cat.name} onClick={() => setStickerTab(i)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap cursor-pointer transition-all"
                            style={stickerTab === i ? { backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" } : { ...glassPanel, color: "var(--mq-text-muted)" }}>
                            {cat.name}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-8 gap-1 px-3 pb-3 overflow-y-auto" style={{ maxHeight: "200px", scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
                        {stickerCategories[stickerTab]?.items.map((emoji) => (
                          <motion.button key={emoji} whileTap={{ scale: 1.2 }}
                            onClick={() => handleSendSticker(emoji)}
                            className="w-full aspect-square flex items-center justify-center text-2xl rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                            style={glassPanel}>
                            {emoji}
                          </motion.button>
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Story creation ── */}
            <AnimatePresence>
              {showStoryCreate && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="p-3 flex-shrink-0" style={{ borderTop: "1px solid var(--mq-border)", backgroundColor: "var(--mq-player-bg)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--mq-text)" }}>Новая история</span>
                  </div>
                  <textarea value={storyText} onChange={(e) => setStoryText(e.target.value)} placeholder="Что у вас нового?" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                  <div className="flex gap-2 mt-2">
                    <motion.button whileTap={{ scale: 0.95 }} onClick={async () => {
                      if (!storyText.trim() || !userId) return;
                      try {
                        const res = await fetch("/api/stories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "text", content: storyText.trim() }) });
                        if (res.ok) { setShowStoryCreate(false); setStoryText(""); showToast("История опубликована!"); }
                      } catch { /* */ }
                    }} disabled={!storyText.trim()}
                      className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ backgroundColor: storyText.trim() ? "var(--mq-accent)" : "var(--mq-card)", color: storyText.trim() ? "var(--mq-text)" : "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
                      Опубликовать
                    </motion.button>
                    <button onClick={() => { setShowStoryCreate(false); setStoryText(""); }} className="px-3 py-2 rounded-xl text-xs" style={{ color: "var(--mq-text-muted)", ...glassPanel }}>Отмена</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center" style={{ ...glassPanel }}>
                <Shield className="w-12 h-12" style={{ color: "var(--mq-text-muted)", opacity: 0.25 }} />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: "var(--mq-text)" }}>Безопасный мессенджер</h3>
              <p className="text-sm mb-1" style={{ color: "var(--mq-text-muted)" }}>Выберите друга или группу для начала разговора</p>
              <p className="text-[10px] font-mono mt-4 px-3 py-1.5 rounded-lg inline-block" style={{ color: "var(--mq-accent)", ...glassPanel }}>
                Отпечаток: {fingerprint}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/*  NEW CHAT / ADD FRIEND DIALOG                        */}
      {/* ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNewChatDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={() => setShowNewChatDialog(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md rounded-2xl overflow-hidden" style={{ ...glassPanelSolid, boxShadow: shadowDeep }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                <h3 className="font-bold" style={{ color: "var(--mq-text)" }}>Найти и добавить друга</h3>
                <button onClick={() => setShowNewChatDialog(false)} className="p-1 cursor-pointer" style={{ color: "var(--mq-text-muted)" }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                  <Input placeholder="Поиск по @username или имени..." value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)}
                    className="pl-10 min-h-[40px] rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} autoFocus />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {isLoadingNewChat ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} /></div>
                ) : newChatFilteredContacts.length > 0 ? (
                  newChatFilteredContacts.map((contact) => {
                    const status = friendRequestStatus[contact.id];
                    return (
                      <div key={contact.id} className="flex items-center gap-3 p-3" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                        <AvatarImg src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-full object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{contact.name}</p>
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>@{contact.username}</p>
                        </div>
                        {status === "sent" ? (
                          <span className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ color: "var(--mq-accent)", ...glassPanel }}>Отправлено</span>
                        ) : status && status !== "loading" ? (
                          <span className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertCircle className="w-3 h-3" />Ошибка</span>
                        ) : (
                          <motion.button whileTap={{ scale: 0.95 }} onClick={() => sendFriendRequest(contact.id)} disabled={status === "loading"}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                            {status === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                            Добавить
                          </motion.button>
                        )}
                      </div>
                    );
                  })
                ) : newChatSearch.trim() ? (
                  <div className="text-center py-8"><p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Пользователи не найдены</p></div>
                ) : (
                  <div className="text-center py-8">
                    <Search className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                    <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Введите имя или @username для поиска</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════ */}
      {/*  GROUP CREATE DIALOG                                   */}
      {/* ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showGroupCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={() => setShowGroupCreate(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md rounded-2xl overflow-hidden" style={{ ...glassPanelSolid, boxShadow: shadowDeep }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                <h3 className="font-bold" style={{ color: "var(--mq-text)" }}>Создать группу</h3>
                <button onClick={() => setShowGroupCreate(false)} className="p-1 cursor-pointer" style={{ color: "var(--mq-text-muted)" }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Название группы</label>
                  <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Моя группа"
                    className="min-h-[40px] rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Описание (необязательно)</label>
                  <Input value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} placeholder="О чём эта группа..."
                    className="min-h-[40px] rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Добавить участников</label>
                  <div className="max-h-40 overflow-y-auto rounded-xl" style={{ ...glassPanel }}>
                    {friends.length === 0 ? (
                      <p className="text-xs p-3 text-center" style={{ color: "var(--mq-text-muted)" }}>Сначала добавьте друзей</p>
                    ) : (
                      friends.map((f) => (
                        <label key={f.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:opacity-80 transition-opacity" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                          <input type="checkbox" checked={groupMembers.has(f.id)} onChange={(e) => {
                            setGroupMembers((p) => { const n = new Set(p); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; });
                          }} className="accent-[var(--mq-accent)]" />
                          <AvatarImg src="" alt={f.username} className="w-7 h-7 rounded-full" />
                          <span className="text-sm" style={{ color: "var(--mq-text)" }}>@{f.username}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 flex gap-2" style={{ borderTop: "1px solid var(--mq-border)" }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleCreateGroup} disabled={!groupName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer" style={{ backgroundColor: groupName.trim() ? "var(--mq-accent)" : "var(--mq-card)", color: groupName.trim() ? "var(--mq-text)" : "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
                  Создать
                </motion.button>
                <button onClick={() => setShowGroupCreate(false)} className="px-4 py-2.5 rounded-xl text-xs cursor-pointer" style={{ color: "var(--mq-text-muted)", ...glassPanel }}>
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════ */}
      {/*  FULL-SCREEN STORY VIEWER                              */}
      {/* ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewingStory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
            onClick={() => { if (viewingStoryIndex !== null && viewingStoryIndex < stories.length - 1) setViewingStoryIndex(viewingStoryIndex + 1); else closeStoryViewer(); }}>
            <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); closeStoryViewer(); }}
              className="absolute top-4 right-4 z-[310] p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}><X className="w-5 h-5 text-white" /></motion.button>

            <div className="absolute top-0 left-0 right-0 z-[310] flex gap-1 p-2">
              {stories.map((_, i) => (
                <div key={i} className="h-0.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <div className="h-full rounded-full transition-all duration-100" style={{
                    backgroundColor: i === viewingStoryIndex ? "white" : "rgba(255,255,255,0.5)",
                    width: i < (viewingStoryIndex ?? 0) ? "100%" : i === viewingStoryIndex ? `${storyProgress}%` : "0%",
                  }} />
                </div>
              ))}
            </div>

            {viewingStoryIndex !== null && viewingStoryIndex > 0 && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); setViewingStoryIndex(viewingStoryIndex - 1); setStoryProgress(0); }}
                className="absolute left-2 z-[310] p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}><ChevronLeft className="w-5 h-5 text-white" /></motion.button>
            )}
            {viewingStoryIndex !== null && viewingStoryIndex < stories.length - 1 && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); setViewingStoryIndex(viewingStoryIndex + 1); setStoryProgress(0); }}
                className="absolute right-2 z-[310] p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}><ChevronRight className="w-5 h-5 text-white" /></motion.button>
            )}

            <motion.div key={viewingStory.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-[420px] h-[85vh] rounded-2xl overflow-hidden mx-2" style={{ backgroundColor: "var(--mq-card)" }} onClick={(e) => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 p-4" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
                <AvatarImg src={viewingStory.avatar} alt={viewingStory.username} className="w-9 h-9 rounded-full object-cover" style={{ border: "2px solid white" }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{viewingStory.username}</p>
                  <p className="text-[10px] text-white/60">{new Date(viewingStory.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); setStoryPaused(!storyPaused); }}
                  className="p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                  {storyPaused ? <Play className="w-4 h-4 text-white" /> : <Pause className="w-4 h-4 text-white" />}
                </motion.button>
              </div>

              <div className="w-full h-full flex items-center justify-center"
                style={viewingStory.contentType === "text" ? { background: storyGradients[(viewingStoryIndex ?? 0) % storyGradients.length] } : {}}>
                {viewingStory.contentType === "text" && (
                  <div className="p-8 text-center"><p className="text-xl font-medium text-white leading-relaxed">{viewingStory.content}</p></div>
                )}
                {viewingStory.contentType === "track" && viewingStory.trackData && (
                  <div className="p-8 w-full">
                    <div className="mx-auto max-w-[280px]">
                      {viewingStory.trackData.cover && (
                        <img src={viewingStory.trackData.cover} alt={viewingStory.trackData.title} className="w-full aspect-square rounded-2xl object-cover mb-4 shadow-2xl" />
                      )}
                      <p className="text-white text-lg font-bold text-center mb-1">{viewingStory.trackData.title}</p>
                      <p className="text-white/60 text-sm text-center">{viewingStory.trackData.artist}</p>
                      <div className="mt-4 flex justify-center">
                        <motion.button whileTap={{ scale: 0.9 }} className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}
                          onClick={() => {
                            const store = useAppStore.getState();
                            store.playTrack({ id: viewingStory.trackData!.id, title: viewingStory.trackData!.title, artist: viewingStory.trackData!.artist, cover: viewingStory.trackData!.cover, audioUrl: viewingStory.trackData!.streamUrl, duration: viewingStory.trackData!.duration } as any, []);
                          }}>
                          <Play className="w-6 h-6 text-white" style={{ marginLeft: 2 }} />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════ */}
      {/*  PROFILE VIEW PANEL                                    */}
      {/* ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showProfileView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => { setShowProfileView(null); setShowProfileMore(false); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-visible"
              style={{ ...glassPanelSolid, boxShadow: shadowDeep }}
              onClick={(e) => e.stopPropagation()}>

              {/* Handle bar for mobile */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--mq-border)" }} />
              </div>

              {/* Close button */}
              <div className="flex justify-end px-4 pb-2">
                <button onClick={() => { setShowProfileView(null); setShowProfileMore(false); }} className="p-1.5 rounded-full cursor-pointer" style={{ ...glassPanel, color: "var(--mq-text-muted)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Avatar + Name + Status */}
              <div className="flex flex-col items-center px-6 pb-5 gap-3">
                <AvatarImg
                  src={contactList.find(c => c.id === showProfileView)?.avatar || ""}
                  alt={contactList.find(c => c.id === showProfileView)?.name || "User"}
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: "3px solid var(--mq-accent)" }}
                />
                <div className="text-center">
                  <p className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
                    @{contactList.find(c => c.id === showProfileView)?.username || "User"}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <div className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: onlineStatuses[showProfileView || ""]?.online ? "#4ade80" : "#6b7280" }} />
                    <p className="text-xs" style={{ color: onlineStatuses[showProfileView || ""]?.online ? "#4ade80" : "var(--mq-text-muted)" }}>
                      {onlineStatuses[showProfileView || ""]?.online
                        ? "В сети"
                        : formatLastSeen(onlineStatuses[showProfileView || ""]?.lastSeen || null)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons row */}
              <div className="flex justify-center gap-2 px-4 pb-4">
                <motion.button whileTap={{ scale: 0.9 }}
                  onClick={() => { setShowProfileView(null); }}
                  className="flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl cursor-pointer flex-1 max-w-[80px]"
                  style={{ ...glassPanel }}>
                  <MessageCircle className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--mq-text)" }}>Чат</span>
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }}
                  onClick={() => { showToast("Звонки скоро будут доступны"); }}
                  className="flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl cursor-pointer flex-1 max-w-[80px]"
                  style={{ ...glassPanel }}>
                  <Phone className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--mq-text)" }}>Звонок</span>
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }}
                  onClick={() => { requestNotifPermission(); showToast(notificationPermission === "granted" ? "Уведомления включены" : "Разрешите уведомления в браузере"); }}
                  className="flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl cursor-pointer flex-1 max-w-[80px]"
                  style={{ ...glassPanel }}>
                  <Bell className="w-5 h-5" style={{ color: notificationPermission === "granted" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--mq-text)" }}>Звук</span>
                </motion.button>
                <div className="relative flex flex-col items-center gap-1.5 flex-1 max-w-[80px]">
                  <motion.button whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); setShowProfileMore(!showProfileMore); }}
                    className="flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl cursor-pointer w-full"
                    style={{ ...glassPanel }}>
                    <MoreVertical className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                    <span className="text-[10px] font-medium" style={{ color: "var(--mq-text)" }}>Ещё</span>
                  </motion.button>
                  <AnimatePresence>
                    {showProfileMore && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-xl py-1 min-w-[180px] z-50"
                        style={{ ...glassPanelSolid, boxShadow: shadowDeep }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-context-menu="true"
                        onClick={(e) => { e.stopPropagation(); setShowProfileMore(false); }}>
                        <button onClick={() => { handleExportChat(showProfileView!); setShowProfileMore(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                          <Download className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Экспорт чата
                        </button>
                        <button onClick={() => { handleClearHistory(showProfileView!); setShowProfileMore(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "var(--mq-text)" }}>
                          <Trash2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Очистить историю
                        </button>
                        <div className="my-1" style={{ borderTop: "1px solid var(--mq-border)" }} />
                        <button onClick={() => { handleDeleteChat(showProfileView!); setShowProfileMore(false); setShowProfileView(null); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-opacity" style={{ color: "#ef4444" }}>
                          <Ban className="w-4 h-4" /> Заблокировать
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Now listening status — shows friend's currently playing track */}
              {friendNowPlaying && (
                <div className="mx-4 mb-4 rounded-xl p-3 flex items-center gap-3" style={{ ...glassPanel }}>
                  {friendNowPlaying.cover ? (
                    <img src={friendNowPlaying.cover} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-lg" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }}>
                      <Music2 className="w-6 h-6" style={{ color: "var(--mq-text)" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--mq-accent)" }}>Сейчас слушает</p>
                    <p className="text-xs font-medium truncate mt-0.5" style={{ color: "var(--mq-text)" }}>{friendNowPlaying.title}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>{friendNowPlaying.artist}</p>
                  </div>
                  {friendNowPlayingActive && (
                    <div className="flex items-end gap-[3px] flex-shrink-0 h-5">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="w-[3px] rounded-full"
                          style={{ backgroundColor: "var(--mq-accent)" }}
                          animate={{
                            height: [4, 14, 6, 12, 4],
                            opacity: [0.5, 1, 0.6, 0.9, 0.5],
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.15,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom safe area for mobile */}
              <div className="h-2 sm:hidden" style={{ backgroundColor: "transparent" }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Panel */}
      <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  MESSAGE BUBBLE RENDERER (DM)
  // ═══════════════════════════════════════════════════════════

  function renderMessageBubble(msg: any) {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const handleTouchStart = (e: React.TouchEvent) => {
      longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        setContextMenuMsgId({ id: msg.id, x: touch.clientX, y: touch.clientY });
      }, 500);
    };
    const handleTouchEnd = (e: React.TouchEvent) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    const handleTouchMove = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };

    // Check if voice message
    let voiceData: { voiceUrl: string; voiceDuration: number } | null = null;
    try { const parsed = JSON.parse(msg.content); if (parsed.voiceUrl) voiceData = parsed; } catch { /* not voice */ }

    // Check if sticker
    let stickerEmoji = "";
    try { const parsed = JSON.parse(msg.content); if (parsed.type === "sticker" && parsed.sticker) stickerEmoji = parsed.sticker; } catch { /* not sticker */ }

    // Check if reply content
    let replyPreview: { senderName: string; content: string } | null = null;
    if (msg.replyToId) {
      const replyMsg = contactMessages.find((m) => m.id === msg.replyToId);
      if (replyMsg) {
        let content = "";
        try { content = simulateDecryptSync(replyMsg.content); } catch { content = replyMsg.content; }
        replyPreview = { senderName: replyMsg.senderId === userId ? "Вы" : (selectedContact?.name || "User"), content: content.slice(0, 40) + (content.length > 40 ? "..." : "") };
      }
    }

    const isMine = msg.senderId === userId;
    const isVoice = voiceData !== null;
    const isSticker = !!stickerEmoji;
    const isEdited = msg.edited;

    return (
      <div key={msg.id} id={`msg-${msg.id}`} className="relative group/bubble"
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenuMsgId({ id: msg.id, x: e.clientX, y: e.clientY }); }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove}>
        <motion.div initial={animationsEnabled ? { opacity: 0, y: 8, scale: 0.97 } : undefined} animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
          {replyPreview && (
            <div className="mb-1 ml-1 px-2.5 py-1.5 rounded-lg max-w-[85%] lg:max-w-[70%] w-fit" style={{ ...glassPanel, borderLeft: "2px solid var(--mq-accent)" }}>
              <p className="text-[9px] font-semibold" style={{ color: "var(--mq-accent)" }}>{replyPreview.senderName}</p>
              <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>{replyPreview.content}</p>
            </div>
          )}
          {isSticker ? (
            <div className="text-5xl py-2">{stickerEmoji}</div>
          ) : isVoice ? (
            <VoiceMessageBubble voiceUrl={voiceData!.voiceUrl} duration={voiceData!.voiceDuration || 0} isMine={isMine} />
          ) : (
            <MessageBubble message={msg} currentUserId={userId || undefined} />
          )}
        </motion.div>

        {/* Context menu — fixed positioning at cursor */}
        {contextMenuMsgId && contextMenuMsgId.id === msg.id && (
          <div
            data-context-menu="true"
            className="fixed z-[9999] rounded-xl py-1 min-w-[190px]"
            style={{
              ...glassPanelSolid,
              boxShadow: shadowDeep,
              left: Math.min(contextMenuMsgId.x, window.innerWidth - 210),
              top: Math.min(contextMenuMsgId.y, window.innerHeight - 220),
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => handleReplyMessage(msg)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-xs hover:opacity-80 active:opacity-70 transition-opacity text-left cursor-pointer" style={{ color: "var(--mq-text)" }}>
              <Reply className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Ответить
            </button>
            {msg.senderId === userId && !isVoice && !isSticker && (
              <button onClick={() => handleStartEdit(msg)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-xs hover:opacity-80 active:opacity-70 transition-opacity text-left cursor-pointer" style={{ color: "var(--mq-text)" }}>
                <Edit3 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Редактировать
              </button>
            )}
            <button onClick={() => handleCopyMessage(msg)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-xs hover:opacity-80 active:opacity-70 transition-opacity text-left cursor-pointer" style={{ color: "var(--mq-text)" }}>
              <Copy className="w-4 h-4" style={{ color: "var(--mq-accent)" }} /> Копировать
            </button>
            {msg.senderId === userId && (
              <button onClick={() => handleDeleteMessage(msg.id)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-xs hover:opacity-80 active:opacity-70 transition-opacity text-left cursor-pointer" style={{ color: "#ef4444" }}>
                <Trash2 className="w-4 h-4" /> Удалить
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  GROUP MESSAGE BUBBLE RENDERER
  // ═══════════════════════════════════════════════════════════

  function renderGroupMessageBubble(msg: any) {
    const isMine = msg.senderId === userId;
    let stickerEmoji = "";
    try { const parsed = JSON.parse(msg.content); if (parsed.type === "sticker" && parsed.sticker) stickerEmoji = parsed.sticker; } catch { /* */ }
    let voiceData: { voiceUrl: string; voiceDuration: number } | null = null;
    try { const parsed = JSON.parse(msg.content); if (parsed.voiceUrl) voiceData = parsed; } catch { /* */ }

    return (
      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} mb-3`}>
          {!isMine ? (
            <div className="max-w-[85%] lg:max-w-[70%] w-fit">
              <p className="text-[10px] mb-1 ml-1 font-semibold" style={{ color: "var(--mq-accent)" }}>
                {msg.senderName || "User"}
              </p>
              {stickerEmoji ? (
                <div className="text-5xl py-2">{stickerEmoji}</div>
              ) : voiceData ? (
                <VoiceMessageBubble voiceUrl={voiceData!.voiceUrl} duration={voiceData!.voiceDuration || 0} isMine={isMine} />
              ) : (
                <MessageBubble message={{ id: msg.id, content: msg.content, senderId: msg.senderId, receiverId: userId || "", encrypted: false, createdAt: msg.createdAt, senderName: msg.senderName, messageType: msg.messageType, replyToId: msg.replyToId, edited: msg.edited }} currentUserId={userId || undefined} />
              )}
              {msg.edited && !stickerEmoji && !voiceData && (
                <p className={`text-[9px] mt-0.5 ${isMine ? "text-right mr-1" : "ml-1"}`} style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>ред.</p>
              )}
            </div>
          ) : (
            <>
              {stickerEmoji ? (
                <div className="text-5xl py-2">{stickerEmoji}</div>
              ) : voiceData ? (
                <VoiceMessageBubble voiceUrl={voiceData!.voiceUrl} duration={voiceData!.voiceDuration || 0} isMine={isMine} />
              ) : (
                <MessageBubble message={{ id: msg.id, content: msg.content, senderId: msg.senderId, receiverId: userId || "", encrypted: false, createdAt: msg.createdAt, senderName: msg.senderName, messageType: msg.messageType, replyToId: msg.replyToId, edited: msg.edited }} currentUserId={userId || undefined} />
              )}
              {msg.edited && !stickerEmoji && !voiceData && (
                <p className={`text-[9px] mt-0.5 ${isMine ? "text-right mr-1" : "ml-1"}`} style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>ред.</p>
              )}
            </>
          )}
      </div>
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  VOICE MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════

function VoiceMessageBubble({ voiceUrl, duration, isMine }: { voiceUrl: string; duration: number; isMine: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate pseudo-random bar heights based on duration for consistent waveform
  const barCount = 28;
  const barHeights = useMemo(() => {
    const heights: number[] = [];
    let seed = duration * 7;
    for (let i = 0; i < barCount; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      heights.push(20 + (seed % 80));
    }
    return heights;
  }, [duration]);

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceUrl);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (progressInterval.current) clearInterval(progressInterval.current);
      };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
          setProgress(pct);
          setCurrentTime(audioRef.current.currentTime);
        }
      };
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3 min-w-[220px] max-w-[280px]"
      style={{ backgroundColor: isMine ? "var(--mq-accent)" : "var(--mq-card)", border: isMine ? "none" : "1px solid var(--mq-border)", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
      {/* Play button */}
      <button onClick={togglePlay} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
        style={{ backgroundColor: isMine ? "rgba(255,255,255,0.25)" : "var(--mq-accent)" }}>
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-text)" }} />
        ) : (
          <Play className="w-3.5 h-3.5" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-text)", marginLeft: 2 }} />
        )}
      </button>
      {/* Waveform bars */}
      <div className="flex-1 flex items-center gap-[2px] h-8 cursor-pointer" onClick={togglePlay}>
        {barHeights.map((h, i) => {
          const isPast = (i / barCount) * 100 < progress;
          return (
            <div key={i} className="flex-1 rounded-full transition-all duration-200"
              style={{
                height: `${h}%`,
                minHeight: 3,
                backgroundColor: isPast
                  ? (isMine ? "rgba(255,255,255,0.9)" : "var(--mq-accent)")
                  : (isMine ? "rgba(255,255,255,0.3)" : "var(--mq-border)"),
              }} />
          );
        })}
      </div>
      {/* Time */}
      <span className="text-[10px] font-mono flex-shrink-0 w-10 text-right"
        style={{ color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
        {isPlaying ? formatTime(currentTime) : formatTime(duration)}
      </span>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  CONTACT ITEM SUB-COMPONENT
// ═══════════════════════════════════════════════════════════════

function ContactItem({ contact, selected, userId, lastMsg, unread, pinned, onlineStatus, animationsEnabled, index, onClick, onContextMenu }: {
  contact: { id: string; name: string; username: string; avatar: string; online: boolean; lastSeen: string };
  selected: boolean; userId: string; lastMsg: any; unread: number; pinned: boolean;
  onlineStatus: { online: boolean; lastSeen: string | null } | undefined;
  animationsEnabled: boolean; index: number;
  onClick: () => void; onContextMenu: () => void;
}) {
  const isOnline = onlineStatus?.online ?? contact.online;
  let lastMsgPreview = "";
  if (lastMsg) {
    try {
      const decrypted = simulateDecryptSync(lastMsg.content);
      lastMsgPreview = decrypted.length > 30 ? decrypted.slice(0, 30) + "..." : decrypted;
    } catch {
      lastMsgPreview = lastMsg.content.slice(0, 30) + "...";
    }
  }

  return (
    <motion.button
      key={contact.id}
      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(); }}
      className="w-full flex items-center gap-3 p-3 hover:opacity-80 transition-all text-left cursor-pointer"
      style={{ backgroundColor: selected ? "var(--mq-accent)" : "transparent", borderBottom: "1px solid var(--mq-border)" }}>
      <div className="relative flex-shrink-0">
        <AvatarImg src={contact.avatar} alt={contact.name} className="w-11 h-11 rounded-full object-cover" />
        {pinned && (
          <div className="absolute -top-1 -left-1" style={{ zIndex: 2 }}><Pin className="w-3 h-3" style={{ color: "var(--mq-accent)", fill: "var(--mq-accent)" }} /></div>
        )}
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ backgroundColor: "#4ade80", borderColor: "var(--mq-bg)" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{contact.name}</p>
          {lastMsg && (
            <span className="text-[10px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
              {new Date(lastMsg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            {lastMsg ? (<>{lastMsg.senderId === userId ? "Вы: " : ""}{lastMsgPreview}</>) : `@${contact.username}`}
          </p>
          {unread > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full text-[10px] flex items-center justify-center px-1 flex-shrink-0 font-bold"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>{unread}</span>
          )}
        </div>
      </div>
      <Lock className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mq-accent)", opacity: 0.5 }} />
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TOAST HELPER
// ═══════════════════════════════════════════════════════════════

function showToast(message: string) {
  const notif = document.createElement("div");
  notif.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px 24px;border-radius:12px;font-size:14px;font-family:system-ui,sans-serif;color:#f5f5f5;background:rgba(30,30,30,0.95);border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(0,0,0,0.3);transition:opacity 0.3s ease;";
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => { notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 2000);
}

// Notification permission helper
function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
