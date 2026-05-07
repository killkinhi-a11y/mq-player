"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, UserPlus, UserCheck, UserX, Loader2, MessageCircle, Check, X,
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
}

interface FetchedUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  avatar?: string;
}

function AvatarImg({ src, alt, size = "md" }: { src?: string; alt: string; size?: "sm" | "md" }) {
  const [errored, setErrored] = useState(false);
  const initials = alt.replace("@", "").split(" ").map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("");
  const useFallback = errored || !src || src.trim() === "" || src === "null" || src === "undefined";
  const colors = ["#e03131", "#0ea5e9", "#f43f5e", "#f97316", "#34d399", "#a78bfa", "#ff2a6d", "#e040fb"];
  const colorIdx = (alt.charCodeAt(0) + (alt.charCodeAt(1) || 0)) % colors.length;
  const sizeClass = size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";

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

export default function FriendsView() {
  const { userId, setView, setSelectedContact, compactMode, animationsEnabled } = useAppStore();

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FetchedUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friendRequestStatus, setFriendRequestStatus] = useState<Record<string, "pending" | "sent" | "friend">>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24" : "p-4 lg:p-6 pb-40 lg:pb-28"} max-w-2xl mx-auto`}
    >
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
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
          <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
            Друзья
          </h1>
          {friends.length > 0 && (
            <span className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
              {friends.length}
            </span>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowAddDialog(true); setSearchQuery(""); setFriendRequestStatus({}); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer"
          style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
        >
          <UserPlus className="w-4 h-4" />
          Добавить
        </motion.button>
      </motion.div>

      {/* Pending requests */}
      <AnimatePresence>
        {pendingRequests.length > 0 && (
          <motion.div
            initial={animationsEnabled ? { opacity: 0, height: 0 } : undefined}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--mq-text-muted)" }}>
              Запросы в друзья
            </h2>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.requestId}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
                >
                  <AvatarImg src={req.avatar} alt={req.username} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                      {req.username}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                      Хочет добавить вас в друзья
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => acceptRequest(req.requestId)}
                      disabled={actionLoading === req.requestId}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg cursor-pointer"
                      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                    >
                      {actionLoading === req.requestId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => rejectRequest(req.requestId)}
                      disabled={actionLoading === req.requestId}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg cursor-pointer"
                      style={{ backgroundColor: "var(--mq-card-hover)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              ))}
            </div>
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
        <div className="space-y-2">
          {friends.map((friend, i) => (
            <motion.div
              key={friend.id}
              initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              <div className="relative">
                <AvatarImg src={friend.avatar} alt={friend.username} />
                {friend.online && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 online-pulse"
                    style={{ backgroundColor: "#22c55e", borderColor: "var(--mq-card)" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                  {friend.username}
                </p>
                <p className="text-[11px]" style={{ color: friend.online ? "#22c55e" : "var(--mq-text-muted)" }}>
                  {friend.online ? "в сети" : "не в сети"}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleMessage(friend.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer min-h-[44px]"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Написать</span>
              </motion.button>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 mt-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "var(--mq-card)" }}
          >
            <UserPlus className="w-7 h-7" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text-muted)" }}>
            Пока нет друзей
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
            Найдите друзей по имени пользователя
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setShowAddDialog(true); setSearchQuery(""); }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium cursor-pointer"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
          >
            <UserPlus className="w-4 h-4" />
            Добавить друга
          </motion.button>
        </div>
      )}

      {/* Add friend dialog */}
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
                <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                  Добавить друга
                </h2>
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
                  placeholder="Поиск по имени..."
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
                <div className="text-center py-6">
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Пользователи не найдены
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
                          <span className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-card)" }}>
                            Отправлено
                          </span>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => sendFriendRequest(user.id)}
                            disabled={actionLoading === user.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer min-h-[44px]"
                            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
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
                <div className="text-center py-6">
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Введите имя пользователя для поиска
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
