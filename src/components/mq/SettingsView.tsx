"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { themes, seasonalThemes } from "@/lib/themes";
import {
  Palette, Type, Sparkles, Minimize2, Volume2, RotateCcw, Check, Moon, Music, Shield, Zap, User, ChevronDown, ChevronUp, ChevronRight, Settings, MessageCircle, Send, X, Loader2, Headphones, Lock, Eye, Server, Trash2, Fingerprint, Cloud, CloudOff, Bot, Sparkles as SparklesIcon, KeyRound, Monitor, Apple, Smartphone, Download, Sun, ThumbsDown, ArrowLeftRight, Bell, Info, LogOut, PenLine, SlidersHorizontal, AudioWaveform, Search, Gauge
} from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { LiquidGlassToggle } from "@/components/ui/liquid-glass-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ScrollReveal from "./ScrollReveal";
import TasteProfileView from "./TasteProfileView";
import { setCrossfadeEnabled as engineSetCrossfadeEnabled, setCrossfadeDuration as engineSetCrossfadeDuration, setGaplessEnabled as engineSetGaplessEnabled } from "@/lib/audioEngine";
import { toast } from "@/hooks/use-toast";
import EqualizerView from "./EqualizerView";

// ── Reusable section header ──
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--mq-accent) 18%, transparent)",
        }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
        {title}
      </span>
    </div>
  );
}

// ── Reusable setting row with toggle ──
function SettingToggle({
  icon: Icon,
  label,
  subtitle,
  value,
  onCheckedChange,
  disabled,
  valueLabel,
}: {
  icon: React.ElementType;
  label: string;
  subtitle?: string;
  value: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  valueLabel?: string;
}) {
  return (
    <div
      className="px-4 py-4 sm:py-3.5 flex items-center justify-between gap-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 sm:w-auto sm:h-auto rounded-lg flex items-center justify-center flex-shrink-0 sm:contents"
          style={{ backgroundColor: value ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "rgba(255,255,255,0.06)" }}>
          <Icon className="w-4 h-4" style={{ color: value ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] sm:text-sm font-medium" style={{ color: "var(--mq-text)" }}>{label}</p>
            {valueLabel && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: value ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: value ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                {valueLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
        </div>
      </div>
      <Switch checked={value} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

// ── Reusable setting row with navigation ──
function SettingNav({
  icon: Icon,
  label,
  subtitle,
  onClick,
  valueLabel,
  accentIcon,
  iconAccent,
}: {
  icon: React.ElementType;
  label: string;
  subtitle?: string;
  onClick: () => void;
  valueLabel?: string;
  accentIcon?: boolean;
  iconAccent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-4 sm:py-3.5 text-left flex items-center gap-3 transition-colors active:bg-white/[0.06] sm:active:bg-transparent hover:bg-white/[0.03]"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "var(--mq-text)" }}
    >
      <div className="w-8 h-8 sm:w-auto sm:h-auto rounded-lg flex items-center justify-center flex-shrink-0 sm:contents"
        style={{ backgroundColor: iconAccent ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "rgba(255,255,255,0.06)" }}>
        <Icon className="w-4 h-4" style={{ color: iconAccent ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] sm:text-sm font-medium" style={{ color: "var(--mq-text)" }}>{label}</p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
      </div>
      {valueLabel && (
        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: accentIcon ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: accentIcon ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
          {valueLabel}
        </span>
      )}
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
    </button>
  );
}

// ── Reusable section card ──
const sectionCardStyle: React.CSSProperties = {
  backgroundColor: "var(--mq-card)",
  border: "1px solid var(--mq-border)",
  boxShadow: "var(--mq-shadow-card)",
};

// ── Inline mascot preview for settings ──
function MascotPreview({ size, isSelected }: { size: number; isSelected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    lastTimeRef.current = performance.now();

    const draw = (timestamp: number) => {
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      phaseRef.current += dt;
      const t = phaseRef.current;
      const s = size;
      const cx = s / 2;
      const cy = s / 2 + s * 0.02;
      const bounce = Math.sin(t * 3.2) * s * 0.006;

      ctx.clearRect(0, 0, s, s);
      ctx.save();
      ctx.translate(0, bounce);

      const bw = s * 0.38;
      const bh = s * 0.30;
      const bodyY = cy;
      const OL = "#000000";
      const outlineW = Math.max(1.5, s * 0.016);
      const SKIN = "#FEF8EC";

      // Ground shadow
      ctx.beginPath();
      ctx.ellipse(cx, bodyY + bh + s * 0.14, bw * 0.65, s * 0.015, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fill();

      // Body
      const bodyGrad = ctx.createRadialGradient(cx - bw * 0.15, bodyY - bh * 0.3, bh * 0.08, cx, bodyY, bw * 1.1);
      bodyGrad.addColorStop(0, "#FFFCF2");
      bodyGrad.addColorStop(0.45, SKIN);
      bodyGrad.addColorStop(1, "#F5ECD5");
      ctx.beginPath();
      ctx.ellipse(cx, bodyY, bw, bh, 0, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.strokeStyle = OL;
      ctx.lineWidth = outlineW;
      ctx.stroke();

      // Collar + Tie
      ctx.strokeStyle = OL;
      ctx.lineWidth = outlineW;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.32, bodyY - bh * 0.05);
      ctx.lineTo(cx - bw * 0.05, bodyY + bh * 0.17);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + bw * 0.32, bodyY - bh * 0.05);
      ctx.lineTo(cx + bw * 0.05, bodyY + bh * 0.17);
      ctx.stroke();

      const tieW = bw * 0.09;
      const tieH = bh * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx - tieW, bodyY);
      ctx.lineTo(cx + tieW, bodyY);
      ctx.lineTo(cx + tieW * 0.65, bodyY + tieH);
      ctx.lineTo(cx, bodyY + tieH + bh * 0.06);
      ctx.lineTo(cx - tieW * 0.65, bodyY + tieH);
      ctx.closePath();
      ctx.fillStyle = "#000000";
      ctx.fill();

      // Hair
      const hairBaseY = bodyY - bh * 0.88;
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.38, hairBaseY + bh * 0.34);
      ctx.bezierCurveTo(cx - bw * 0.58, hairBaseY - bh * 0.1, cx - bw * 0.25, hairBaseY - bh * 0.32, cx + bw * 0.08, hairBaseY - bh * 0.17);
      ctx.bezierCurveTo(cx + bw * 0.4, hairBaseY - bh * 0.02, cx + bw * 0.5, hairBaseY + bh * 0.18, cx + bw * 0.43, hairBaseY + bh * 0.34);
      ctx.quadraticCurveTo(cx + bw * 0.12, hairBaseY + bh * 0.5, cx - bw * 0.38, hairBaseY + bh * 0.34);
      ctx.closePath();
      ctx.fillStyle = "#CC9000";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.34, hairBaseY + bh * 0.30);
      ctx.bezierCurveTo(cx - bw * 0.52, hairBaseY - bh * 0.07, cx - bw * 0.2, hairBaseY - bh * 0.28, cx + bw * 0.06, hairBaseY - bh * 0.14);
      ctx.bezierCurveTo(cx + bw * 0.36, hairBaseY, cx + bw * 0.46, hairBaseY + bh * 0.16, cx + bw * 0.39, hairBaseY + bh * 0.30);
      ctx.quadraticCurveTo(cx + bw * 0.08, hairBaseY + bh * 0.46, cx - bw * 0.34, hairBaseY + bh * 0.30);
      ctx.closePath();
      ctx.fillStyle = "#F8C400";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.28, hairBaseY + bh * 0.22);
      ctx.quadraticCurveTo(cx - bw * 0.15, hairBaseY - bh * 0.1, cx + bw * 0.02, hairBaseY + bh * 0.02);
      ctx.strokeStyle = "#FCCC08";
      ctx.lineWidth = Math.max(1, s * 0.014);
      ctx.stroke();

      // Face
      const faceY = bodyY - bh * 0.18;
      const eyeSpacing = bw * 0.26;
      const eyeW = bw * 0.11;
      const eyeH = bw * 0.15;

      const drawHappyEye = (ex: number, ey: number) => {
        ctx.beginPath();
        ctx.moveTo(ex - eyeW * 0.7, ey);
        ctx.quadraticCurveTo(ex, ey - eyeH * 0.35, ex + eyeW * 0.7, ey);
        ctx.strokeStyle = OL;
        ctx.lineWidth = Math.max(1.2, outlineW);
        ctx.lineCap = "round";
        ctx.stroke();
      };
      drawHappyEye(cx - eyeSpacing, faceY);
      drawHappyEye(cx + eyeSpacing, faceY);

      // Blush
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing - eyeW * 0.3, faceY + eyeH * 0.6, eyeW * 0.45, eyeH * 0.22, -0.1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,130,130,0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing + eyeW * 0.3, faceY + eyeH * 0.6, eyeW * 0.45, eyeH * 0.22, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,130,130,0.25)";
      ctx.fill();

      // Smile
      const mouthY = faceY + eyeH * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - eyeW * 0.5, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + eyeH * 0.3, cx + eyeW * 0.5, mouthY);
      ctx.strokeStyle = OL;
      ctx.lineWidth = Math.max(1, outlineW * 0.7);
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size]);

  return (
    <motion.div
      animate={isSelected ? { scale: [1, 1.12, 1], rotate: [0, -4, 4, -2, 0] } : { scale: 0.85 }}
      transition={isSelected ? { duration: 0.5, ease: "easeInOut" } : { duration: 0.2 }}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="object-contain"
        draggable={false}
      />
    </motion.div>
  );
}

export default function SettingsView() {
  const currentTheme = useAppStore((s) => s.currentTheme);
  const setTheme = useAppStore((s) => s.setTheme);
  const customAccent = useAppStore((s) => s.customAccent);
  const setCustomAccent = useAppStore((s) => s.setCustomAccent);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const setAnimationsEnabled = useAppStore((s) => s.setAnimationsEnabled);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const setReduceMotion = useAppStore((s) => s.setReduceMotion);
  const compactMode = useAppStore((s) => s.compactMode);
  const setCompactMode = useAppStore((s) => s.setCompactMode);
  const fontSize = useAppStore((s) => s.fontSize);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const logout = useAppStore((s) => s.logout);
  const username = useAppStore((s) => s.username);
  const anim = useAppStore((s) => s.animationsEnabled);
  const setView = useAppStore((s) => s.setView);
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const liquidGlassMobile = useAppStore((s) => s.liquidGlassMobile);
  const setLiquidGlassMobile = useAppStore((s) => s.setLiquidGlassMobile);
  const email = useAppStore((s) => s.email);
  const avatar = useAppStore((s) => s.avatar);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const syncToServer = useAppStore((s) => s.syncToServer);
  const syncFromServer = useAppStore((s) => s.syncFromServer);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const saveFavoriteArtistsToServer = useAppStore((s) => s.saveFavoriteArtistsToServer);
  const dislikedTags = useAppStore((s) => s.dislikedTags);
  const removeDislikedTag = useAppStore((s) => s.removeDislikedTag);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const dislikedTracksData = useAppStore((s) => s.dislikedTracksData);
  const currentStyle = useAppStore((s) => s.currentStyle);
  const setStyle = useAppStore((s) => s.setStyle);
  const styleVariant = useAppStore((s) => s.styleVariant);
  const setStyleVariant = useAppStore((s) => s.setStyleVariant);
  const catEnabled = useAppStore((s) => s.catEnabled);
  const setCatEnabled = useAppStore((s) => s.setCatEnabled);
  const catFrequency = useAppStore((s) => s.catFrequency);
  const setCatFrequency = useAppStore((s) => s.setCatFrequency);
  const catMood = useAppStore((s) => s.catMood);
  const setCatMood = useAppStore((s) => s.setCatMood);
  const catSize = useAppStore((s) => s.catSize);
  const setCatSize = useAppStore((s) => s.setCatSize);
  const catPetCount = useAppStore((s) => s.catPetCount);
  const crossfadeEnabled = useAppStore((s) => s.crossfadeEnabled);
  const setCrossfadeEnabled = useAppStore((s) => s.setCrossfadeEnabled);
  const crossfadeDuration = useAppStore((s) => s.crossfadeDuration);
  const setCrossfadeDuration = useAppStore((s) => s.setCrossfadeDuration);
  const gaplessEnabled = useAppStore((s) => s.gaplessEnabled);
  const setGaplessEnabled = useAppStore((s) => s.setGaplessEnabled);
  const replayGainEnabled = useAppStore((s) => s.replayGainEnabled);
  const setReplayGainEnabled = useAppStore((s) => s.setReplayGainEnabled);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqPreset = useAppStore((s) => s.eqPreset);

  const ADMIN_EMAILS = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ADMIN_EMAILS) 
    ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(",").map((e: string) => e.trim().toLowerCase())
    : ["killkin.hi@gmail.com"];
  const showAdminLink = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  const [accentInput, setAccentInput] = useState(customAccent || "");
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportMessages, setSupportMessages] = useState<{id:string;role:string;content:string;createdAt:string}[]>([]);
  const [supportInput, setSupportInput] = useState(() => {
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
  const [showThemeMenu, setShowThemeMenu] = useState(true);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [themeSearch, setThemeSearch] = useState("");
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
  const [showCrossfadeSettings, setShowCrossfadeSettings] = useState(false);
  const [showEQ, setShowEQ] = useState(false);
  const [showFullTaste, setShowFullTaste] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const styleList = [
    { id: "streaming", name: "Streaming" },
    { id: "japan", name: "Japan" },
    { id: "neon", name: "Neon" },
    { id: "minimal", name: "Minimal" },
    { id: "swag", name: "Swag" },
    { id: "ipod-2001", name: "iPod 2001" },
    { id: "pixel-flower", name: "Pixel Flower" },
  ];
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const setSupportUnreadCount = useAppStore((s) => s.setSupportUnreadCount);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

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
    if ("Notification" in window) {
      setPushPermission(Notification.permission as NotificationPermission);
    }
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
    // P1-fix: pause when tab hidden
    const interval = setInterval(() => {
      if (document.hidden) return;
      countAudio();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Toggle push notifications
  const handlePushToggle = useCallback(async (enabled: boolean) => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (enabled) {
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
        const reg = await navigator.serviceWorker.ready;
        const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_KEY;
        if (!applicationServerKey) {
          console.warn("[push] VAPID key not configured (NEXT_PUBLIC_VAPID_KEY)");
          setPushLoading(false);
          return;
        }
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

  // Mouse wheel volume control
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

  // Theme categories
  const seasonalThemeIds = new Set(seasonalThemes.map(s => s.theme));
  const coreThemes = themeList.filter(t => !seasonalThemeIds.has(t.id));
  const seasonalThemesList = themeList.filter(t => seasonalThemeIds.has(t.id));

  // Filter themes by search
  const filterThemes = (list: typeof themeList) => {
    if (!themeSearch.trim()) return list;
    const q = themeSearch.toLowerCase();
    return list.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  };
  const filteredCore = filterThemes(coreThemes);
  const filteredSeasonal = filterThemes(seasonalThemesList);

  const handleAccentChange = (color: string) => {
    setAccentInput(color);
    setCustomAccent(color);
  };

  const handleSendSupport = async () => {
    if (!supportInput.trim() || supportLoading) return;
    setSupportLoading(true);
    const text = supportInput.trim();
    setSupportInput("");
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

    setSupportUnreadCount(0);

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

  // ── Crossfade slider visual fill ──
  const crossfadePercent = ((crossfadeDuration - 0.5) / (8 - 0.5)) * 100;

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] space-y-4" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] space-y-5"} max-w-[var(--mq-container-narrow)] mx-auto`}>
      {/* ── Header — redesigned P2 ── */}
      <motion.div
        initial={anim ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-1"
      >
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
          Настройки
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Персонализируйте ваш mq
        </p>
      </motion.div>

      {/* ── Чаты entry card (quick access to messenger) ── */}
      <ScrollReveal direction="up" delay={0.02}>
        <motion.button
          initial={anim ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.02, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setView("messenger")}
          className="w-full rounded-2xl overflow-hidden flex items-center gap-4 px-4 py-4 text-left transition-colors active:bg-white/[0.06] cursor-pointer"
          style={{
            ...sectionCardStyle,
            position: "relative",
          }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold" style={{ color: "var(--mq-text)" }}>Чаты</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
              {messengerBadge > 0 ? `${messengerBadge} непрочитанных сообщений` : "Нет новых сообщений"}
            </p>
          </div>
          {messengerBadge > 0 && (
            <span
              className="min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5 flex-shrink-0"
              style={{
                backgroundColor: "#ef4444",
                color: "#fff",
                boxShadow: "0 2px 6px rgba(239,68,68,0.4)",
              }}
            >
              {messengerBadge > 99 ? "99+" : messengerBadge}
            </span>
          )}
          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
        </motion.button>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── АККАУНТ ── */}
      {/* ═══════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.03}>
        <motion.div
          initial={anim ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl overflow-hidden"
          style={sectionCardStyle}
        >
          <SectionHeader icon={User} title="Аккаунт" />

          {/* Profile card at the top of account section */}
          <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <div className="absolute -inset-1 rounded-full opacity-60" style={{ background: "linear-gradient(135deg, var(--mq-accent), rgba(255,255,255,0.15))" }} />
                {avatar ? (
                  <img
                    src={avatar}
                    alt="avatar"
                    className="w-14 h-14 rounded-full object-cover relative z-10"
                    style={{ border: "2.5px solid var(--mq-card)" }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold relative z-10"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                  >
                    {username?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold truncate" style={{ color: "var(--mq-text)" }}>{username}</p>
                {email && (
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{email}</p>
                )}
              </div>
              <button
                onClick={() => setView("profile")}
                className="p-2 rounded-xl transition-colors hover:bg-white/[0.06] flex-shrink-0"
                style={{ border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <PenLine className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              </button>
            </div>
          </div>

          <SettingNav
            icon={User}
            label="Настройки профиля"
            subtitle="Аватар, имя, био"
            onClick={() => setView("profile")}
            iconAccent
          />
          {email && !email.startsWith("tg_") && (
            <SettingNav
              icon={KeyRound}
              label="Сменить пароль"
              onClick={() => setShowPasswordReset(true)}
            />
          )}
          {showAdminLink && (
            <a
              href="/admin"
              className="w-full px-4 py-3.5 text-left text-sm flex items-center gap-3 transition-colors hover:bg-white/[0.03] block"
              style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "var(--mq-text)" }}
            >
              <Settings className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Панель администратора</p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            </a>
          )}

          {/* Last.fm Connect (M5.2) */}
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/lastfm/token");
                if (!res.ok) return;
                const data = await res.json();
                if (data.connected) {
                  // Already connected — disconnect
                  toast({ title: "Last.fm подключён", description: "Сессия активна" });
                } else if (data.apiKey) {
                  // Redirect to Last.fm auth
                  const callback = `${window.location.origin}/api/lastfm/callback`;
                  window.location.href = `https://www.last.fm/api/auth/?api_key=${data.apiKey}&cb=${encodeURIComponent(callback)}`;
                } else {
                  toast({ title: "Last.fm не настроен", description: "LASTFM_API_KEY не задан на сервере" });
                }
              } catch {
                toast({ title: "Ошибка", description: "Не удалось проверить статус Last.fm" });
              }
            }}
            className="w-full px-4 py-3.5 text-left text-sm flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "var(--mq-text)" }}
          >
            <Music className="w-4 h-4" style={{ color: "#d51007" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Last.fm</p>
              <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Scrobbling прослушиваний</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          </button>

          {/* Cloud Sync */}
          <div
            className="px-4 py-3.5 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              ) : (
                <Cloud className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Синхронизация</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                  {isSyncing ? "Синхронизация..." : lastSyncAt ? `Последняя: ${new Date(lastSyncAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Не синхронизировано"}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => syncFromServer()}
                disabled={isSyncing}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)", opacity: isSyncing ? 0.5 : 1 }}
              >
                Загрузить
              </button>
              <button
                onClick={() => syncToServer()}
                disabled={isSyncing}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", opacity: isSyncing ? 0.5 : 1 }}
              >
                Сохранить
              </button>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full px-4 py-3.5 text-left text-sm flex items-center gap-3 transition-colors hover:bg-red-500/[0.04]"
            style={{ borderTop: "1px solid rgba(224,49,49,0.08)", color: "#ff6b6b" }}
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Выйти из аккаунта</span>
          </button>

          {/* Delete account */}
          <button
            onClick={() => { setShowDeleteAccount(true); setDeleteConfirmText(""); setDeleteError(null); }}
            className="w-full px-4 py-3.5 text-left text-sm flex items-center gap-3 transition-colors hover:bg-red-500/[0.04]"
            style={{ borderTop: "1px solid rgba(224,49,49,0.08)", color: "#ef4444" }}
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">Удалить аккаунт</span>
          </button>
        </motion.div>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── ВНЕШНИЙ ВИД ── */}
      {/* ═══════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.06}>
        <motion.div
          initial={anim ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl overflow-hidden"
          style={sectionCardStyle}
        >
          <SectionHeader icon={Palette} title="Внешний вид" />

          {/* ── Theme Picker ── */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
              data-tour="theme-section"
            >
              <Palette className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Тема оформления</p>
              </div>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-accent)" }}>
                {themeList.find(t => t.id === currentTheme)?.name || "—"}
              </span>
              {showThemeMenu ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
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
                  <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Search bar */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                      <input
                        type="text"
                        value={themeSearch}
                        onChange={(e) => setThemeSearch(e.target.value)}
                        placeholder="Поиск темы..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none transition-all"
                        style={{
                          backgroundColor: "var(--mq-input-bg)",
                          border: "1px solid var(--mq-border)",
                          color: "var(--mq-text)",
                        }}
                      />
                      {themeSearch && (
                        <button
                          onClick={() => setThemeSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          style={{ color: "var(--mq-text-muted)" }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable theme container */}
                    <div className="max-h-[420px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
                      {/* Core themes */}
                      {filteredCore.length > 0 && (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--mq-text-muted)" }}>Основные</p>
                          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2.5 mb-4">
                            {filteredCore.map((theme) => {
                              const isActive = currentTheme === theme.id;
                              return (
                                <motion.button
                                  key={theme.id}
                                  whileHover={{ scale: 1.06 }}
                                  whileTap={{ scale: 0.94 }}
                                  onClick={() => { setTheme(theme.id); if (customAccent) { setCustomAccent(null); setAccentInput(""); } }}
                                  className="rounded-xl p-2 text-center relative transition-all"
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    border: isActive ? `2px solid ${theme.accent}` : "1px solid rgba(255,255,255,0.06)",
                                    boxShadow: isActive ? `0 0 12px ${theme.glowColor}` : "none",
                                  }}
                                >
                                  {/* Theme preview: circle with background + accent */}
                                  <div className="flex justify-center mb-1.5">
                                    <div className="relative">
                                      <motion.div
                                        className="w-8 h-8 rounded-full relative overflow-hidden"
                                        style={{ backgroundColor: theme.background, border: `2px solid ${theme.border}` }}
                                        animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                                        transition={{ duration: 0.3 }}
                                      >
                                        {/* Inner accent dot */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }} />
                                        </div>
                                        {/* Card preview at bottom */}
                                        <div className="absolute bottom-0.5 left-1 right-1 h-1.5 rounded-sm" style={{ backgroundColor: theme.card }} />
                                      </motion.div>
                                      {isActive && (
                                        <motion.div
                                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                          style={{ backgroundColor: theme.accent }}
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        >
                                          <Check className="w-2 h-2" style={{ color: "#fff" }} />
                                        </motion.div>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-medium truncate block leading-tight" style={{ color: isActive ? theme.accent : "var(--mq-text-muted)" }}>
                                    {theme.name}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {/* Seasonal themes */}
                      {filteredSeasonal.length > 0 && (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--mq-text-muted)" }}>Сезонные</p>
                          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                            {filteredSeasonal.map((theme) => {
                              const isActive = currentTheme === theme.id;
                              const seasonalInfo = seasonalThemes.find(s => s.theme === theme.id);
                              return (
                                <motion.button
                                  key={theme.id}
                                  whileHover={{ scale: 1.06 }}
                                  whileTap={{ scale: 0.94 }}
                                  onClick={() => { setTheme(theme.id); if (customAccent) { setCustomAccent(null); setAccentInput(""); } }}
                                  className="rounded-xl p-2 text-center relative transition-all"
                                  style={{
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                    border: isActive ? `2px solid ${theme.accent}` : "1px solid rgba(255,255,255,0.06)",
                                    boxShadow: isActive ? `0 0 12px ${theme.glowColor}` : "none",
                                  }}
                                >
                                  <div className="flex justify-center mb-1.5">
                                    <div className="relative">
                                      <motion.div
                                        className="w-8 h-8 rounded-full relative overflow-hidden"
                                        style={{ backgroundColor: theme.background, border: `2px solid ${theme.border}` }}
                                        animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                                        transition={{ duration: 0.3 }}
                                      >
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }} />
                                        </div>
                                        <div className="absolute bottom-0.5 left-1 right-1 h-1.5 rounded-sm" style={{ backgroundColor: theme.card }} />
                                      </motion.div>
                                      {isActive && (
                                        <motion.div
                                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                          style={{ backgroundColor: theme.accent }}
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        >
                                          <Check className="w-2 h-2" style={{ color: "#fff" }} />
                                        </motion.div>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-medium truncate block leading-tight" style={{ color: isActive ? theme.accent : "var(--mq-text-muted)" }}>
                                    {seasonalInfo?.icon ? `${seasonalInfo.icon} ` : ""}{theme.name}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {/* No results */}
                      {filteredCore.length === 0 && filteredSeasonal.length === 0 && (
                        <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)" }}>
                          Тема не найдена
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Accent Color ── */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Цвет акцента</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                      {customAccent ? `Текущий: ${customAccent}` : "По умолчанию темы"}
                    </p>
                  </div>
                </div>
                {customAccent && (
                  <button
                    onClick={() => { setCustomAccent(null); setAccentInput(""); }}
                    className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ color: "var(--mq-text-muted)", backgroundColor: "rgba(255,255,255,0.04)" }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Сброс
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5 mb-3">
                {presetAccents.map((color) => (
                  <motion.button
                    key={color}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleAccentChange(color)}
                    className="w-8 h-8 rounded-full relative"
                    style={{
                      backgroundColor: color,
                      border: customAccent === color ? "2.5px solid white" : "2.5px solid rgba(255,255,255,0.1)",
                      boxShadow: customAccent === color ? `0 0 0 2px ${color}, 0 2px 8px ${color}40` : "none",
                    }}
                  >
                    {customAccent === color && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
                {/* Custom color picker */}
                <div className="relative">
                  <input
                    type="color"
                    value={accentInput || "#e03131"}
                    onChange={(e) => handleAccentChange(e.target.value)}
                    className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 overflow-hidden"
                    style={{ border: "2.5px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "var(--mq-text)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── Interface Style ── */}
          <button
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Стиль интерфейса</p>
            </div>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
              {currentStyle ? styleList.find(s => s.id === currentStyle)?.name : "Стандартный"}
            </span>
            {showStyleMenu ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
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
                <div className="px-4 pb-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {currentStyle && (
                    <div className="flex items-center justify-between pt-3 pb-1 rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2 px-3">
                        <Sun className="w-4 h-4" style={{ color: styleVariant === "light" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                        <Moon className="w-4 h-4" style={{ color: !styleVariant ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                          {!styleVariant ? "Тёмная" : "Светлая"}
                        </span>
                      </div>
                      <div className="pr-3">
                        <LiquidGlassToggle
                          checked={styleVariant === "light"}
                          onCheckedChange={(v) => setStyleVariant(v ? "light" : "")}
                          size="sm"
                        />
                      </div>
                    </div>
                  )}
                  {/* Стандартный (no style override) */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setStyle("")}
                    className="w-full p-3 text-left relative flex items-center gap-3"
                    style={{
                      backgroundColor: !currentStyle ? "var(--mq-input-bg)" : "transparent",
                      border: !currentStyle ? `2px solid var(--mq-accent)` : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden" style={{ backgroundColor: "#1a1a1a", borderRadius: 6 }}>
                      <div className="absolute top-1 left-1 w-4 h-1" style={{ backgroundColor: "#e03131", borderRadius: 0 }} />
                      <div className="absolute top-1 right-1 w-3 h-3" style={{ backgroundColor: "#333", borderRadius: 0 }} />
                      <div className="absolute bottom-1 left-1 right-1 h-3" style={{ backgroundColor: "#252525", borderRadius: 0 }} />
                    </div>
                    <div>
                      <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Стандартный</span>
                      <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Обычный вид mq</p>
                    </div>
                    {!currentStyle && (
                      <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                    )}
                  </motion.button>
                  {/* All style options from styleList */}
                  {styleList.map((s) => (
                    <motion.button
                      key={s.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setStyle(s.id)}
                      className="w-full p-3 text-left relative flex items-center gap-3"
                      style={{
                        backgroundColor: currentStyle === s.id ? "var(--mq-input-bg)" : "transparent",
                        border: currentStyle === s.id ? `2px solid var(--mq-accent)` : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="w-12 h-8 flex-shrink-0 relative overflow-hidden rounded-md" style={{ backgroundColor: "#1a1a2e" }}>
                        <div className="absolute top-1 left-1 w-3 h-1 rounded-sm" style={{ backgroundColor: "var(--mq-accent)" }} />
                        <div className="absolute bottom-1 left-1 right-1 h-2 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                      </div>
                      <div>
                        <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>{s.name}</span>
                      </div>
                      {currentStyle === s.id && (
                        <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Toggle settings ── */}
          <SettingToggle
            icon={Sparkles}
            label="Анимации"
            subtitle="Плавные переходы и эффекты"
            value={animationsEnabled}
            onCheckedChange={setAnimationsEnabled}
            valueLabel={animationsEnabled ? "Вкл" : "Выкл"}
          />
          {/* P5.1: Master Reduce Motion toggle */}
          <SettingToggle
            icon={Gauge}
            label="Минимум движения"
            subtitle="Отключить все анимации кроме необходимых (WCAG 2.3.3)"
            value={reduceMotion}
            onCheckedChange={setReduceMotion}
            valueLabel={reduceMotion ? "Вкл" : "Выкл"}
          />
          <SettingToggle
            icon={Minimize2}
            label="Компактный режим"
            subtitle="Уменьшить отступы и элементы"
            value={compactMode}
            onCheckedChange={setCompactMode}
            valueLabel={compactMode ? "Вкл" : "Выкл"}
          />
          <div className="lg:hidden">
            <SettingToggle
              icon={Sparkles}
              label="Liquid Glass"
              subtitle="Стеклянный эффект на мобильном"
              value={liquidGlassMobile}
              onCheckedChange={setLiquidGlassMobile}
              valueLabel={liquidGlassMobile ? "Вкл" : "Выкл"}
            />
          </div>
          <SettingToggle
            icon={Bot}
            label="Скрыть AI подборку"
            subtitle="Скрыть AI рекомендации с главной"
            value={useAppStore((s) => s.aiRecsHidden)}
            onCheckedChange={useAppStore((s) => s.setAiRecsHidden)}
            valueLabel={useAppStore((s) => s.aiRecsHidden) ? "Вкл" : "Выкл"}
          />
          <SettingToggle
            icon={Moon}
            label="Авто-тема"
            subtitle="Тёмная/светлая по настройке системы"
            value={autoTheme}
            onCheckedChange={(v) => {
              setAutoTheme(v);
              try { localStorage.setItem("mq-auto-theme", v ? "true" : "false"); } catch {}
            }}
            valueLabel={autoTheme ? "Вкл" : "Выкл"}
          />

          {/* ── Font Size ── */}
          <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <Type className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Размер шрифта</p>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-accent)" }}>
                    {fontSize}px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>A</span>
                  <input
                    type="range"
                    min="12"
                    max="22"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ backgroundColor: "var(--mq-border)", accentColor: "var(--mq-accent)" }}
                  />
                  <span className="text-sm flex-shrink-0 font-bold" style={{ color: "var(--mq-text-muted)" }}>A</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── ВОСПРОИЗВЕДЕНИЕ ── */}
      {/* ═══════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.09}>
        <motion.div
          initial={anim ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl overflow-hidden"
          style={sectionCardStyle}
        >
          <SectionHeader icon={Music} title="Воспроизведение" />

          {/* ── Volume ── */}
          <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: volume > 0 ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Громкость</p>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-accent)" }}>
                    {Math.round(volume)}%
                  </span>
                </div>
                <div ref={volumeSectionRef}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ backgroundColor: "var(--mq-border)", accentColor: "var(--mq-accent)" }}
                  />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--mq-text-muted)" }}>Колёсико мыши для регулировки</p>
              </div>
            </div>
          </div>

          {/* ── Spatial Audio ── */}
          <SettingNav
            icon={Headphones}
            label="Spatial Audio"
            subtitle="Объёмное звучание"
            onClick={() => setView("spatial")}
            valueLabel={spatialAudioEnabled ? "ON" : "OFF"}
            iconAccent={spatialAudioEnabled}
          />

          {/* ── Crossfade ── */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setShowCrossfadeSettings(!showCrossfadeSettings)}
              className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            >
              <ArrowLeftRight className="w-4 h-4 flex-shrink-0" style={{ color: crossfadeEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Кроссфейд</p>
              </div>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: crossfadeEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: crossfadeEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                {crossfadeEnabled ? `${crossfadeDuration}s` : "ВЫКЛ"}
              </span>
              {showCrossfadeSettings ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
            </button>
            <AnimatePresence>
              {showCrossfadeSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 300 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center justify-between pt-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Включить кроссфейд</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Плавный переход между треками</p>
                      </div>
                      <Switch
                        checked={crossfadeEnabled}
                        onCheckedChange={(checked) => {
                          setCrossfadeEnabled(checked);
                          engineSetCrossfadeEnabled(checked);
                        }}
                      />
                    </div>
                    <div className={crossfadeEnabled ? "" : "opacity-40 pointer-events-none"}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Длительность</p>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-accent)" }}>
                          {crossfadeDuration}s
                        </span>
                      </div>
                      {/* Enhanced crossfade slider with visual feedback */}
                      <div className="relative">
                        <input
                          type="range"
                          min={0.5}
                          max={8}
                          step={0.5}
                          value={crossfadeDuration}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCrossfadeDuration(val);
                            engineSetCrossfadeDuration(val);
                          }}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer relative z-10"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.08)",
                            accentColor: "var(--mq-accent)",
                          }}
                        />
                        {/* Visual fill bar */}
                        <div
                          className="absolute top-0 left-0 h-2 rounded-full pointer-events-none z-0"
                          style={{
                            width: "100%",
                            transform: `scaleX(${crossfadePercent / 100})`,
                            transformOrigin: "left",
                            willChange: "transform",
                            background: "linear-gradient(90deg, var(--mq-accent), var(--mq-accent))",
                            opacity: 0.3,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>0.5s</span>
                        <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>8s</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Gapless Playback ── */}
          <SettingToggle
            icon={AudioWaveform}
            label="Непрерывное воспроизведение"
            subtitle="Бесшовный переход между треками в альбоме"
            value={gaplessEnabled}
            onCheckedChange={(checked) => {
              setGaplessEnabled(checked);
              engineSetGaplessEnabled(checked);
            }}
            valueLabel={gaplessEnabled ? "ВКЛ" : "ВЫКЛ"}
          />

          {/* ReplayGain (M5.1) */}
          <SettingToggle
            icon={Gauge}
            label="ReplayGain"
            subtitle="Нормализация громкости между треками"
            value={replayGainEnabled}
            onCheckedChange={(checked) => setReplayGainEnabled(checked)}
            valueLabel={replayGainEnabled ? "ВКЛ" : "ВЫКЛ"}
          />

          {/* ── Equalizer ── */}
          <button
            onClick={() => setShowEQ(true)}
            className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <rect x="1" y="10" width="2" height="4" rx="1" fill={eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)"} />
              <rect x="5" y="7" width="2" height="7" rx="1" fill={eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)"} />
              <rect x="9" y="4" width="2" height="10" rx="1" fill={eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)"} />
              <rect x="13" y="2" width="2" height="12" rx="1" fill={eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)"} />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Эквалайзер</p>
            </div>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: eqEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              {eqEnabled ? eqPreset : "ВЫКЛ"}
            </span>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          </button>

          {/* ── Sleep Timer ── */}
          <button
            onClick={() => setView("sleepTimer")}
            className="hidden lg:flex w-full px-4 py-3.5 text-left text-sm items-center gap-3 transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "var(--mq-text)" }}
          >
            <Moon className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <span className="font-medium">Таймер сна</span>
            <ChevronRight className="w-4 h-4 ml-auto" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        </motion.div>
      </ScrollReveal>

      {/* EQ Modal */}
      <EqualizerView show={showEQ} onClose={() => setShowEQ(false)} />

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── УВЕДОМЛЕНИЯ ── */}
      {/* ═══════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.12}>
        <motion.div
          initial={anim ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl overflow-hidden"
          style={sectionCardStyle}
        >
          <SectionHeader icon={Bell} title="Уведомления" />

          {/* Push notifications */}
          <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {pushLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <CloudOff className="w-4 h-4 flex-shrink-0" style={{ color: pushEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Push-уведомления</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: pushEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: pushEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                      {pushEnabled ? "Вкл" : "Выкл"}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    {!process.env.NEXT_PUBLIC_VAPID_KEY
                      ? "VAPID ключ не настроен"
                      : "Уведомления даже когда вкладка закрыта"}
                  </p>
                </div>
              </div>
              <Switch
                checked={pushEnabled}
                onCheckedChange={handlePushToggle}
                disabled={pushLoading || !process.env.NEXT_PUBLIC_VAPID_KEY}
              />
            </div>
            {pushPermission && (
              <div className="flex items-center gap-2 ml-7 mt-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      pushPermission === "granted" ? "#4ade80"
                      : pushPermission === "denied" ? "#ef4444"
                      : "#f59e0b",
                  }}
                />
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {pushPermission === "granted" ? "Разрешено" : pushPermission === "denied" ? "Заблокировано" : "Не запрошено"}
                </span>
              </div>
            )}
          </div>

          {/* Support chat */}
          <button
            onClick={handleOpenSupport}
            className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "var(--mq-text)" }}
          >
            <Headphones className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Чат с поддержкой</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Бот отвечает мгновенно</p>
            </div>
            {supportUnreadCount > 0 && (
              <span
                className="min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5 flex-shrink-0"
                style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
              >
                {supportUnreadCount > 99 ? "99+" : supportUnreadCount}
              </span>
            )}
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        </motion.div>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── О ПРИЛОЖЕНИИ ── */}
      {/* ═══════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.15}>
        <motion.div
          initial={anim ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl overflow-hidden"
          style={sectionCardStyle}
        >
          <SectionHeader icon={Info} title="О приложении" />

          {/* Musical Tastes */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setShowFullTaste(!showFullTaste)}
              className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            >
              <Palette className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Музыкальные вкусы</p>
              </div>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: showFullTaste ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: showFullTaste ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                {showFullTaste ? "Открыто" : "Настроить"}
              </span>
              {showFullTaste ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
            </button>
            <AnimatePresence>
              {showFullTaste && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 800 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <TasteProfileView />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Cat Mascot */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setShowCatSettings(!showCatSettings)}
              className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Маскот mq</p>
              </div>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: catEnabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: catEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                {catEnabled ? "Включён" : "Выключен"}
              </span>
              {showCatSettings ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
            </button>
            <AnimatePresence>
              {showCatSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 500 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Показывать маскота</p>
                        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Маскот будет появляться и давать советы</p>
                      </div>
                      <LiquidGlassToggle checked={catEnabled} onCheckedChange={setCatEnabled} size="sm" />
                    </div>
                    {catEnabled && (
                      <>
                        <div>
                          <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>Состояние маскота</p>
                          <div className="flex gap-2">
                            {([
                              { id: "chill" as const, emoji: "🎵" },
                              { id: "dreamy" as const, emoji: "💭" },
                              { id: "panic" as const, emoji: "😱" },
                              { id: "lazy" as const, emoji: "😴" },
                            ]).map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setCatMood(opt.id)}
                                className="flex-1 p-2.5 rounded-xl text-center transition-all"
                                style={{
                                  backgroundColor: catMood === opt.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                                  border: catMood === opt.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)",
                                }}
                              >
                                <motion.span
                                  className="text-xl block"
                                  animate={catMood === opt.id ? { scale: [1, 1.15, 1] } : {}}
                                  transition={{ duration: 0.3, ease: "easeInOut" }}
                                >
                                  {opt.emoji}
                                </motion.span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text)" }}>Размер</p>
                          <div className="flex gap-2">
                            {([
                              { id: "small" as const, label: "S", px: 40 },
                              { id: "medium" as const, label: "M", px: 52 },
                              { id: "large" as const, label: "L", px: 64 },
                            ]).map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setCatSize(opt.id)}
                                className="flex-1 p-2 rounded-xl text-center transition-all"
                                style={{
                                  backgroundColor: catSize === opt.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                                  border: catSize === opt.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)",
                                }}
                              >
                                <div className="flex justify-center mb-1">
                                  <MascotPreview size={opt.px} isSelected={catSize === opt.id} />
                                </div>
                                <p className="text-[11px] font-semibold" style={{ color: catSize === opt.id ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                                  {opt.label}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div
                          className="rounded-xl p-3 text-center"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Всего взаимодействий</p>
                          <p className="text-2xl font-bold mt-1" style={{ color: "var(--mq-accent)" }}>{catPetCount}</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                            {catPetCount === 0 ? "Нажмите на маскота!" : catPetCount < 10 ? "Маскот начинает доверять вам" : catPetCount < 50 ? "Маскот вас полюбил!" : catPetCount < 100 ? "Вы — лучший друг маскота!" : "Легендарный друг!"}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Offline / Service Worker */}
          <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-3">
              <CloudOff className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Офлайн</p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: swActive ? "#4ade80" : "#ef4444" }} />
                    <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                      {swActive ? "SW активен" : "SW неактивен"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Кэшировано треков</span>
                  <span className="text-xs font-mono" style={{ color: "var(--mq-accent)" }}>{cachedTracks} / 20</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClearCache}
                  className="w-full mt-2 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Trash2 className="w-3 h-3" />
                  Очистить кэш
                </motion.button>
              </div>
            </div>
          </div>

          {/* Disliked tracks */}
          {dislikedTrackIds.length > 0 && (
            <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-3">
                <ThumbsDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Дизлайки</p>
                    <span className="text-xs font-mono" style={{ color: "var(--mq-accent)" }}>{dislikedTrackIds.length}</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Сброс удалит все дизлайки</p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      useAppStore.setState({ dislikedTrackIds: [], dislikedTracksData: [] });
                      useAppStore.getState().scheduleSyncToServer();
                    }}
                    className="w-full mt-2 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Очистить все дизлайки
                  </motion.button>
                </div>
              </div>
            </div>
          )}

          {/* Data Protection */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setView("profile")}
              className="w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
            >
              <Shield className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Защита данных</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Шифрование, конфиденциальность, аутентификация</p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            </button>
          </div>

          {/* Desktop App Download */}
          <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Monitor className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Приложение для компьютера</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Нативное приложение с автообновлениями</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <motion.a
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer transition-opacity active:opacity-80"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Monitor className="w-5 h-5" style={{ color: "#3b82f6" }} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>Windows</span>
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player.dmg"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer transition-opacity active:opacity-80"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Apple className="w-5 h-5" style={{ color: "#a855f7" }} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>macOS</span>
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player.AppImage"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer transition-opacity active:opacity-80"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Smartphone className="w-5 h-5" style={{ color: "#eab308" }} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>Linux</span>
              </motion.a>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4ade80" }} />
              <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>v1.0.1</span>
            </div>
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── DIALOGS ── */}
      {/* ═══════════════════════════════════════════════════ */}

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordReset} onOpenChange={setShowPasswordReset}>
        <DialogContent style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid rgba(255,255,255,0.06)",
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
              style={{ border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "var(--mq-text)",
          maxWidth: 360,
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5" style={{ color: "#ff6b6b" }} />
              Выйти из аккаунта
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Вы уверены? Данные будут сохранены на сервере и доступны после повторного входа.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              onClick={() => { logout(); setShowLogoutConfirm(false); }}
              className="flex-1 min-h-[40px]"
              style={{ backgroundColor: "#ef4444", color: "#fff" }}
            >
              Выйти
            </Button>
            <Button
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 min-h-[40px]"
              style={{ border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
            >
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                border: "1px solid rgba(255,255,255,0.06)",
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
                style={{ border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Support Chat Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid rgba(255,255,255,0.06)",
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
              Бот отвечает мгновенно, администратор — в рабочее время
            </p>
          </DialogHeader>

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
                        <p className="text-[11px] font-medium mb-1 flex items-center gap-1" style={{ color: "#06b6d4" }}>
                          <Bot className="w-2.5 h-2.5" /> MQ Bot
                        </p>
                      )}
                      {msg.role === "admin" && (
                        <p className="text-[11px] font-medium mb-1" style={{ color: "var(--mq-accent)" }}>Администратор</p>
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

          <form
            onSubmit={(e) => { e.preventDefault(); handleSendSupport(); }}
            className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
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
                border: "1px solid rgba(255,255,255,0.06)",
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
