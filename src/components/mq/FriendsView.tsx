"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, UserPlus, UserCheck, UserX, Loader2, MessageCircle, Check, X,
  Users, Clock, Sparkles, Headphones, Wifi, WifiOff, Send, Radio,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface FriendUser {
  id: string;
  username: string;
  avatar: string;
  addedAt: string;
  online?: boolean;
  lastSeen?: string;
}

interface PendingRequest {
  id: string;
  username: string;
  requestId: string;
  avatar?: string;
  direction?: "incoming" | "outgoing";
}

interface FetchedUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  avatar?: string;
}

function AvatarImg({ src, alt, size = "md" }: { src?: string; alt: string; size?: "sm" | "md" | "lg" }) {
  const [errored, setErrored] = useState(false);
  const initials = alt.replace("@", "").split(" ").map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("");
  const useFallback = errored || !src || src.trim() === "" || src === "null" || src === "undefined";
  const colors = ["#e03131", "#0ea5e9", "#f43f5e", "#f97316", "#34d399", "#a78bfa", "#ff2a6d", "#e040fb"];
  const colorIdx = (alt.charCodeAt(0) + (alt.charCodeAt(1) || 0)) % colors.length;
  const sizeClass = size === "sm" ? "w-9 h-9 text-xs" : size === "lg" ? "w-14 h-14 text-base" : "w-11 h-11 text-sm";

  if (useFallback) {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center flex-shrink-0`}
        style={{ backgroundColor: colors[colorIdx], color: "#fff", fontWeight: 700 }}
      >
        {initials || "?"}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      onError={() => setErrored(true)}
    />
  );
}

// ── Helper: format last seen time ──
function formatLastSeen(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "";
  const d = new Date(lastSeen);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function FriendsView() {
  const { userId, setView, setSelectedContact, compactMode, animationsEnabled, currentTrack, username } = useAppStore();

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FetchedUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friendRequestStatus, setFriendRequestStatus] = useState<Record<string, "pending" | "sent" | "friend">>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, { online: boolean; lastSeen: string | null }>>({});
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [listenAlongLoading, setListenAlongLoading] = useState<string | null>(null);

  // Fetch friends
  const fetchFriends = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setPendingRequests(data.pendingRequests || []);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // Fetch online statuses — batch request with individual fallback
  useEffect(() => {
    if (!userId || friends.length === 0) return;
    const fetchStatuses = async () => {
      const statuses: Record<string, { online: boolean; lastSeen: string | null }> = {};
      try {
        const ids = friends.map(f => f.id).join(',');
        const res = await fetch(`/api/users/status?ids=${ids}`);
        if (res.ok) {
          const data = await res.json();
          for (const f of friends) {
            const entry = data[f.id];
            statuses[f.id] = entry
              ? { online: entry.online ?? false, lastSeen: entry.lastSeen ?? null }
              : { online: false, lastSeen: null };
          }
        } else {
          throw new Error('Batch request failed');
        }
      } catch {
        await Promise.all(friends.map(async (f) => {
          try {
            const res = await fetch(`/api/user/${f.id}/status`);
            if (res.ok) {
              const data = await res.json();
              statuses[f.id] = { online: data.online ?? false, lastSeen: data.lastSeen ?? null };
            }
          } catch { statuses[f.id] = { online: false, lastSeen: null }; }
        }));
      }
      setOnlineStatuses(statuses);
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [userId, friends]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim() || !showAddDialog) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const friendIds = new Set(friends.map((f) => f.id));
          setSearchResults((data.users || []).filter((u: FetchedUser) => u.id !== userId && !friendIds.has(u.id)));
        }
      } catch {
        // silent
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, userId, friends, showAddDialog]);

  // Send friend request
  const sendFriendRequest = async (targetId: string) => {
    if (!userId) return;
    setActionLoading(targetId);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, friendId: targetId }),
      });
      if (res.ok) {
        setFriendRequestStatus((prev) => ({ ...prev, [targetId]: "sent" }));
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  // Accept friend request
  const acceptRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (res.ok) {
        fetchFriends();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  // Reject friend request
  const rejectRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (res.ok) {
        fetchFriends();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const handleMessage = (friendId: string) => {
    setSelectedContact(friendId);
    setView("messenger");
  };

  // ── Listen Along — invite a friend to a collaborative listening session ──
  const handleListenAlong = async (friendId: string, friendUsername: string) => {
    if (!userId || !currentTrack) return;
    setListenAlongLoading(friendId);
    try {
      const res = await fetch("/api/listen-session/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: friendId,
          trackId: currentTrack.id,
          trackTitle: currentTrack.title,
          trackArtist: currentTrack.artist,
          trackCover: currentTrack.cover,
          scTrackId: currentTrack.scTrackId,
          audioUrl: currentTrack.audioUrl,
          source: currentTrack.source,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Set the session as host in store
        useAppStore.getState().setListenSession({
          id: data.sessionId,
          hostId: userId,
          hostName: username || "",
          guestId: friendId,
          guestName: friendUsername,
          trackId: currentTrack.id,
          trackTitle: currentTrack.title,
          trackArtist: currentTrack.artist,
          trackCover: currentTrack.cover,
          scTrackId: currentTrack.scTrackId,
          audioUrl: currentTrack.audioUrl,
          source: currentTrack.source,
          progress: 0,
          isPlaying: true,
          isHost: true,
        });
      }
    } catch {
      // silent
    } finally {
      setListenAlongLoading(null);
    }
  };

  // Split friends into recently added and all others
  const now = new Date();
  const recentlyAdded = friends.filter((f) => {
    const addedDate = new Date(f.addedAt);
    const diffDays = Math.floor((now.getTime() - addedDate.getTime()) / 86400000);
    return diffDays <= 7;
  });
  const otherFriends = friends.filter((f) => {
    const addedDate = new Date(f.addedAt);
    const diffDays = Math.floor((now.getTime() - addedDate.getTime()) / 86400000);
    return diffDays > 7;
  });

  // Filter by online status
  const filterByOnline = (list: FriendUser[]) => {
    if (!showOnlineOnly) return list;
    return list.filter((f) => {
      const status = onlineStatuses[f.id];
      return status?.online ?? f.online;
    });
  };

  const filteredRecent = filterByOnline(recentlyAdded);
  const filteredOther = filterByOnline(otherFriends);
  const onlineFriendsCount = friends.filter((f) => {
    const status = onlineStatuses[f.id];
    return status?.online ?? f.online;
  }).length;

  // Split pending requests into incoming and outgoing
  const incomingRequests = pendingRequests.filter(r => r.direction !== "outgoing");
  const outgoingRequests = pendingRequests.filter(r => r.direction === "outgoing");

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-32 lg:pb-32" : "p-4 lg:p-6 pb-36 lg:pb-36"} max-w-2xl mx-auto`}
    >
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5"
      >
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView("main")}
            className="p-2 rounded-xl cursor-pointer"
            style={{ color: "var(--mq-accent)", backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
              Друзья
            </h1>
            {friends.length > 0 && (
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                {friends.length} {friends.length === 1 ? "друг" : friends.length < 5 ? "друга" : "друзей"}
                {onlineFriendsCount > 0 && (
                  <span style={{ color: "#22c55e" }}> · {onlineFriendsCount} онлайн</span>
                )}
              </p>
            )}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowAddDialog(true); setSearchQuery(""); setFriendRequestStatus({}); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium cursor-pointer"
          style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
        >
          <UserPlus className="w-4 h-4" />
          Добавить
        </motion.button>
      </motion.div>

      {/* Online friends filter toggle */}
      {friends.length > 0 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0 } : undefined}
          animate={{ opacity: 1 }}
          className="mb-4"
        >
          <button
            onClick={() => setShowOnlineOnly(!showOnlineOnly)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{
              backgroundColor: showOnlineOnly ? "rgba(34,197,94,0.12)" : "var(--mq-card)",
              color: showOnlineOnly ? "#22c55e" : "var(--mq-text-muted)",
              border: `1px solid ${showOnlineOnly ? "rgba(34,197,94,0.25)" : "var(--mq-border)"}`,
            }}
          >
            {showOnlineOnly ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            {showOnlineOnly ? "Только онлайн" : "Все друзья"}
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
              style={{
                backgroundColor: showOnlineOnly ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
              }}
            >
              {showOnlineOnly ? onlineFriendsCount : friends.length}
            </span>
          </button>
        </motion.div>
      )}

      {/* ═══ Pending requests section ═══ */}
      <AnimatePresence>
        {pendingRequests.length > 0 && (
          <motion.div
            initial={animationsEnabled ? { opacity: 0, height: 0 } : undefined}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Входящие запросы
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(var(--mq-accent-rgb, 255,45,109),0.12)", color: "var(--mq-accent)" }}>
                    {incomingRequests.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {incomingRequests.map((req, i) => (
                    <motion.div
                      key={req.requestId}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
                    >
                      <AvatarImg src={req.avatar} alt={req.username} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                          {req.username}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                          Хочет добавить вас в друзья
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => acceptRequest(req.requestId)}
                          disabled={actionLoading === req.requestId}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
                          style={{ backgroundColor: "#22c55e", color: "#fff" }}
                        >
                          {actionLoading === req.requestId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Принять</span>
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => rejectRequest(req.requestId)}
                          disabled={actionLoading === req.requestId}
                          className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer"
                          style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                        >
                          {actionLoading === req.requestId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing requests */}
            {outgoingRequests.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Исходящие запросы
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
                    {outgoingRequests.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {outgoingRequests.map((req, i) => (
                    <motion.div
                      key={req.requestId}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", opacity: 0.7 }}
                    >
                      <AvatarImg src={req.avatar} alt={req.username} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                          {req.username}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                          Ожидает подтверждения
                        </p>
                      </div>
                      <span className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--mq-accent)", backgroundColor: "rgba(var(--mq-accent-rgb, 255,45,109),0.1)" }}>
                        Отправлено
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friends list */}
      {isLoading ? (
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
              <div className="w-11 h-11 rounded-full animate-pulse" style={{ backgroundColor: "var(--mq-border)" }} />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: "var(--mq-border)" }} />
                <div className="h-2 w-16 rounded animate-pulse" style={{ backgroundColor: "var(--mq-border)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : friends.length > 0 ? (
        <div className="space-y-4">
          {/* Recently added section */}
          {filteredRecent.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Недавно добавленные
                </p>
              </div>
              <div className="space-y-1.5">
                {filteredRecent.map((friend, i) => (
                  <FriendCard
                    key={friend.id}
                    friend={friend}
                    index={i}
                    onlineStatus={onlineStatuses[friend.id]}
                    animationsEnabled={animationsEnabled}
                    onMessage={() => handleMessage(friend.id)}
                    onListenAlong={() => handleListenAlong(friend.id, friend.username)}
                    listenAlongLoading={listenAlongLoading === friend.id}
                    currentTrack={currentTrack}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All friends section */}
          {filteredOther.length > 0 && (
            <div>
              {filteredRecent.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                    Все друзья
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                {filteredOther.map((friend, i) => (
                  <FriendCard
                    key={friend.id}
                    friend={friend}
                    index={i + filteredRecent.length}
                    onlineStatus={onlineStatuses[friend.id]}
                    animationsEnabled={animationsEnabled}
                    onMessage={() => handleMessage(friend.id)}
                    onListenAlong={() => handleListenAlong(friend.id, friend.username)}
                    listenAlongLoading={listenAlongLoading === friend.id}
                    currentTrack={currentTrack}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No online friends message */}
          {showOnlineOnly && onlineFriendsCount === 0 && (
            <div className="text-center py-10">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <WifiOff className="w-7 h-7" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>
                Никто онлайн
              </p>
              <p className="text-xs max-w-[220px] mx-auto" style={{ color: "var(--mq-text-muted)" }}>
                Все ваши друзья сейчас не в сети
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Better empty state */
        <div className="text-center py-16 mt-4">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, rgba(var(--mq-accent-rgb, 255,45,109),0.15), rgba(var(--mq-accent-rgb, 255,45,109),0.05))", border: "1px solid rgba(var(--mq-accent-rgb, 255,45,109),0.12)" }}
          >
            <Users className="w-9 h-9" style={{ color: "var(--mq-accent)", opacity: 0.5 }} />
          </div>
          <p className="text-base font-semibold mb-1.5" style={{ color: "var(--mq-text)" }}>
            Пока нет друзей
          </p>
          <p className="text-xs mb-6 max-w-[260px] mx-auto leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            Найдите друзей по имени пользователя, чтобы делиться музыкой и общаться
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setShowAddDialog(true); setSearchQuery(""); }}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-medium cursor-pointer"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          >
            <UserPlus className="w-4 h-4" />
            Добавить друга
          </motion.button>
        </div>
      )}

      {/* Add friend dialog — improved */}
      <AnimatePresence>
        {showAddDialog && (
          <motion.div
            initial={animationsEnabled ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowAddDialog(false)}
          >
            <motion.div
              initial={animationsEnabled ? { scale: 0.9, y: 20 } : undefined}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-5"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                    Добавить друга
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    Введите имя пользователя для поиска
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowAddDialog(false)}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по имени пользователя..."
                  className="pl-10"
                  style={{
                    backgroundColor: "var(--mq-bg)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                  autoFocus
                />
              </div>

              {isSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                </div>
              )}

              {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
                <div className="text-center py-8">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                  >
                    <Search className="w-5 h-5" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
                    Пользователи не найдены
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                    Попробуйте другое имя
                  </p>
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map((user) => {
                    const status = friendRequestStatus[user.id];
                    return (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: "var(--mq-bg)", border: "1px solid var(--mq-border)" }}
                      >
                        <AvatarImg src={user.avatar} alt={user.username} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                            {user.username}
                          </p>
                        </div>
                        {status === "sent" ? (
                          <span className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--mq-accent)", backgroundColor: "rgba(var(--mq-accent-rgb, 255,45,109),0.1)" }}>
                            Отправлено
                          </span>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => sendFriendRequest(user.id)}
                            disabled={actionLoading === user.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer min-h-[44px]"
                            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                Добавить
                              </>
                            )}
                          </motion.button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isSearching && !searchQuery.trim() && (
                <div className="text-center py-8">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "rgba(var(--mq-accent-rgb, 255,45,109),0.08)" }}
                  >
                    <UserPlus className="w-5 h-5" style={{ color: "var(--mq-accent)", opacity: 0.4 }} />
                  </div>
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Начните вводить имя пользователя
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Friend Card Component — improved with last active time, listen along ──

function FriendCard({
  friend,
  index,
  onlineStatus,
  animationsEnabled,
  onMessage,
  onListenAlong,
  listenAlongLoading,
  currentTrack,
}: {
  friend: FriendUser;
  index: number;
  onlineStatus?: { online: boolean; lastSeen: string | null };
  animationsEnabled: boolean;
  onMessage: () => void;
  onListenAlong: () => void;
  listenAlongLoading: boolean;
  currentTrack: any;
}) {
  const isOnline = onlineStatus?.online ?? friend.online;
  const lastSeenText = formatLastSeen(onlineStatus?.lastSeen ?? friend.lastSeen);

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -1, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}
      className="flex items-center gap-3 p-3 rounded-2xl transition-all"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="relative flex-shrink-0">
        <AvatarImg src={friend.avatar} alt={friend.username} size="md" />
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
            style={{ backgroundColor: "#22c55e", borderColor: "var(--mq-card)", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }}>
            <div className="w-full h-full rounded-full" style={{ animation: "mq-pulse-online 2s ease-in-out infinite" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
          {friend.username}
        </p>
        <p className="text-[11px] flex items-center gap-1" style={{ color: isOnline ? "#22c55e" : "var(--mq-text-muted)" }}>
          {isOnline ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: "#22c55e" }} />
              в сети
            </>
          ) : lastSeenText ? (
            <>
              <Clock className="w-3 h-3" />
              {lastSeenText}
            </>
          ) : (
            "не в сети"
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Listen Along button — only when online and a track is playing */}
        {isOnline && currentTrack && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={onListenAlong}
            disabled={listenAlongLoading}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium cursor-pointer min-h-[40px] transition-colors"
            style={{
              backgroundColor: "rgba(var(--mq-accent-rgb, 255,45,109),0.08)",
              color: "var(--mq-accent)",
              border: "1px solid rgba(var(--mq-accent-rgb, 255,45,109),0.12)",
            }}
            title="Слушать вместе"
          >
            {listenAlongLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Radio className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Вместе</span>
          </motion.button>
        )}
        {/* Message button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          onClick={onMessage}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer min-h-[40px] transition-colors"
          style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Написать</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
