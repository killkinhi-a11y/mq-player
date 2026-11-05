"use client";

// MQ Player — Messenger (premium iMessage-grade glass redesign, v14)
// Safety-first: every state array is Array.isArray-guarded, every async op
// is wrapped in try/catch, and a recoverable error state replaces any white
// screen. Visual language lives in ./messenger.css (mqms-* classes) on the
// MQ material system tokens.

import { AlertCircle, ArrowLeft, Check, CheckCheck, ChevronDown, Clock, Contact, Copy, Loader2, Lock, MessageCircle, Mic, Pin, Reply, Search, Send, Smile, SquarePen, Trash2, User, UserPlus, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usePinnedChats } from "./messenger/usePinnedChats";
import { useVoiceRecorder } from "./messenger/useVoiceRecorder";
import { useMessengerLayout } from "./messenger/useMessengerLayout";
import { useMessengerRealtime } from "./messenger/useMessengerRealtime";
import { useOnlineStatuses } from "./messenger/useOnlineStatuses";
import { useChatHistory } from "./messenger/useChatHistory";
import { useUserSearch } from "./messenger/useUserSearch";
import { useTypingIndicator } from "./messenger/useTypingIndicator";
import { useSendMessage } from "./messenger/useSendMessage";
import { toGroupMembers } from "./messenger/mappers";
import { Avatar, DateSeparator, HistorySkeleton, VoiceMessageBubble, previewIconFor } from "./messenger/parts";
import type { Message as ChatMessage } from "@/lib/musicApi";
import type { ContextMenuState, FriendUser, FriendsLoadResult, GroupChat, GroupMember } from "./messenger/types";
import { DEMO_DEFAULT_CHAT_ID, DEMO_FRIENDS, DEMO_GROUP, buildDemoThreads } from "./demoChat";
import { NO_CHAT_USERS, QUICK_EMOJIS } from "./messenger/constants";
import { isDemoUser } from "@/lib/authGate";
import { colorForId, decrypt, formatDuration, formatLastSeen, formatTime, getDateLabel, getInitials, parseVoice, sameDay } from "./messenger/format";
import { hoverProps } from "@/lib/hoverCapability";
import { loadGroupChats, loadMessengerFriends } from "./messenger/messengerApi";
import { simulateDecryptSync } from "@/lib/crypto";
import { useAppStore } from "@/store/useAppStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import "./messenger.css";

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
  // Demo threads — in-memory conversations (nothing persists, no API).
  const [demoThreads, setDemoThreads] = useState<Record<string, ChatMessage[]>>(() =>
    isDemoSession ? buildDemoThreads() : {});
  const [inputText, setInputText] = useState("");
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
  const [rawNewChatUsers, setNewChatUsers] = useUserSearch(showNewChat || showNewGroup || showAddMembers, newChatSearch, userId);
  // Search results apply only to an open picker with a non-empty query.
  const newChatUsers =
    (showNewChat || showNewGroup || showAddMembers) && newChatSearch.trim() ? rawNewChatUsers : NO_CHAT_USERS;
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
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
  const { pinnedChats, pinnedMessages, togglePinChat, togglePinMessageIn } = usePinnedChats();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { isRecording, recordingDuration, start: startVoice, stop: stopRecording, cancel: cancelRecording } = useVoiceRecorder();
  const [showQuickEmojis, setShowQuickEmojis] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // v-redesign: visual-layer states — history skeleton + failed-send retry.

  // ── Refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pullStartYRef = useRef<number | null>(null);

  // ── Derived (always-defensive) ──
  const activeChatId = selectedGroupId || selectedContactId;
  const isGroupChat = !!selectedGroupId;
  const safeFriends = Array.isArray(friends) ? friends : [];
  const safeGroupChats = Array.isArray(groupChats) ? groupChats : [];
  const safeMessages = Array.isArray(messages) ? (messages as ChatMessage[]) : [];


  const isMobileView = useMessengerLayout(shellRef, compactMode);
  const onlineStatuses = useOnlineStatuses(userId, safeFriends, isDemoSession);

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


  // ── Mobile view sync ──
  // Follow the active chat (adjusted during render; back/select handlers
  // can still switch the pane locally).
  const [mobileViewFor, setMobileViewFor] = useState(activeChatId);
  if (mobileViewFor !== activeChatId) {
    setMobileViewFor(activeChatId);
    setMobileView(activeChatId ? "chat" : "list");
  }

  // ── Fetch friends (with auto-retry) ──
  const applyFriends = useCallback((result: FriendsLoadResult) => {
    if (result.status === "ok") {
      setFriends(result.friends);
      setLoadError(false);
    } else if (result.status === "error") {
      setLoadError(true);
    }
    setIsLoadingFriends(false);
  }, []);

  // User-triggered refresh (retry button, pull-to-refresh, after mutations).
  const fetchFriends = useCallback(() => {
    setIsLoadingFriends(true);
    return loadMessengerFriends(userId).then(applyFriends);
  }, [userId, applyFriends]);

  useEffect(() => {
    let cancelled = false;
    loadMessengerFriends(userId).then((result) => { if (!cancelled) applyFriends(result); });
    return () => { cancelled = true; };
  }, [userId, applyFriends]);

  // ── Fetch group chats ──
  const fetchGroupChats = useCallback(() => {
    return loadGroupChats(userId).then((list) => { if (list) setGroupChats(list); });
  }, [userId]);

  useEffect(() => { fetchGroupChats(); }, [fetchGroupChats]);

  const bcRef = useMessengerRealtime(userId, fetchFriends);
  const historyLoading = useChatHistory({ userId, selectedContactId, selectedGroupId, setGroupChats, setGroupMessages });





  // ── Document title with unread count ──
  useEffect(() => {
    if (!userId) return;
    try {
      const total = Object.values(unreadCounts || {}).reduce((sum, c) => sum + (c || 0), 0);
      document.title = total > 0 ? `(${total}) mq` : "mq";
    } catch {}
  }, [unreadCounts, userId]);



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

  // ── Toggle pin message (per-chat, localStorage) ──
  const pinnedMsgId = activeChatId ? pinnedMessages[activeChatId] : undefined;
  const pinnedMessage = useMemo(() => {
    if (!pinnedMsgId) return null;
    return conversationMessages.find((m) => m.id === pinnedMsgId) || null;
  }, [pinnedMsgId, conversationMessages]);

  const togglePinMessage = useCallback((msgId: string) => {
    if (!activeChatId) return;
    togglePinMessageIn(activeChatId, msgId);
    setContextMenu(null);
  }, [activeChatId, togglePinMessageIn]);

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

  const { handleSend, retryFailedSend, isSending, failedDraft, setFailedDraft } = useSendMessage({
    userId, username, activeChatId, isGroupChat, isDemoSession, inputText, setInputText,
    setDemoThreads, setGroupMessages, addMessage, bcRef, toast,
  });

  // ── Voice recording ──
  const startRecording = useCallback(async () => {
    if (!activeChatId || !userId) return;
    const chatIdSnap = activeChatId;
    const isGroupSnap = isGroupChat;
    const userSnap = userId;
    const usernameSnap = username;
    const started = await startVoice(async (base64Url, duration) => {
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
    });
    if (!started) toast({ title: "Микрофон недоступен" });
  }, [activeChatId, isGroupChat, userId, username, addMessage, toast, startVoice]);


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
  }, [userId, fetchFriends, fetchGroupChats, setSelectedContact, toast, setNewChatUsers]);

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
        const members: GroupMember[] = toGroupMembers(raw.members);
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
  }, [groupName, selectedMembers, userId, setSelectedContact, toast, setNewChatUsers]);

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
  }, [selectedGroupId, addMembersTarget, userId, fetchGroupChats, toast, setNewChatUsers]);



  const { showTyping, handleInputChange } = useTypingIndicator(selectedContactId, isGroupChat, setInputText);

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
      <nav className="mqms-rail mq-glass2 hidden lg:flex" aria-label="Разделы мессенджера"
        style={{
          /* INLINE blur — the Lightning pipeline strips backdrop-filter
             from stylesheets (MenuCore / player-capsule pattern). */
          backdropFilter: "blur(18px) saturate(142%)",
          WebkitBackdropFilter: "blur(18px) saturate(142%)",
        }}>
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
        {/* v16 DEDUP: the rail's «Настройки» button is GONE — the NavBar
            gear (global, always visible) is the single owner of
            setView("settings"). One function = one control. */}
      </nav>
      {/* v15: ONE floating glass panel (reference) — mq-glass2 base (veil +
          tint + sheen + edge-lit 1px hairline) with the dense role veil and
          the float seat from messenger.css; blur INLINE (pipeline contract). */}
      <div
        className="mq-glass2 mqms-window flex rounded-[var(--mq-mat-radius-lg)] overflow-hidden h-full flex-1 min-w-0"
        style={{
          backdropFilter: "blur(18px) saturate(150%)",
          WebkitBackdropFilter: "blur(18px) saturate(150%)",
        }}
      >
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

            {/* v16 DEDUP: the section nav rows (Чаты / Группы / Друзья)
                are GONE — the icon rail above is the single section
                switcher on desktop (same handlers, one control per
                function). Mobile keeps the inline actions in the profile
                row above. */}

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
                        <Avatar src={f.avatar} name={f.username} id={f.id} size={54} />
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
              {/* v16 DEDUP: the header User icon is GONE — the avatar
                  itself is the single profile control now (real <button>,
                  keyboard-operable, same title as before). One function =
                  one control. */}
              {(() => {
                const openProfile = !isGroupChat && selectedFriend
                  ? () => setShowProfile(selectedFriend.id)
                  : null;
                const avatarEl = isGroupChat ? (
                  <Avatar name={selectedGroup?.name || "Group"} id={selectedGroupId || ""} size={56} isGroup ring />
                ) : (
                  <Avatar src={selectedFriend?.avatar} name={selectedFriend?.username || "User"}
                    id={selectedFriend?.id || ""} size={56} ring />
                );
                const onlineDot = !isGroupChat && selectedFriend && onlineStatuses[selectedFriend.id]?.online
                  ? <span className="mqms-online" aria-hidden="true" />
                  : null;
                return openProfile ? (
                  <button
                    type="button"
                    onClick={openProfile}
                    className="relative flex-shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--mq-text)_55%,transparent)] focus-visible:outline-offset-2"
                    aria-label="Профиль собеседника"
                    title="Профиль"
                  >
                    {avatarEl}
                    {onlineDot}
                  </button>
                ) : (
                  <div className="relative flex-shrink-0" aria-hidden="true">
                    {avatarEl}
                    {onlineDot}
                  </div>
                );
              })()}
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
              {/* Right actions — one group, iOS/macOS spacing: even 8px
                  between the icons, vertically centered on the avatar's
                  axis (flex items-center). v16: search only — profile is
                  the avatar button on the left (dedup). */}
              <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>
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
