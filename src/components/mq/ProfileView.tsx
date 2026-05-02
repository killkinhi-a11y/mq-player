"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import {
  User, Camera, Edit3, Check, X, LogOut, Heart, MessageCircle, Music, Loader2, AlertCircle, EyeOff, Eye
} from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const USERNAME_RULES = "Буквы, цифры, _ и -. 2-20 символов.";

export default function ProfileView() {
  const {
    username, email, avatar, likedTrackIds, dislikedTrackIds,
    messages, setView, logout, userId, compactMode,
  } = useAppStore();
  const safeLiked = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const safeDisliked = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const safeMessages = Array.isArray(messages) ? messages : [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(username || "");
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; error?: string } | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Invisible mode state (shared with MessengerView via localStorage)
  const [hideOnline, setHideOnline] = useState(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("mq-hide-online") || "false"); } catch { return false; }
    }
    return false;
  });

  // Sync hideOnline to localStorage and dispatch storage event for MessengerView
  const toggleHideOnline = useCallback(() => {
    const newVal = !hideOnline;
    setHideOnline(newVal);
    try { localStorage.setItem("mq-hide-online", JSON.stringify(newVal)); } catch { /* */ }
    // Dispatch storage event so MessengerView picks it up
    window.dispatchEvent(new StorageEvent("storage", { key: "mq-hide-online", newValue: JSON.stringify(newVal) }));
  }, [hideOnline]);

  // Listen for hideOnline changes from MessengerView or other tabs
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
    if (file.size > 2 * 1024 * 1024) return; // 2MB limit

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Resize avatar before storing
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
        // Save locally immediately
        useAppStore.setState({ avatar: resized });
        // Save to server
        const uid = useAppStore.getState().userId;
        if (uid) {
          setIsSavingAvatar(true);
          fetch("/api/user/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar: resized }),
          })
            .then((r) => r.json())
            .catch(() => {})
            .finally(() => setIsSavingAvatar(false));
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Validate username locally
  const validateUsername = useCallback((name: string): string | null => {
    if (name.length < 2) return "Минимум 2 символа";
    if (name.length > 20) return "Максимум 20 символов";
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return "Только буквы, цифры, _ и -";
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(name.toLowerCase())) return "Это имя зарезервировано";
    return null;
  }, []);

  // Debounced username check
  const checkUsernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEditNameChange = useCallback((value: string) => {
    setEditName(value);
    setUsernameStatus(null);

    // Clear previous timeout
    if (checkUsernameTimeout.current) clearTimeout(checkUsernameTimeout.current);

    const localError = validateUsername(value);
    if (localError) {
      setUsernameStatus({ available: false, error: localError });
      return;
    }

    // Don't check if same as current username
    if (value === username) {
      setUsernameStatus(null);
      return;
    }

    // Debounced API check
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
    <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"} max-w-2xl mx-auto`}>
      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
          Профиль
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          Настройте ваш аккаунт
        </p>
      </motion.div>

      {/* Avatar */}
      <ScrollReveal direction="up" delay={0.05}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col items-center"
      >
        <div className="relative group">
          <div
            className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: avatar ? "transparent" : "var(--mq-accent)" }}
          >
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-14 h-14" style={{ color: "var(--mq-text)" }} />
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <Camera className="w-6 h-6" style={{ color: "white" }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 text-sm flex items-center gap-1"
          style={{ color: "var(--mq-accent)" }}
        >
          <Camera className="w-3.5 h-3.5" />
          Сменить аватарку
        </button>
      </motion.div>
      </ScrollReveal>

      {/* Username */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</span>
          {!isEditingName && (
            <button onClick={() => { setEditName(username || ""); setIsEditingName(true); }}
              className="p-1.5 rounded-lg" style={{ color: "var(--mq-accent)" }}>
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isEditingName ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center rounded-lg px-3 py-2"
                style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${usernameStatus && !usernameStatus.available ? "rgba(239,68,68,0.5)" : "var(--mq-border)"}` }}>
                <span style={{ color: "var(--mq-text-muted)" }}>@</span>
                <input
                  value={editName}
                  onChange={(e) => handleEditNameChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && usernameStatus?.available !== false) handleSaveName(); if (e.key === "Escape") handleCancelEditName(); }}
                  className="flex-1 bg-transparent outline-none text-sm ml-1"
                  style={{ color: "var(--mq-text)" }}
                  maxLength={20}
                  autoFocus
                  autoComplete="off"
                />
                {isCheckingUsername && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />}
              </div>
              <button
                onClick={handleSaveName}
                disabled={isSavingUsername || (usernameStatus !== null && !usernameStatus.available)}
                className="p-2 rounded-lg"
                style={{ color: (usernameStatus === null || usernameStatus.available) && !isSavingUsername ? "#4ade80" : "var(--mq-text-muted)", opacity: (usernameStatus === null || usernameStatus.available) && !isSavingUsername ? 1 : 0.5 }}
              >
                {isSavingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={handleCancelEditName} className="p-2 rounded-lg" style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Status message */}
            {usernameStatus && (
              <div className="flex items-center gap-1.5">
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
            {/* Rules hint */}
            <p className="text-[10px]" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
              {USERNAME_RULES}
            </p>
          </div>
        ) : (
          <p className="text-lg font-semibold" style={{ color: "var(--mq-text)" }}>
            @{username || "User"}
          </p>
        )}
      </motion.div>

      {/* Email */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <span className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Email</span>
        <p className="text-sm font-medium mt-1" style={{ color: "var(--mq-text)" }}>{email || "—"}</p>
      </motion.div>

      {/* Invisible mode toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-2xl p-4 flex items-center justify-between"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: hideOnline ? "var(--mq-accent)" : "var(--mq-card)", border: `1px solid ${hideOnline ? "var(--mq-accent)" : "var(--mq-border)"}`, opacity: hideOnline ? 1 : 0.7 }}>
            {hideOnline ? (
              <EyeOff className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
            ) : (
              <Eye className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
            )}
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
              Невидимка
            </p>
            <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {hideOnline ? "Вы невидимы для других пользователей" : "Ваш статус «В сети» виден всем"}
            </p>
          </div>
        </div>
        <button
          onClick={toggleHideOnline}
          className="relative w-12 h-7 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0"
          style={{ backgroundColor: hideOnline ? "var(--mq-accent)" : "var(--mq-border)" }}
        >
          <div
            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200"
            style={{ transform: hideOnline ? "translateX(22px)" : "translateX(2px)" }}
          />
        </button>
      </motion.div>

      {/* Stats */}
      <ScrollReveal direction="up" delay={0.2}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-2 gap-3"
      >
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
            <Heart className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>{safeLiked.length}</p>
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Избранных</p>
          </div>
        </div>

        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
            <MessageCircle className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>{safeMessages.length}</p>
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Сообщений</p>
          </div>
        </div>
      </motion.div>
      </ScrollReveal>

      {/* Actions */}
      <ScrollReveal direction="up" delay={0.25}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setView("settings")}
          className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
        >
          <Music className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          Настройки приложения
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={logout}
          className="w-full p-3 rounded-xl text-center text-sm font-medium"
          style={{
            backgroundColor: "rgba(224,49,49,0.1)",
            color: "#ff6b6b",
            border: "1px solid rgba(224,49,49,0.2)",
          }}
        >
          <span className="flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" />
            Выйти из аккаунта
          </span>
        </motion.button>
      </motion.div>
      </ScrollReveal>
    </div>
  );
}
