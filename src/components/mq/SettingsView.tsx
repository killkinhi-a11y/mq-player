"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { themes } from "@/lib/themes";
import {
  Palette, Type, Sparkles, Minimize2, Volume2, RotateCcw, Check, Moon, Music, Shield, Zap, User, ChevronDown, ChevronUp, Settings, MessageCircle, Send, X, Loader2, Headphones, Lock, Eye, Server, Trash2, Fingerprint, Cloud, CloudOff, Bot, Sparkles as SparklesIcon, KeyRound, Monitor, Apple, Smartphone, Download, Sun
} from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ScrollReveal from "./ScrollReveal";
import TasteProfileView from "./TasteProfileView";

export default function SettingsView() {
  const {
    currentTheme, setTheme, customAccent, setCustomAccent,
    animationsEnabled, setAnimationsEnabled, compactMode, setCompactMode,
    fontSize, setFontSize, volume, setVolume, logout, username, animationsEnabled: anim, setView,
    liquidGlassMobile, setLiquidGlassMobile, email, avatar,
    lastSyncAt, isSyncing, syncToServer, syncFromServer,
    favoriteArtists, removeFavoriteArtist, saveFavoriteArtistsToServer,
    dislikedTags, removeDislikedTag,
    currentStyle, setStyle, styleVariant, setStyleVariant,
    catEnabled, setCatEnabled, catFrequency, setCatFrequency, catMood, setCatMood, catSize, setCatSize, catPetCount,
  } = useAppStore();

  const ADMIN_EMAILS = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ADMIN_EMAILS) 
    ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(",").map((e: string) => e.trim().toLowerCase())
    : ["killkin.hi@gmail.com"];
  const showAdminLink = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  const [accentInput, setAccentInput] = useState(customAccent || "");
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportMessages, setSupportMessages] = useState<{id:string;role:string;content:string;createdAt:string}[]>([]);
  const [supportInput, setSupportInput] = useState(() => {
    // Restore draft from localStorage
    if (typeof window !== "undefined") {
      try { return localStorage.getItem("mq-support-draft") || ""; } catch {}
    }
    return "";
  });
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSessionId, setSupportSessionId] = useState<string | null>(null);
  const [supportLoadingHistory, setSupportLoadingHistory] = useState(false);
  const supportScrollRef = useRef<HTMLDivElement>(null);
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [autoTheme, setAutoTheme] = useState(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem("mq-auto-theme") === "true"; } catch {}
    }
    return false;
  });
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showCatSettings, setShowCatSettings] = useState(false);
  const [showFullTaste, setShowFullTaste] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const styleList = [
    { id: "ipod-2001", name: "iPod 2001" },
    { id: "japan", name: "Japan" },
    { id: "swag", name: "Silver" },
    { id: "neon", name: "Neon" },
    { id: "minimal", name: "Minimal" },
  ];
  const { supportUnreadCount, setSupportUnreadCount } = useAppStore();

  // Push notifications state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "default">("default");
  const [pushLoading, setPushLoading] = useState(false);

  // Offline / service worker state
  const [swActive, setSwActive] = useState(false);
  const [cachedTracks, setCachedTracks] = useState(0);

  // Detect push permission & service worker on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Notification permission
    if ("Notification" in window) {
      setPushPermission(Notification.permission as NotificationPermission);
    }
    // Check if push subscription already exists
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        setSwActive(true);
        const sub = await reg.pushManager.getSubscription();
        if (sub) setPushEnabled(true);
      });
    }
  }, []);

  // Count cached audio tracks periodically
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    const countAudio = async () => {
      try {
        const cache = await caches.open("mq-audio-v1");
        const keys = await cache.keys();
        setCachedTracks(keys.length);
      } catch {
        setCachedTracks(0);
      }
    };
    countAudio();
    const interval = setInterval(countAudio, 10000);
    return () => clearInterval(interval);
  }, []);

  // Toggle push notifications
  const handlePushToggle = useCallback(async (enabled: boolean) => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (enabled) {
        // Request permission
        if (!("Notification" in window)) {
          alert("Уведомления не поддерживаются этим браузером");
          setPushLoading(false);
          return;
        }
        const perm = await Notification.requestPermission();
        setPushPermission(perm);
        if (perm !== "granted") {
          setPushLoading(false);
          return;
        }
        // Register push subscription
        const reg = await navigator.serviceWorker.ready;
        // Dummy VAPID key — replace with real VAPID applicationServerKey before production use
        const applicationServerKey = "B" + "A".repeat(87);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        setPushEnabled(true);
      } else {
        // Unsubscribe
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
        }
        setPushEnabled(false);
      }
    } catch (err) {
      console.error("[push] Toggle error:", err);
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading]);

  // Clear all caches
  const handleClearCache = useCallback(async () => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      setCachedTracks(0);
    } catch {}
  }, []);

  // Mouse wheel volume control on the volume section — native listener to allow preventDefault
  useEffect(() => {
    const el = volumeSectionRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -3 : 3;
      useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Auto dark/light theme based on system preference
  useEffect(() => {
    if (!autoTheme) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e: MediaQueryList | MediaQueryListEvent) => {
      const dark = e.matches;
      const themeId = dark ? 'midnight' : 'default';
      setTheme(themeId);
    };
    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [autoTheme, setTheme]);

  const themeList = Object.values(themes);

  const handleAccentChange = (color: string) => {
    setAccentInput(color);
    setCustomAccent(color);
  };

  const handleSendSupport = async () => {
    if (!supportInput.trim() || supportLoading) return;
    setSupportLoading(true);
    const text = supportInput.trim();
    setSupportInput("");
    // Clear draft from localStorage
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("mq-support-draft"); } catch {}
    }
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: useAppStore.getState().userId,
          userName: username || null,
          content: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      if (data.sessionId && !supportSessionId) setSupportSessionId(data.sessionId);
      if (data.userMessage && data.botMessage) {
        setSupportMessages(prev => [...prev, data.userMessage, data.botMessage]);
      }
    } catch {
      // silent
    } finally {
      setSupportLoading(false);
    }
  };

  const handleOpenSupport = async () => {
    setShowSupportDialog(true);
    setSupportUnreadCount(0);
    if (supportMessages.length === 0) {
      setSupportLoadingHistory(true);
      try {
        const userId = useAppStore.getState().userId;
 const params = userId ? `userId=${userId}` : '';
        const res = await fetch(`/api/support?${params}`);
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setSupportMessages(data.messages);
          if (data.sessionId) setSupportSessionId(data.sessionId);
        }
      } catch {
        // silent
      } finally {
        setSupportLoadingHistory(false);
      }
    }
  };

  // Save draft to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try { localStorage.setItem("mq-support-draft", supportInput); } catch {}
    }
  }, [supportInput]);

  // SSE for real-time support messages + push notifications when dialog is open
  useEffect(() => {
    if (!showSupportDialog) return;
    const userId = useAppStore.getState().userId;
    if (!userId) return;

    // Clear unread count when dialog opens
    setSupportUnreadCount(0);

    // Connect to SSE stream
    const params = new URLSearchParams({ userId });
    if (supportSessionId) params.set("sessionId", supportSessionId);
    const evtSource = new EventSource(`/api/support/sse?${params}`);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message) {
          setSupportMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            const msg = {
              id: data.message.id,
              role: data.message.role,
              content: data.message.content,
              createdAt: data.message.createdAt,
            };
            return [...prev, msg];
          });
          // Push notification for admin replies
          if (data.message.role === "admin" && document.hidden) {
            sendPushNotification("MQ Support", data.message.content);
          }
        }
      } catch {}
    };

    return () => {
      evtSource.close();
    };
  }, [showSupportDialog, supportSessionId, setSupportUnreadCount]);

  // Background SSE for push notifications when dialog is closed
  useEffect(() => {
    if (showSupportDialog) return;
    const userId = useAppStore.getState().userId;
    if (!userId) return;

    const evtSource = new EventSource(`/api/support/sse?userId=${userId}`);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message?.role === "admin") {
          setSupportUnreadCount(useAppStore.getState().supportUnreadCount + 1);
          if (document.hidden) {
            sendPushNotification("MQ Support", data.message.content);
          }
        }
      } catch {}
    };

    return () => {
      evtSource.close();
    };
  }, [showSupportDialog, setSupportUnreadCount]);

  // Browser push notification helper
  const sendPushNotification = (title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(perm => {
        if (perm === "granted") {
          new Notification(title, { body, icon: "/favicon.ico" });
        }
      });
    }
  };

  useEffect(() => {
    if (supportMessages.length > 0 && supportScrollRef.current) {
      supportScrollRef.current.scrollTop = supportScrollRef.current.scrollHeight;
    }
  }, [supportMessages]);

  // Helper: convert base64 VAPID key to Uint8Array for pushManager.subscribe
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  };

  const presetAccents = ["#e03131", "#8b5cf6", "#4ade80", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"} max-w-2xl mx-auto`}>
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
          Настройки
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          Персонализируйте ваш mq
        </p>
      </motion.div>

      {/* Profile */}
      <ScrollReveal direction="up" delay={0.05}>
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-4">
          {avatar ? (
            <img
              src={avatar}
              alt="avatar"
              className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid var(--mq-accent)" }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              {username?.charAt(0)?.toUpperCase() || "U"}
            </div>
          )}
          <div>
            <p className="font-semibold" style={{ color: "var(--mq-text)" }}>{username}</p>
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              <Music className="w-3 h-3 inline mr-1" />
              mq Premium
            </p>
          </div>
        </div>
      </motion.div>
      </ScrollReveal>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView("profile")}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <User className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Настройки профиля
      </motion.button>

      {/* Password Reset — only for email-based users */}
      {email && !email.startsWith("tg_") && (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowPasswordReset(true)}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <KeyRound className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Сменить пароль
      </motion.button>
      )}

      {/* Spatial Audio */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView("spatial")}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <Headphones className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Spatial Audio
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: useAppStore.getState().spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-surface, #1a1a1a)",
            color: useAppStore.getState().spatialAudioEnabled ? "#fff" : "var(--mq-text-muted)",
          }}>
          {useAppStore.getState().spatialAudioEnabled ? "ON" : "OFF"}
        </span>
      </motion.button>

      {showAdminLink && (
        <motion.a
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          href="/admin"
          className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3 block"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
        >
          <Settings className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          Панель администратора
        </motion.a>
      )}

      {/* Musical Tastes — Full Profile */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowFullTaste(!showFullTaste)}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <Palette className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Музыкальные вкусы
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: showFullTaste ? "var(--mq-accent)" : "var(--mq-surface, #1a1a1a)",
            color: showFullTaste ? "#fff" : "var(--mq-text-muted)",
          }}>
          {showFullTaste ? "Открыто" : "Настроить"}
        </span>
        {showFullTaste ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </motion.button>

      <AnimatePresence>
        {showFullTaste && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              <TasteProfileView />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cat Mascot Settings */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowCatSettings(!showCatSettings)}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <Sparkles className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Котик mq
        <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>
          {catEnabled ? "Включён" : "Выключен"}
        </span>
        {showCatSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </motion.button>

      <AnimatePresence>
        {showCatSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-4 space-y-4"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              {/* Enable/Disable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                    Показывать котика
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    Котик будет появляться и давать советы
                  </p>
                </div>
                <button
                  onClick={() => setCatEnabled(!catEnabled)}
                  className="relative w-10 h-5 rounded-full transition-colors duration-200"
                  style={{ backgroundColor: catEnabled ? "var(--mq-accent)" : "var(--mq-border)" }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
                    style={{
                      backgroundColor: "#fff",
                      transform: catEnabled ? "translateX(20px)" : "translateX(2px)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }}
                  />
                </button>
              </div>

              {/* Frequency */}
              {catEnabled && (
                <>
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>
                      Частота появления
                    </p>
                    <div className="flex gap-2">
                      {([
                        { id: "rare" as const, label: "Редко", desc: "Раз в 5-8 мин" },
                        { id: "normal" as const, label: "Обычно", desc: "Раз в 2-4 мин" },
                        { id: "often" as const, label: "Часто", desc: "Раз в 1-2 мин" },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCatFrequency(opt.id)}
                          className="flex-1 p-2 rounded-xl text-center transition-all"
                          style={{
                            backgroundColor: catFrequency === opt.id ? "rgba(255,255,255,0.06)" : "transparent",
                            border: catFrequency === opt.id ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                          }}
                        >
                          <p className="text-xs font-medium" style={{ color: catFrequency === opt.id ? "var(--mq-accent)" : "var(--mq-text)" }}>
                            {opt.label}
                          </p>
                          <p className="text-[9px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                            {opt.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mood */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>
                      Настроение котика
                    </p>
                    <div className="flex gap-2">
                      {([
                        { id: "friendly" as const, emoji: "😺" },
                        { id: "sassy" as const, emoji: "😼" },
                        { id: "sleepy" as const, emoji: "😴" },
                        { id: "excited" as const, emoji: "😸" },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCatMood(opt.id)}
                          className="flex-1 p-3 rounded-xl text-center transition-all"
                          style={{
                            backgroundColor: catMood === opt.id ? "rgba(255,255,255,0.06)" : "transparent",
                            border: catMood === opt.id ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                          }}
                        >
                          <motion.span
                            className="text-2xl block"
                            animate={catMood === opt.id
                              ? { scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }
                              : {}
                            }
                            transition={{ duration: 0.4, ease: "easeInOut" }}
                          >
                            {opt.emoji}
                          </motion.span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>
                      Размер
                    </p>
                    <div className="flex gap-2">
                      {([
                        { id: "small" as const, label: "Маленький", px: 48 },
                        { id: "medium" as const, label: "Средний", px: 64 },
                        { id: "large" as const, label: "Большой", px: 80 },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCatSize(opt.id)}
                          className="flex-1 p-2 rounded-xl text-center transition-all"
                          style={{
                            backgroundColor: catSize === opt.id ? "rgba(255,255,255,0.06)" : "transparent",
                            border: catSize === opt.id ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                          }}
                        >
                          <div className="flex justify-center mb-1.5">
                            <motion.img
                              src="/mq-cat.png?v=3"
                              alt=""
                              className="object-contain"
                              style={{ width: opt.px, height: opt.px }}
                              animate={catSize === opt.id
                                ? { scale: [1, 1.12, 1], rotate: [0, -4, 4, -2, 0] }
                                : { scale: 0.85 }
                              }
                              transition={catSize === opt.id
                                ? { duration: 0.5, ease: "easeInOut" }
                                : { duration: 0.2 }
                              }
                              draggable={false}
                            />
                          </div>
                          <p className="text-xs font-medium" style={{ color: catSize === opt.id ? "var(--mq-accent)" : "var(--mq-text)" }}>
                            {opt.label}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pet counter */}
                  <div
                    className="rounded-xl p-3 text-center"
                    style={{ backgroundColor: "var(--mq-input-bg, #1a1a1a)", border: "1px solid var(--mq-border)" }}
                  >
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      Всего поглаживаний
                    </p>
                    <p className="text-2xl font-bold mt-1" style={{ color: "var(--mq-accent)" }}>
                      {catPetCount}
                    </p>
                    <p className="text-[9px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                      {catPetCount === 0 ? "Погладьте котика! 🐾" : catPetCount < 10 ? "Котик начинает доверять вам" : catPetCount < 50 ? "Котик вас полюбил! 💕" : catPetCount < 100 ? "Вы — лучший друг котика! 🏆" : "Легендарный кошатник! 👑"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Themes — collapsed by default */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <button
          onClick={() => setShowThemeMenu(!showThemeMenu)}
          className="w-full flex items-center gap-2"
        >
          <Palette className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Тема оформления</h2>
          <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>
            {themeList.find(t => t.id === currentTheme)?.name || "—"}
          </span>
          {showThemeMenu ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </button>

        <AnimatePresence>
          {showThemeMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ScrollReveal direction="up" delay={0.1}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
                {themeList.map((theme) => (
                  <motion.button
                    key={theme.id}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setTheme(theme.id)}
                    className="rounded-xl p-2.5 text-left relative"
                    style={{
                      backgroundColor: theme.background,
                      border: currentTheme === theme.id && !customAccent
                        ? `2px solid ${theme.accent}`
                        : "1px solid var(--mq-border)",
                      boxShadow: currentTheme === theme.id && !customAccent
                        ? `0 0 12px ${theme.glowColor}`
                        : "none",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: theme.accent }}
                      />
                      <span className="text-xs font-medium truncate" style={{ color: theme.text }}>
                        {theme.name}
                      </span>
                    </div>
                    {currentTheme === theme.id && !customAccent && (
                      <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5" style={{ color: theme.accent }} />
                    )}
                  </motion.button>
                ))}
              </div>
              </ScrollReveal>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Styles — collapsed by default */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <button
          onClick={() => setShowStyleMenu(!showStyleMenu)}
          className="w-full flex items-center gap-2"
        >
          <Smartphone className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Стиль интерфейса</h2>
          <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>
            {currentStyle ? styleList.find(s => s.id === currentStyle)?.name : "Стандартный"}
          </span>
          {showStyleMenu ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </button>

        <AnimatePresence>
          {showStyleMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ScrollReveal direction="up" delay={0.15}>
              <div className="space-y-2 mt-4">
                {/* Light/Dark variant toggle — shown when a style is active */}
                {currentStyle && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg, #1a1a1a)", border: "1px solid var(--mq-border)" }}>
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" style={{ color: styleVariant === "light" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      <Moon className="w-4 h-4" style={{ color: !styleVariant ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                        {!styleVariant ? "Тёмная" : "Светлая"}
                      </span>
                    </div>
                    <button
                      onClick={() => setStyleVariant(styleVariant === "light" ? "" : "light")}
                      className="relative w-10 h-5 rounded-full transition-colors duration-200"
                      style={{ backgroundColor: styleVariant === "light" ? "var(--mq-accent)" : "var(--mq-border)" }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
                        style={{
                          backgroundColor: "#fff",
                          transform: styleVariant === "light" ? "translateX(20px)" : "translateX(2px)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* Standard / None option */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: !currentStyle ? "var(--mq-input-bg)" : "transparent",
                    border: !currentStyle ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: default MQ Player style */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#1a1a1a", borderRadius: 6 }}>
                    <div className="absolute top-1 left-1 w-4 h-1" style={{ backgroundColor: "#e03131", borderRadius: 0 }} />
                    <div className="absolute top-1 right-1 w-3 h-3" style={{ backgroundColor: "#333", borderRadius: 0 }} />
                    <div className="absolute bottom-1 left-1 right-1 h-3" style={{ backgroundColor: "#252525", borderRadius: 0 }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Стандартный</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Обычный вид mq</p>
                  </div>
                  {!currentStyle && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>

                {/* iPod 2001 */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("ipod-2001")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: currentStyle === "ipod-2001" ? "var(--mq-input-bg)" : "transparent",
                    border: currentStyle === "ipod-2001" ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: iPod 2001 dark LCD screen */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#000000", borderRadius: 6, border: "1px solid #333333" }}>
                    <div className="absolute top-0.5 left-1.5 right-1.5 h-2.5" style={{ backgroundColor: "#2a7fff", borderRadius: 0 }} />
                    <div className="absolute top-0.5 left-2.5 h-2.5" style={{ backgroundColor: "#ffffff", borderRadius: 0, opacity: 0.9, width: 14 }} />
                    <div className="absolute top-3.5 left-1.5" style={{ color: "#ffffff", fontSize: 6, lineHeight: 1 }}>Song</div>
                    <div className="absolute top-4.5 left-1.5" style={{ color: "#666666", fontSize: 4, lineHeight: 1 }}>Artist</div>
                    <div className="absolute bottom-1 left-1.5 right-1.5 h-0.5" style={{ backgroundColor: "#1a1a1a", borderRadius: 0 }} />
                    <div className="absolute bottom-1 left-1.5 w-3 h-0.5" style={{ backgroundColor: "#2a7fff", borderRadius: 0 }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>iPod 2001</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Оригинальный Apple iPod</p>
                  </div>
                  {currentStyle === "ipod-2001" && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>

                {/* Japan */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("japan")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: currentStyle === "japan" ? "var(--mq-input-bg)" : "transparent",
                    border: currentStyle === "japan" ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: Japan zen style */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#f0ebe3", borderRadius: 6, border: "1px solid #ddd5c8" }}>
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, transparent, #e8b4bc, #8b2252, #e8b4bc, transparent)", opacity: 0.5 }} />
                    <div className="absolute top-1.5 left-1.5" style={{ color: "#1a1a1a", fontSize: 5, fontFamily: "serif", lineHeight: 1 }}>Song</div>
                    <div className="absolute top-3 left-1.5" style={{ color: "#8a7e72", fontSize: 3.5, fontFamily: "serif", lineHeight: 1 }}>Artist</div>
                    <div className="absolute bottom-1 left-1.5 right-1.5 h-0.5" style={{ backgroundColor: "#ddd5c8", borderRadius: 1 }} />
                    <div className="absolute bottom-1 left-1.5 w-2 h-0.5" style={{ backgroundColor: "#8b2252", borderRadius: 1 }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Japan</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Дзен, бумага, киноварь</p>
                  </div>
                  {currentStyle === "japan" && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>

                {/* Swag */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("swag")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: currentStyle === "swag" ? "var(--mq-input-bg)" : "transparent",
                    border: currentStyle === "swag" ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: Silver chromium — radial ring + geometric shapes */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#07070a", borderRadius: 6, border: "1px solid #222229" }}>
                    {/* Center ring */}
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 18, height: 18, marginTop: -9, marginLeft: -9, border: "0.5px solid rgba(176,176,184,0.2)", borderRadius: "50%" }} />
                    {/* Radial bars (decorative) */}
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 4, marginTop: -10, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.35)", transform: "rotate(0deg)", transformOrigin: "center 10px" }} />
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 3, marginTop: -9, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.25)", transform: "rotate(60deg)", transformOrigin: "center 9px" }} />
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 5, marginTop: -11, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.3)", transform: "rotate(120deg)", transformOrigin: "center 11px" }} />
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 3, marginTop: -9, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.2)", transform: "rotate(180deg)", transformOrigin: "center 9px" }} />
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 4, marginTop: -10, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.3)", transform: "rotate(240deg)", transformOrigin: "center 10px" }} />
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 1, height: 2, marginTop: -8, marginLeft: -0.5, backgroundColor: "rgba(176,176,184,0.2)", transform: "rotate(300deg)", transformOrigin: "center 8px" }} />
                    {/* Song text */}
                    <div className="absolute top-0.5 left-1" style={{ color: "#e8e8ec", fontSize: 4.5, fontFamily: "var(--font-space-grotesk), system-ui, sans-serif", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>S</div>
                    <div className="absolute bottom-0.5 right-0.5" style={{ color: "#4a4a56", fontSize: 3, lineHeight: 1 }}>A</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Silver</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Хром, созвездие, геометрия</p>
                  </div>
                  {currentStyle === "swag" && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>

                {/* Neon */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("neon")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: currentStyle === "neon" ? "var(--mq-input-bg)" : "transparent",
                    border: currentStyle === "neon" ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: Cyberpunk neon glow */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#0a0a14", borderRadius: 6, border: "1px solid #1e1e33" }}>
                    {/* Thin neon green line */}
                    <div className="absolute" style={{ top: "50%", left: 1.5, right: 1.5, height: 1, marginTop: -0.5, background: "linear-gradient(90deg, transparent, #00ff88, transparent)", opacity: 0.6 }} />
                    {/* Small green dot */}
                    <div className="absolute" style={{ top: 3.5, left: 5, width: 3, height: 3, backgroundColor: "#00ff88", borderRadius: "50%", boxShadow: "0 0 4px rgba(0,255,136,0.6)" }} />
                    {/* Faint pink dot */}
                    <div className="absolute" style={{ bottom: 2.5, right: 3, width: 2, height: 2, backgroundColor: "#ff0066", borderRadius: "50%", boxShadow: "0 0 3px rgba(255,0,102,0.4)" }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Neon</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Киберпанк, неон, пульс</p>
                  </div>
                  {currentStyle === "neon" && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>

                {/* Minimal */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStyle("minimal")}
                  className="w-full p-3 text-left relative flex items-center gap-3"
                  style={{
                    backgroundColor: currentStyle === "minimal" ? "var(--mq-input-bg)" : "transparent",
                    border: currentStyle === "minimal" ? `2px solid var(--mq-accent)` : "1px solid var(--mq-border)",
                  }}
                >
                  {/* Mini preview: Ultra-clean stark white */}
                  <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#ffffff", borderRadius: 6, border: "1px solid #e5e5e5" }}>
                    {/* Thin black line */}
                    <div className="absolute" style={{ top: "50%", left: 2, right: 2, height: 1, marginTop: -0.5, backgroundColor: "#111111", opacity: 0.3 }} />
                    {/* Small black dot */}
                    <div className="absolute" style={{ top: "50%", left: "50%", width: 3, height: 3, marginTop: -1.5, marginLeft: -1.5, backgroundColor: "#111111", borderRadius: "50%" }} />
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Minimal</span>
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Минимализм, чистота, шрифт</p>
                  </div>
                  {currentStyle === "minimal" && (
                    <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  )}
                </motion.button>
              </div>
              </ScrollReveal>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Accent color */}
      <ScrollReveal direction="up" delay={0.2}>
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Цвет акцента</h2>
          </div>
          {customAccent && (
            <button
              onClick={() => { setCustomAccent(null); setAccentInput(""); }}
              className="text-xs flex items-center gap-1"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <RotateCcw className="w-3 h-3" />
              Сбросить
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {presetAccents.map((color) => (
            <motion.button
              key={color}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleAccentChange(color)}
              className="w-8 h-8 rounded-full"
              style={{
                backgroundColor: color,
                border: customAccent === color ? "2px solid white" : "2px solid transparent",
                boxShadow: customAccent === color ? `0 0 12px ${color}` : "none",
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accentInput || "#e03131"}
            onChange={(e) => handleAccentChange(e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border-0"
          />
          <input
            type="text"
            value={accentInput}
            onChange={(e) => {
              const v = e.target.value;
              setAccentInput(v);
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) setCustomAccent(v);
            }}
            placeholder="#e03131"
            className="flex-1 rounded-lg px-3 py-2 text-sm font-mono"
            style={{
              backgroundColor: "var(--mq-input-bg)",
              border: "1px solid var(--mq-border)",
              color: "var(--mq-text)",
            }}
          />
        </div>
      </motion.div>
      </ScrollReveal>

      {/* Toggles */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl p-4 space-y-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Поведение</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Анимации</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Плавные переходы и эффекты</p>
            </div>
          </div>
          <Switch
            checked={animationsEnabled}
            onCheckedChange={setAnimationsEnabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Minimize2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Компактный режим</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Уменьшить отступы и элементы</p>
            </div>
          </div>
          <Switch
            checked={compactMode}
            onCheckedChange={setCompactMode}
          />
        </div>

        {/* Liquid Glass — only on mobile */}
        <div className="flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Liquid Glass (мобильная)</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Стеклянный эффект на мобильном</p>
            </div>
          </div>
          <Switch checked={liquidGlassMobile} onCheckedChange={setLiquidGlassMobile} />
        </div>

        {/* Auto theme */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Moon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Авто-тема</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Тёмная/светлая по настройке системы</p>
            </div>
          </div>
          <Switch
            checked={autoTheme}
            onCheckedChange={(v) => {
              setAutoTheme(v);
              try { localStorage.setItem("mq-auto-theme", v ? "true" : "false"); } catch {}
            }}
          />
        </div>
      </motion.div>

      {/* Notifications — Push */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 space-y-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Уведомления</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {pushLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
            ) : (
              <CloudOff className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            )}
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Push-уведомления</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                Получать уведомления о новых сообщениях, даже когда вкладка закрыта
              </p>
            </div>
          </div>
          <Switch
            checked={pushEnabled}
            onCheckedChange={handlePushToggle}
            disabled={pushLoading}
          />
        </div>

        {pushPermission && (
          <div className="flex items-center gap-2 ml-7">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor:
                  pushPermission === "granted"
                    ? "#4ade80"
                    : pushPermission === "denied"
                    ? "#ef4444"
                    : "#f59e0b",
              }}
            />
            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              Статус:{" "}
              {pushPermission === "granted"
                ? "разрешено"
                : pushPermission === "denied"
                ? "заблокировано"
                : "не запрошено"}
            </span>
          </div>
        )}
      </motion.div>

      {/* Offline — Service Worker */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 space-y-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudOff className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Офлайн</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: swActive ? "#4ade80" : "#ef4444" }}
            />
            <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
              Service Worker {swActive ? "активен" : "неактивен"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Треков кэшировано офлайн
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--mq-accent)" }}>
            {cachedTracks} / 20
          </span>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleClearCache}
          className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: "var(--mq-input-bg)",
            color: "var(--mq-text)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <Trash2 className="w-3 h-3" />
          Очистить кэш
        </motion.button>
      </motion.div>

      {/* Font size */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Type className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Размер шрифта</h2>
          <span className="ml-auto text-sm font-mono" style={{ color: "var(--mq-accent)" }}>
            {fontSize}px
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>A</span>
          <input
            type="range"
            min="12"
            max="22"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
            style={{
              backgroundColor: "var(--mq-border)",
              accentColor: "var(--mq-accent)",
            }}
          />
          <span className="text-lg" style={{ color: "var(--mq-text-muted)" }}>A</span>
        </div>
      </motion.div>

      {/* Volume — hover expand + scroll wheel */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Громкость</h2>
          <span className="ml-auto text-sm font-mono" style={{ color: "var(--mq-accent)" }}>
            {Math.round(volume)}%
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--mq-text-muted)" }}>Колёсико мыши для регулировки</p>
        <div ref={volumeSectionRef} className="w-full">
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              backgroundColor: "var(--mq-border)",
              accentColor: "var(--mq-accent)",
            }}
          />
        </div>
      </motion.div>

      {/* Data Protection */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Защита данных</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#4ade80" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Сквозное шифрование</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Все сообщения шифруются AES-256-GCM. Содержимое читаете только вы и собеседник.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Server className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#4ade80" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Защищённое соединение</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Весь трафик передаётся по HTTPS с TLS 1.3. Данные невозможно перехватить.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#4ade80" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Конфиденциальность</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Мы не продаём, не передаём и не используем ваши данные для рекламы. Никаких third-party трекеров.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Fingerprint className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#4ade80" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Аутентификация</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Пароли хешируются bcrypt (10 rounds). Email-верификация при регистрации.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Trash2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#4ade80" }} />
            <div>
              <p className="text-sm" style={{ color: "var(--mq-text)" }}>Право на удаление</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Вы можете запросить полное удаление аккаунта и всех связанных данных через поддержку.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--mq-border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4ade80" }} />
            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              Все проверки пройдены — ваши данные защищены
            </span>
          </div>
        </div>
      </motion.div>

      {/* Cloud Sync */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 space-y-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Облачная синхронизация</span>
          </div>
          {isSyncing && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
          )}
          {!isSyncing && lastSyncAt && (
            <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
              {new Date(lastSyncAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          История, плейлисты, лайки и настройки сохраняются на сервере. Данные будут доступны на любом устройстве после входа в аккаунт.
        </p>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { syncFromServer(); }}
            disabled={isSyncing}
            className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: isSyncing ? "var(--mq-border)" : "var(--mq-input-bg)",
              color: isSyncing ? "var(--mq-text-muted)" : "var(--mq-text)",
              border: "1px solid var(--mq-border)",
            }}
          >
            <Server className="w-3 h-3" />
            Загрузить с сервера
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { syncToServer(); }}
            disabled={isSyncing}
            className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: isSyncing ? "var(--mq-border)" : "var(--mq-accent)",
              color: isSyncing ? "var(--mq-text-muted)" : "var(--mq-text)",
              opacity: isSyncing ? 0.5 : 1,
            }}
          >
            <Cloud className="w-3 h-3" />
            Сохранить на сервер
          </motion.button>
        </div>
      </motion.div>

      {/* Desktop App Download */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Monitor className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>Приложение для компьютера</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>
          Установите mq как нативное приложение. Автоматические обновления, ярлык на рабочем столе, работа в фоновом режиме.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Windows */}
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-opacity active:opacity-80"
            style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)" }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(59,130,246,0.12)" }}>
              <Monitor className="w-5 h-5" style={{ color: "#3b82f6" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>Windows</p>
              <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>.zip установщик (117 MB)</p>
            </div>
            <Download className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          </motion.a>

          {/* macOS */}
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player.dmg"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-opacity active:opacity-80"
            style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)" }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(168,85,247,0.12)" }}>
              <Apple className="w-5 h-5" style={{ color: "#a855f7" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>macOS</p>
              <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>.dmg образ</p>
            </div>
            <Download className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          </motion.a>

          {/* Linux */}
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player.AppImage"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-opacity active:opacity-80"
            style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)" }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(234,179,8,0.12)" }}>
              <Smartphone className="w-5 h-5" style={{ color: "#eab308" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>Linux</p>
              <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>.AppImage</p>
            </div>
            <Download className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          </motion.a>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4ade80" }} />
          <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
            Версия 1.0.1 — работает как обёртка над веб-версией, все данные синхронизируются через аккаунт
          </span>
        </div>
      </motion.div>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordReset} onOpenChange={setShowPasswordReset}>
        <DialogContent style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
          color: "var(--mq-text)",
          maxWidth: 400,
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              Сменить пароль
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Код подтверждения будет отправлен вам
          </p>
          {error && (
            <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const res = await fetch("/api/auth/send-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) { setError(data.error || "Ошибка"); return; }
                logout();
                setShowPasswordReset(false);
                setView("auth");
              } catch {
                setError("Ошибка соединения");
              } finally {
                setLoading(false);
              }
            }}
              disabled={loading}
              className="flex-1 min-h-[40px]"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Отправить код"}
            </Button>
            <Button onClick={() => { setShowPasswordReset(false); setError(null); }}
              className="flex-1 min-h-[40px]"
              style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Support */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { handleOpenSupport(); }}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <Headphones className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Чат с поддержкой
        {supportUnreadCount > 0 && (
          <span
            className="ml-auto min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
          >
            {supportUnreadCount > 99 ? "99+" : supportUnreadCount}
          </span>
        )}
      </motion.button>

      {/* Delete Account */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setShowDeleteAccount(true); setDeleteConfirmText(""); setDeleteError(null); }}
        className="w-full p-3 rounded-xl text-center text-sm font-medium"
        style={{
          backgroundColor: "rgba(224,49,49,0.05)",
          color: "#ef4444",
          border: "1px solid rgba(224,49,49,0.1)",
        }}
      >
        <div className="flex items-center justify-center gap-2">
          <Trash2 className="w-4 h-4" />
          Удалить аккаунт
        </div>
      </motion.button>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount}>
        <DialogContent style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid rgba(224,49,49,0.2)",
          color: "var(--mq-text)",
          maxWidth: 400,
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Удалить аккаунт
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              Это действие необратимо. Все ваши данные, сообщения, друзья, плейлисты и история будут полностью удалены.
            </p>
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              Введите <strong style={{ color: "#ef4444" }}>УДАЛИТЬ</strong> для подтверждения:
            </p>
            {deleteError && (
              <p className="text-sm" style={{ color: "#ef4444" }}>{deleteError}</p>
            )}
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="УДАЛИТЬ"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            />
            <div className="flex gap-2 mt-4">
              <Button
                onClick={async () => {
                  if (deleteConfirmText !== "УДАЛИТЬ") {
                    setDeleteError("Введите УДАЛИТЬ для подтверждения");
                    return;
                  }
                  setDeleteLoading(true);
                  setDeleteError(null);
                  try {
                    const state = useAppStore.getState();
                    const res = await fetch("/api/user/delete-account", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      setDeleteError(data.error || "Ошибка удаления");
                      return;
                    }
                    setShowDeleteAccount(false);
                    logout();
                  } catch {
                    setDeleteError("Ошибка соединения");
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
                disabled={deleteLoading || deleteConfirmText !== "УДАЛИТЬ"}
                className="flex-1 min-h-[40px]"
                style={{ backgroundColor: "#ef4444", color: "#fff" }}
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Удалить навсегда"}
              </Button>
              <Button
                onClick={() => { setShowDeleteAccount(false); setDeleteError(null); }}
                className="flex-1 min-h-[40px]"
                style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout */}
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
        Выйти из аккаунта
      </motion.button>

      {/* Support Chat Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: "var(--mq-text)",
            maxWidth: 520,
            height: "70vh",
            maxHeight: 600,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DialogHeader className="px-4 pt-4 pb-0 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--mq-text)" }}>
              <Headphones className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              Чат с поддержкой
            </DialogTitle>
            <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: "var(--mq-text-muted)" }}>
              <Bot className="w-3 h-3" style={{ color: "#06b6d4" }} />
              AI-бот отвечает мгновенно, администратор — в рабочее время
            </p>
          </DialogHeader>

          {/* Messages area */}
          <div
            ref={supportScrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
          >
            {supportLoadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-accent)" }} />
              </div>
            ) : supportMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}>
                  <Bot className="w-6 h-6" style={{ color: "#06b6d4" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Начните чат с поддержкой</p>
                <p className="text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>Опишите проблему, и бот поможет или передаст администратору</p>
              </div>
            ) : (
              supportMessages.map((msg) => {
                const isUser = msg.role === "user";
                const isBot = msg.role === "bot";
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[85%]">
                      {isBot && (
                        <p className="text-[10px] font-medium mb-1 flex items-center gap-1" style={{ color: "#06b6d4" }}>
                          <Bot className="w-2.5 h-2.5" /> MQ Bot
                        </p>
                      )}
                      {msg.role === "admin" && (
                        <p className="text-[10px] font-medium mb-1" style={{ color: "var(--mq-accent)" }}>Администратор</p>
                      )}
                      <div
                        className="rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                        style={{
                          backgroundColor: isUser ? "var(--mq-accent)" : isBot ? "rgba(6,182,212,0.08)" : "rgba(224,49,49,0.1)",
                          color: isUser ? "var(--mq-text)" : "var(--mq-text)",
                          border: `1px solid ${isUser ? "var(--mq-accent)" : isBot ? "rgba(6,182,212,0.2)" : "rgba(224,49,49,0.15)"}`,
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input area */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendSupport(); }}
            className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
            style={{ borderTop: "1px solid var(--mq-border)" }}
          >
            <input
              type="text"
              value={supportInput}
              onChange={(e) => setSupportInput(e.target.value)}
              placeholder="Напишите сообщение..."
              disabled={supportLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm"
              style={{
                backgroundColor: "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            />
            <button
              type="submit"
              disabled={supportLoading || !supportInput.trim()}
              className="p-2.5 rounded-xl flex-shrink-0"
              style={{
                backgroundColor: supportInput.trim() ? "var(--mq-accent)" : "var(--mq-border)",
                color: "var(--mq-text)",
                opacity: !supportInput.trim() ? 0.5 : 1,
              }}
            >
              {supportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
