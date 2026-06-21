"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Camera, Edit3, Check, X, LogOut, Heart, MessageCircle, Music,
  Loader2, AlertCircle, EyeOff, Eye, Clock, Users, Settings, Shield,
  Headphones, TrendingUp, Calendar, BarChart3, Disc3,
} from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import { LiquidGlassToggle } from "@/components/ui/liquid-glass-toggle";
import { formatDuration } from "@/lib/musicApi";

const USERNAME_RULES = "Буквы, цифры, _ и -. 2-20 символов.";

const ProfileView = React.memo(function ProfileView() {
  const username = useAppStore((s) => s.username);
  const telegramUsername = useAppStore((s) => s.telegramUsername);
  const email = useAppStore((s) => s.email);
  const avatar = useAppStore((s) => s.avatar);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const messages = useAppStore((s) => s.messages);
  const setView = useAppStore((s) => s.setView);
  const logout = useAppStore((s) => s.logout);
  const userId = useAppStore((s) => s.userId);
  const compactMode = useAppStore((s) => s.compactMode);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const history = useAppStore((s) => s.history);
  const contacts = useAppStore((s) => s.contacts);
  const playlists = useAppStore((s) => s.playlists);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const tasteGenres = useAppStore((s) => s.tasteGenres);
  const tasteArtists = useAppStore((s) => s.tasteArtists);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const safeLiked = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const safeDisliked = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeContacts = Array.isArray(contacts) ? contacts : [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(username || "");
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; error?: string } | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ── Computed stats ──
  const stats = useMemo(() => {
    const totalDurationSec = history.reduce((sum, h) => sum + (h.track.duration || 0), 0);
    const hours = Math.floor(totalDurationSec / 3600);
    const minutes = Math.floor((totalDurationSec % 3600) / 60);
    const uniqueConversations = new Set(safeMessages.map((m: any) =>
      m.senderId === userId ? m.receiverId : m.senderId
    )).size;

    // Compute total tracks played
    const totalTracksPlayed = history.length;

    // Compute favorite genre from taste profile
    const genreEntries = Object.entries(tasteGenres || {});
    let topGenre = "—";
    if (genreEntries.length > 0) {
      genreEntries.sort((a, b) => b[1] - a[1]);
      topGenre = genreEntries[0][0];
    }

    return {
      likedCount: safeLiked.length,
      conversationsCount: uniqueConversations,
      listeningTime: totalDurationSec > 0
        ? hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`
        : "0 мин",
      friendsCount: safeContacts.length,
      totalTracksPlayed,
      hoursListened: hours > 0 ? hours : Math.max(0, Math.round(totalDurationSec / 3600 * 10) / 10),
      topGenre,
    };
  }, [history, safeLiked, safeMessages, safeContacts, userId, tasteGenres]);

  // ── Listening activity chart (past 7 days) ──
  const listeningActivity = useMemo(() => {
    const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const now = new Date();
    const result: { day: string; count: number; date: Date }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(23, 59, 59, 999);
      const endOfDay = d.getTime();
      const startOfDay = new Date(d);
      startOfDay.setHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();

      const count = history.filter((h) => {
        const t = h.playedAt;
        return t >= startMs && t <= endOfDay;
      }).length;

      result.push({
        day: days[d.getDay()],
        count,
        date: new Date(startMs),
      });
    }
    return result;
  }, [history]);

  const maxActivity = useMemo(() => {
    const m = Math.max(...listeningActivity.map((d) => d.count), 1);
    return m;
  }, [listeningActivity]);

  // ── Top artists from history ──
  const topArtists = useMemo(() => {
    const artistCount: Record<string, { count: number; cover: string }> = {};
    for (const h of history) {
      const a = h.track.artist || "Unknown";
      if (!artistCount[a]) artistCount[a] = { count: 0, cover: h.track.cover || "" };
      artistCount[a].count += 1;
      // Keep latest cover
      if (h.track.cover) artistCount[a].cover = h.track.cover;
    }
    return Object.entries(artistCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([name, data]) => ({ name, count: data.count, cover: data.cover }));
  }, [history]);

  // ── Achievements — P2: gamification badges ──
  const achievements = useMemo(() => {
    const totalTracks = history.length;
    const totalLikes = Array.isArray(likedTrackIds) ? likedTrackIds.length : 0;
    const totalFriends = Array.isArray(contacts) ? contacts.length : 0;
    const totalPlaylists = Array.isArray(playlists) ? playlists.length : 0;
    const totalDurationSec = history.reduce((sum, h) => sum + (h.track.duration || 0), 0);
    const hoursListened = Math.floor(totalDurationSec / 3600);

    return [
      { id: "first-listen", icon: "🎵", title: "Первый трек", desc: "Слушайте первый трек", unlocked: totalTracks >= 1, progress: Math.min(100, totalTracks * 100) },
      { id: "ten-tracks", icon: "🎶", title: "Меломан", desc: "10 треков", unlocked: totalTracks >= 10, progress: Math.min(100, (totalTracks / 10) * 100) },
      { id: "fifty-tracks", icon: "🎧", title: "Меломан 50", desc: "50 треков", unlocked: totalTracks >= 50, progress: Math.min(100, (totalTracks / 50) * 100) },
      { id: "hundred-tracks", icon: "🏆", title: "Сотня", desc: "100 треков", unlocked: totalTracks >= 100, progress: Math.min(100, (totalTracks / 100) * 100) },
      { id: "first-like", icon: "❤️", title: "Сердцеед", desc: "Первый лайк", unlocked: totalLikes >= 1, progress: Math.min(100, totalLikes * 100) },
      { id: "ten-likes", icon: "💖", title: "Любитель", desc: "10 лайков", unlocked: totalLikes >= 10, progress: Math.min(100, (totalLikes / 10) * 100) },
      { id: "first-friend", icon: "👋", title: "Друг", desc: "Добавьте друга", unlocked: totalFriends >= 1, progress: Math.min(100, totalFriends * 100) },
      { id: "first-playlist", icon: "📋", title: "Куратор", desc: "Создайте плейлист", unlocked: totalPlaylists >= 1, progress: Math.min(100, totalPlaylists * 100) },
      { id: "hour-listened", icon: "⏰", title: "Час музыки", desc: "1 час", unlocked: hoursListened >= 1, progress: Math.min(100, hoursListened * 100) },
      { id: "ten-hours", icon: "🌙", title: "Сова", desc: "10 часов", unlocked: hoursListened >= 10, progress: Math.min(100, (hoursListened / 10) * 100) },
    ];
  }, [history, likedTrackIds, contacts, playlists]);

  // ── Recent tracks (last 5) ──
  const recentTracks = useMemo(() => {
    return history.slice(0, 5).map((h) => ({
      id: h.track.id,
      title: h.track.title,
      artist: h.track.artist,
      cover: h.track.cover,
      playedAt: h.playedAt,
      duration: h.track.duration,
    }));
  }, [history]);

  // ── Taste profile data (top genres + artists with frequency) ──
  const tasteProfileGenres = useMemo(() => {
    const entries = Object.entries(tasteGenres || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const maxVal = entries.length > 0 ? entries[0][1] : 1;
    return entries.map(([genre, level]) => ({
      genre,
      level,
      width: Math.max(8, (level / maxVal) * 100),
    }));
  }, [tasteGenres]);

  const tasteProfileArtists = useMemo(() => {
    const entries = Object.entries(tasteArtists || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxVal = entries.length > 0 ? entries[0][1] : 1;
    return entries.map(([artist, level]) => ({
      artist,
      level,
      width: Math.max(8, (level / maxVal) * 100),
    }));
  }, [tasteArtists]);

  // ── Member since (use lastSyncAt as approximate account date, or oldest history) ──
  const memberSince = useMemo(() => {
    // Try fetching from server-side user data
    // Use lastSyncAt or oldest history entry as approximation
    if (lastSyncAt) {
      const d = new Date(lastSyncAt);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
      }
    }
    // Fallback: use oldest history entry
    if (history.length > 0) {
      const oldest = history[history.length - 1];
      if (oldest?.playedAt) {
        const d = new Date(oldest.playedAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
        }
      }
    }
    return "Недавно";
  }, [lastSyncAt, history]);

  // Fetch account creation date from server
  const [accountCreated, setAccountCreated] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetch("/api/user/profile")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.createdAt) {
          const d = new Date(data.createdAt);
          if (!isNaN(d.getTime())) {
            setAccountCreated(d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }));
          }
        }
      })
      .catch(() => {});
  }, [userId]);

  // ── Format time ago ──
  const formatTimeAgo = useCallback((timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Сейчас";
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} дн. назад`;
    return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }, []);

  // Invisible mode state (shared with MessengerView via localStorage)
  const [hideOnline, setHideOnline] = useState(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("mq-hide-online") || "false"); } catch { return false; }
    }
    return false;
  });

  const toggleHideOnline = useCallback(() => {
    const newVal = !hideOnline;
    setHideOnline(newVal);
    try { localStorage.setItem("mq-hide-online", JSON.stringify(newVal)); } catch { /* */ }
    window.dispatchEvent(new StorageEvent("storage", { key: "mq-hide-online", newValue: JSON.stringify(newVal) }));
  }, [hideOnline]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "mq-hide-online" && e.newValue !== null) {
        try { setHideOnline(JSON.parse(e.newValue)); } catch { /* */ }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Файл слишком большой (макс. 2 МБ)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const resized = canvas.toDataURL("image/jpeg", 0.8);
        useAppStore.setState({ avatar: resized });
        const uid = useAppStore.getState().userId;
        if (uid) {
          setIsSavingAvatar(true);
          fetch("/api/user/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar: resized }),
          })
            .then((r) => r.json())
            .catch(() => { setAvatarError("Ошибка загрузки аватара"); })
            .finally(() => setIsSavingAvatar(false));
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const validateUsername = useCallback((name: string): string | null => {
    if (name.length < 2) return "Минимум 2 символа";
    if (name.length > 20) return "Максимум 20 символов";
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return "Только буквы, цифры, _ и -";
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(name.toLowerCase())) return "Это имя зарезервировано";
    return null;
  }, []);

  const checkUsernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEditNameChange = useCallback((value: string) => {
    setEditName(value);
    setUsernameStatus(null);
    if (checkUsernameTimeout.current) clearTimeout(checkUsernameTimeout.current);
    const localError = validateUsername(value);
    if (localError) {
      setUsernameStatus({ available: false, error: localError });
      return;
    }
    if (value === username) {
      setUsernameStatus(null);
      return;
    }
    checkUsernameTimeout.current = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const excludeParam = userId ? `&excludeId=${userId}` : "";
        const res = await fetch(`/api/auth/username-check?username=${encodeURIComponent(value)}${excludeParam}`);
        const data = await res.json();
        setUsernameStatus({ available: data.available, error: data.error });
      } catch {
        setUsernameStatus(null);
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);
  }, [username, userId, validateUsername]);

  const handleSaveName = useCallback(async () => {
    if (!editName.trim() || editName === username) {
      setIsEditingName(false);
      setUsernameStatus(null);
      return;
    }
    const localError = validateUsername(editName);
    if (localError) return;
    setIsSavingUsername(true);
    try {
      const res = await fetch("/api/auth/update-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editName }),
      });
      const data = await res.json();
      if (res.ok) {
        useAppStore.setState({ username: editName });
        setIsEditingName(false);
        setUsernameStatus(null);
      } else {
        setUsernameStatus({ available: false, error: data.error || "Ошибка сохранения" });
      }
    } catch {
      setUsernameStatus({ available: false, error: "Ошибка подключения" });
    } finally {
      setIsSavingUsername(false);
    }
  }, [editName, username, userId, validateUsername]);

  const handleCancelEditName = () => {
    setEditName(username || "");
    setIsEditingName(false);
    setUsernameStatus(null);
  };

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28 space-y-4"} max-w-[var(--mq-container-narrow)] mx-auto mq-anim-fade-in`} style={{ scrollBehavior: "smooth" }}>

      {/* ════════════════════════════════════════════
          Profile Header — gradient + larger avatar + edit overlay + member since
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative overflow-hidden rounded-2xl"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Gradient background */}
          <div
            className="absolute inset-0 h-36"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 28%, transparent) 0%, color-mix(in srgb, var(--mq-accent) 8%, transparent) 50%, transparent 100%)`,
            }}
          />

          <div className="relative flex flex-col items-center pt-8 pb-6 px-6">
            {/* Larger avatar with edit overlay */}
            <motion.div
              className="relative group"
              whileHover={{ scale: 1.03 }}
            >
              <div
                className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
                style={{
                  backgroundColor: avatar ? "transparent" : "var(--mq-accent)",
                  boxShadow: "0 0 0 4px color-mix(in srgb, var(--mq-accent) 25%, transparent), 0 0 24px color-mix(in srgb, var(--mq-accent) 15%, transparent), 0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <User className="w-14 h-14" style={{ color: "var(--mq-text)" }} />
                )}
              </div>
              {/* Edit overlay — always visible on hover, with label */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                {isSavingAvatar ? (
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "white" }} />
                ) : (
                  <>
                    <Camera className="w-6 h-6" style={{ color: "white" }} />
                    <span className="text-[11px] mt-1 font-semibold" style={{ color: "white" }}>Изменить</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </motion.div>

            {/* Avatar error message */}
            {avatarError && (
              <div className="mt-2 px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}>
                <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: "#ef4444" }} />
                <p className="text-xs" style={{ color: "#ef4444" }}>{avatarError}</p>
              </div>
            )}

            {/* Username edit area */}
            <div className="mt-4 text-center">
              {!isEditingName ? (
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-xl font-bold" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
                    @{username || "User"}
                  </h2>
                  <button
                    onClick={() => { setEditName(username || ""); setIsEditingName(true); }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: "var(--mq-accent)" }}
                    title="Изменить имя"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-w-xs mx-auto">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 flex items-center rounded-xl px-3 py-2"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `1px solid ${usernameStatus && !usernameStatus.available ? "rgba(239,68,68,0.5)" : "var(--mq-border)"}`,
                      }}
                    >
                      <span style={{ color: "var(--mq-text-muted)" }}>@</span>
                      <input
                        value={editName}
                        onChange={(e) => handleEditNameChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && usernameStatus?.available !== false) handleSaveName();
                          if (e.key === "Escape") handleCancelEditName();
                        }}
                        className="flex-1 bg-transparent outline-none text-sm ml-1"
                        style={{ color: "var(--mq-text)" }}
                        maxLength={20}
                        autoFocus
                        autoComplete="off"
                      />
                      {isCheckingUsername && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                      )}
                    </div>
                    <button
                      onClick={handleSaveName}
                      disabled={isSavingUsername || (usernameStatus !== null && !usernameStatus.available)}
                      className="p-2 rounded-lg"
                      style={{
                        color: (usernameStatus === null || usernameStatus.available) && !isSavingUsername ? "#4ade80" : "var(--mq-text-muted)",
                        opacity: (usernameStatus === null || usernameStatus.available) && !isSavingUsername ? 1 : 0.5,
                      }}
                    >
                      {isSavingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={handleCancelEditName} className="p-2 rounded-lg" style={{ color: "var(--mq-text-muted)" }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {usernameStatus && (
                    <div className="flex items-center gap-1.5 justify-center">
                      {usernameStatus.available ? (
                        <Check className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                      )}
                      <span className="text-xs" style={{ color: usernameStatus.available ? "#4ade80" : "#ef4444" }}>
                        {usernameStatus.available ? "Имя доступно" : (usernameStatus.error || "Имя занято")}
                      </span>
                    </div>
                  )}
                  <p className="text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                    {USERNAME_RULES}
                  </p>
                </div>
              )}
            </div>

            {/* Telegram / email under name */}
            {!isEditingName && (telegramUsername || email) && (
              <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)" }}>
                {telegramUsername ? `@${telegramUsername}` : email}
              </p>
            )}

            {/* Member since badge */}
            {!isEditingName && (
              <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Calendar className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                <span className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  Участник с {accountCreated || memberSince}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Чаты entry point — navigate to messenger
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.08}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="rounded-2xl overflow-hidden cursor-pointer"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.06)" }}
          onClick={() => setView("messenger")}
          whileHover={{ backgroundColor: "var(--mq-card-hover)" }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="px-4 py-4 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
            >
              <MessageCircle className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>Чаты</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                Сообщения и уведомления
              </p>
            </div>
            {(Object.values(unreadCounts).reduce((sum, c) => sum + c, 0) + supportUnreadCount) > 0 && (
              <span
                className="flex-shrink-0 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  color: "#fff",
                }}
              >
                {Object.values(unreadCounts).reduce((sum, c) => sum + c, 0) + supportUnreadCount}
              </span>
            )}
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Settings shortcut — navigate to settings
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.1}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="rounded-2xl overflow-hidden cursor-pointer"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.06)" }}
          onClick={() => setView("settings")}
          whileHover={{ backgroundColor: "var(--mq-card-hover)" }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="px-4 py-4 flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <Settings className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>Настройки</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                Тема, звук, внешний вид
              </p>
            </div>
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Stats Cards — listening stats
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.1}>
        <div className="grid grid-cols-2 gap-3">
          {/* Total tracks played */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-3.5"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.3 }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
            >
              <Music className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.totalTracksPlayed}
              </p>
              <p className="text-[11px] mt-1 truncate font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Треков прослушано
              </p>
            </div>
          </motion.div>

          {/* Hours listened */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-3.5"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
            >
              <Headphones className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.hoursListened > 0 ? `${stats.hoursListened}` : "0"}
              </p>
              <p className="text-[11px] mt-1 truncate font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Часов прослушано
              </p>
            </div>
          </motion.div>

          {/* Favorite genre */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-3.5"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.3 }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
            >
              <TrendingUp className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-none truncate" style={{ color: "var(--mq-text)" }}>
                {stats.topGenre}
              </p>
              <p className="text-[11px] mt-1 truncate font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Любимый жанр
              </p>
            </div>
          </motion.div>

          {/* Liked tracks */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-3.5"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.3 }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
            >
              <Heart className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.likedCount}
              </p>
              <p className="text-[11px] mt-1 truncate font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Избранных
              </p>
            </div>
          </motion.div>
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Listening Activity Chart — past 7 days
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.12}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                Активность за неделю
              </h3>
            </div>
          </div>
          <div className="px-4 pb-4 pt-2">
            <div className="flex items-end gap-2 h-28">
              {listeningActivity.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                    <motion.div
                      initial={animationsEnabled ? { height: 0 } : undefined}
                      animate={{ height: `${Math.max(4, (day.count / maxActivity) * 72)}px` }}
                      transition={{ delay: i * 0.06, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                      className="w-full max-w-[32px] rounded-t-md"
                      style={{
                        backgroundColor: day.count > 0
                          ? "var(--mq-accent)"
                          : "rgba(255,255,255,0.06)",
                        opacity: day.count > 0 ? 0.85 : 1,
                        minHeight: "4px",
                      }}
                    />
                  </div>
                  <span className="text-[11px]" style={{ color: day.count > 0 ? "var(--mq-text)" : "var(--mq-text-muted)" }}>
                    {day.day}
                  </span>
                  {day.count > 0 && (
                    <span className="text-[11px] font-medium" style={{ color: "var(--mq-accent)" }}>
                      {day.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Taste Profile — genres + artists with frequency bars
          ════════════════════════════════════════════ */}
      {(tasteProfileGenres.length > 0 || tasteProfileArtists.length > 0) && (
        <ScrollReveal direction="up" delay={0.15}>
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Disc3 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Музыкальный вкус
                </h3>
              </div>
            </div>

            {/* Genre tags with frequency bars */}
            {tasteProfileGenres.length > 0 && (
              <div className="px-4 pb-3">
                <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                  Жанры
                </p>
                <div className="space-y-2">
                  {tasteProfileGenres.map(({ genre, level, width }) => (
                    <div key={genre} className="flex items-center gap-2">
                      <span className="text-xs font-medium w-20 truncate flex-shrink-0" style={{ color: "var(--mq-text)" }}>
                        {genre}
                      </span>
                      <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                        <motion.div
                          initial={animationsEnabled ? { scaleX: 0 } : undefined}
                          animate={{ scaleX: width / 100 }}
                          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                          className="h-full rounded-full"
                          style={{
                            width: "100%",
                            transformOrigin: "left",
                            willChange: "transform",
                            background: `linear-gradient(90deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, transparent))`,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="text-[11px] w-8 text-right flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                        {level}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Artist tags with frequency bars */}
            {tasteProfileArtists.length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                  Исполнители
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tasteProfileArtists.map(({ artist, level }) => (
                    <span
                      key={artist}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--mq-accent) ${Math.max(8, level * 0.2)}%, transparent)`,
                        color: "var(--mq-text)",
                        border: `1px solid color-mix(in srgb, var(--mq-accent) ${Math.max(10, level * 0.3)}%, transparent)`,
                      }}
                    >
                      {artist}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════
          Achievements — gamification badges
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.15}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden mb-4"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", boxShadow: "var(--mq-shadow-card)" }}
        >
          <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 18%, transparent)" }}>
              <span className="text-xs">🏆</span>
            </div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
              Достижения
            </h3>
            <span className="text-[11px] ml-auto font-medium" style={{ color: "var(--mq-text-muted)" }}>
              {achievements.filter(a => a.unlocked).length} / {achievements.length}
            </span>
          </div>
          <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {achievements.map((ach, i) => (
              <motion.div
                key={ach.id}
                initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.02 * i, type: "spring", stiffness: 400, damping: 25 }}
                whileHover={ach.unlocked ? { scale: 1.05, y: -2 } : {}}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl text-center relative"
                style={{
                  backgroundColor: ach.unlocked ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "rgba(255,255,255,0.02)",
                  border: ach.unlocked ? "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)" : "1px solid rgba(255,255,255,0.04)",
                  opacity: ach.unlocked ? 1 : 0.5,
                }}
              >
                <div className="text-xl" style={{ filter: ach.unlocked ? "none" : "grayscale(1)" }}>{ach.icon}</div>
                <p className="text-[10px] font-bold leading-tight" style={{ color: ach.unlocked ? "var(--mq-text)" : "var(--mq-text-muted)" }}>{ach.title}</p>
                <p className="text-[9px] leading-tight" style={{ color: "var(--mq-text-muted)" }}>{ach.desc}</p>
                {!ach.unlocked && ach.progress > 0 && (
                  <div className="w-full h-0.5 rounded-full mt-0.5 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${ach.progress}%`, backgroundColor: "var(--mq-accent)" }} />
                  </div>
                )}
                {ach.unlocked && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 + 0.02 * i, type: "spring", stiffness: 500, damping: 20 }}
                    className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--mq-accent)" }}
                  >
                    <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Favorite Artists — cards with avatars
          ════════════════════════════════════════════ */}
      {topArtists.length > 0 && (
        <ScrollReveal direction="up" delay={0.18}>
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Любимые исполнители
                </h3>
              </div>
            </div>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-2">
                {topArtists.map((artist, i) => (
                  <motion.div
                    key={artist.name}
                    initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="flex flex-col items-center p-2.5 rounded-xl"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <div
                      className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center mb-1.5"
                      style={{
                        backgroundColor: artist.cover ? "transparent" : "color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                        boxShadow: "var(--mq-shadow-card)",
                      }}
                    >
                      {artist.cover ? (
                        <img src={artist.cover} alt={artist.name} className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-center truncate w-full" style={{ color: "var(--mq-text)" }}>
                      {artist.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                      {artist.count} {artist.count === 1 ? "трек" : artist.count < 5 ? "трека" : "треков"}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════
          Recent Tracks — last 5 played
          ════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <ScrollReveal direction="up" delay={0.2}>
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Недавние треки
                </h3>
              </div>
            </div>
            <div className="px-2 pb-2">
              {recentTracks.map((track, i) => (
                <motion.div
                  key={`${track.id}-${i}`}
                  initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: track.cover ? "transparent" : "rgba(255,255,255,0.05)" }}
                  >
                    {track.cover ? (
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                      {track.title}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                      {track.artist}
                    </p>
                  </div>
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                    {formatTimeAgo(track.playedAt)}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════
          Section: Аккаунт & Приватность
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.22}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Section header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                Аккаунт
              </h3>
            </div>
          </div>

          {/* Telegram row */}
          <div className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--mq-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Telegram / Email</p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--mq-text)" }}>
              {telegramUsername ? `@${telegramUsername}` : email || "—"}
            </p>
          </div>

          {/* Invisible mode toggle */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: hideOnline
                    ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                    : "var(--mq-card)",
                  border: `1px solid ${hideOnline ? "color-mix(in srgb, var(--mq-accent) 30%, transparent)" : "var(--mq-border)"}`,
                }}
              >
                {hideOnline ? (
                  <EyeOff className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <Eye className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                  Невидимка
                </p>
                <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  {hideOnline ? "Вы невидимы для других" : "Ваш статус «В сети» виден всем"}
                </p>
              </div>
            </div>
            <LiquidGlassToggle
              checked={hideOnline}
              onCheckedChange={toggleHideOnline}
              size="md"
            />
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════
          Section: Действия
          ════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.25}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Section header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                Действия
              </h3>
            </div>
          </div>

          {/* Settings link */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setView("settings")}
            className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
            style={{ borderBottom: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}
            >
              <Music className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Настройки приложения</p>
              <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Тема, звук, эквалайзер</p>
            </div>
          </motion.button>

          {/* Logout — cleaner design */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
            style={{ color: "#ff6b6b" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(224,49,49,0.1)" }}
            >
              <LogOut className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Выйти из аккаунта</p>
              <p className="text-[11px]" style={{ color: "rgba(255,107,107,0.6)" }}>Потребуется повторный вход</p>
            </div>
          </motion.button>
        </motion.div>
      </ScrollReveal>

      {/* Logout confirmation dialog — cleaner design */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 text-center"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", boxShadow: "var(--mq-shadow-float)" }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                <LogOut className="w-7 h-7" style={{ color: "#ef4444" }} />
              </div>
              <h3 className="text-lg font-bold mb-1.5" style={{ color: "var(--mq-text)" }}>Выйти из аккаунта?</h3>
              <p className="text-sm mb-6" style={{ color: "var(--mq-text-muted)" }}>Вам придётся войти заново для доступа к музыке и чатам</p>
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                >
                  Остаться
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { logout(); setShowLogoutConfirm(false); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{ backgroundColor: "#ef4444", color: "#fff" }}
                >
                  Выйти
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ProfileView;
