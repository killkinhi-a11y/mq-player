"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { themes } from "@/lib/themes";
import { APP_URL } from "@/lib/config";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Palette, Headphones, Bell, MoreHorizontal,
  Volume2, Moon, Type, Minimize2, Sparkles, Zap,
  RefreshCw, Cloud, Trash2, LogOut, Download, Upload,
  Smartphone, Monitor, Apple, Info, ChevronRight, X, Check, Loader2,
  AlertTriangle, Sliders, Gauge, Terminal,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import VolumeSlider from "@/components/ui/volume-slider";
import RangeSlider from "@/components/ui/range-slider";
import { toast } from "@/hooks/use-toast";

// ─── Tab ──────────────────────────────────────────────────────────────────

type Tab = "account" | "appearance" | "playback" | "notifications" | "more";

const TABS: { id: Tab; label: string; labelShort: string; icon: React.ElementType }[] = [
  { id: "account", label: "Аккаунт", labelShort: "Профиль", icon: User },
  { id: "appearance", label: "Оформление", labelShort: "Тема", icon: Palette },
  { id: "playback", label: "Звук", labelShort: "Звук", icon: Headphones },
  { id: "notifications", label: "Уведомления", labelShort: "Уведом.", icon: Bell },
  { id: "more", label: "Ещё", labelShort: "Ещё", icon: MoreHorizontal },
];

// ─── Card ─────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
        boxShadow: "var(--mq-shadow-premium-md)",
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 flex items-center gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
        {title}
      </span>
    </div>
  );
}

function SettingRow({
  icon: Icon, label, subtitle, value, onClick, danger, rightElement,
}: {
  icon: React.ElementType; label: string; subtitle?: string; value?: string;
  onClick?: () => void; danger?: boolean; rightElement?: React.ReactNode;
}) {
  const Wrapper = onClick ? motion.button : "div";
  return (
    <Wrapper
      {...(onClick ? { whileTap: { scale: 0.99 }, whileHover: { backgroundColor: "var(--mq-overlay-hover)" }, onClick } : {})}
      className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left transition-colors"
      style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
    >
      <div
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: danger ? "rgba(239,68,68,0.1)" : "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
      >
        <Icon className="w-4 h-4" style={{ color: danger ? "#ef4444" : "var(--mq-accent)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? "#ef4444" : "var(--mq-text)" }}>{label}</p>
        {subtitle && <p className="text-[11px] sm:text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
      </div>
      {value && (
        <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "var(--mq-glass-bg)", color: "var(--mq-text-muted)" }}>{value}</span>
      )}
      {rightElement}
      {onClick && !rightElement && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />}
    </Wrapper>
  );
}

function SettingToggle({
  icon: Icon, label, subtitle, value, onCheckedChange,
}: {
  icon: React.ElementType; label: string; subtitle?: string;
  value: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
      <div
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: value ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "var(--mq-glass-bg)" }}
      >
        <Icon className="w-4 h-4" style={{ color: value ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>{label}</p>
        {subtitle && <p className="text-[11px] sm:text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function SettingsView() {
  // ── Store ──
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
  const email = useAppStore((s) => s.email);
  const avatar = useAppStore((s) => s.avatar);
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled);
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const crossfadeEnabled = useAppStore((s) => s.crossfadeEnabled);
  const setCrossfadeEnabled = useAppStore((s) => s.setCrossfadeEnabled);
  const crossfadeDuration = useAppStore((s) => s.crossfadeDuration);
  const setCrossfadeDuration = useAppStore((s) => s.setCrossfadeDuration);
  const gaplessEnabled = useAppStore((s) => s.gaplessEnabled);
  const setGaplessEnabled = useAppStore((s) => s.setGaplessEnabled);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);
  const aiRecsHidden = useAppStore((s) => s.aiRecsHidden);
  const setAiRecsHidden = useAppStore((s) => s.setAiRecsHidden);
  const syncToServer = useAppStore((s) => s.syncToServer);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const setView = useAppStore((s) => s.setView);
  const catEnabled = useAppStore((s) => s.catEnabled);
  const setCatEnabled = useAppStore((s) => s.setCatEnabled);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const stored = localStorage.getItem("mq-settings-tab") as Tab | null;
      if (stored && ["account", "appearance", "playback", "notifications", "more"].includes(stored)) return stored;
    } catch {}
    return "account";
  });
  useEffect(() => { try { localStorage.setItem("mq-settings-tab", activeTab); } catch {} }, [activeTab]);

  // ── Push ──
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) setPushEnabled(true);
      }).catch(() => {});
    }
  }, []);

  const handlePushToggle = useCallback(async (enabled: boolean) => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (enabled) {
        if (!("Notification" in window)) { toast({ title: "Не поддерживается" }); return; }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast({ title: "Разрешение не дано" }); return; }
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
        if (!vapidKey) { toast({ title: "Push не настроен" }); return; }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
        await fetch("/api/push/subscribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        setPushEnabled(true);
        toast({ title: "Уведомления включены" });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" } });
        }
        setPushEnabled(false);
        toast({ title: "Уведомления выключены" });
      }
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
    finally { setPushLoading(false); }
  }, [pushLoading]);

  // ── Sync ──
  const handleSync = useCallback(async () => {
    try {
      await syncToServer();
      toast({ title: "Синхронизировано" });
    } catch { toast({ title: "Ошибка синхронизации", variant: "destructive" }); }
  }, [syncToServer]);

  // ── Logout ──
  const handleLogout = useCallback(() => {
    if (confirm("Выйти из аккаунта?")) logout();
  }, [logout]);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        toast({ title: "Аккаунт удалён" });
        // Clear local state and redirect
        try { localStorage.removeItem("mq-store-v8"); } catch {}
        setTimeout(() => window.location.href = "/", 1000);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error || "Ошибка удаления", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }, [toast]);

  // ── Clear cache ──
  const handleClearCache = useCallback(() => {
    if (typeof window !== "undefined" && "caches" in window) {
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
        toast({ title: "Кэш очищен" });
      });
    }
  }, []);

  // ── Export user data (liked tracks, history, playlists) as JSON ──
  const handleExportData = useCallback(() => {
    try {
      const state = useAppStore.getState();
      const exportData = {
        likedTracks: state.likedTracksData,
        dislikedTracks: state.dislikedTracksData,
        history: state.history.slice(-200), // last 200
        playlists: state.playlists,
        favoriteArtists: state.favoriteArtists,
        exportedAt: new Date().toISOString(),
        version: 1,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mq-player-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Данные экспортированы" });
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    }
  }, []);

  // ── Import user data from JSON file ──
  const handleImportData = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const state = useAppStore.getState();
        // Restore liked tracks
        if (Array.isArray(data.likedTracks)) {
          for (const t of data.likedTracks) {
            if (t?.id && !state.likedTrackIds.includes(t.id)) {
              state.toggleLike(t.id, t);
            }
          }
        }
        // Restore playlists
        if (Array.isArray(data.playlists)) {
          useAppStore.setState({ playlists: [...state.playlists, ...data.playlists] });
        }
        toast({ title: "Данные импортированы" });
      } catch {
        toast({ title: "Ошибка импорта — неверный файл", variant: "destructive" });
      }
    };
    input.click();
  }, []);

  const accentPresets = ["#e03131", "#8b5cf6", "#4ade80", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-24" data-active-tab={activeTab}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>Настройки</h1>
        <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>Персонализируйте ваш mq</p>
      </motion.div>

      {/* Tab bar */}
      <div className="sticky z-30 mb-4 sm:mb-5" style={{ top: 0, paddingTop: 8, paddingBottom: 8, backgroundColor: "var(--mq-bg)" }}>
        <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto scrollbar-none"
          style={{ background: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "var(--mq-shadow-lg)", WebkitOverflowScrolling: "touch" }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0"
                style={{ background: isActive ? "var(--mq-accent)" : "transparent", color: isActive ? "#fff" : "var(--mq-text-muted)", boxShadow: isActive ? "0 4px 12px color-mix(in srgb, var(--mq-accent) 35%, transparent)" : "none" }}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.labelShort}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {/* ════ ACCOUNT ════ */}
        {activeTab === "account" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card>
              <CardTitle icon={User} title="Профиль" />
              <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-1 rounded-full opacity-60" style={{ background: "linear-gradient(135deg, var(--mq-accent), var(--mq-glass-bg-active))" }} />
                  {avatar ? (
                    <img src={avatar} alt="" className="w-14 h-14 rounded-full object-cover relative z-10" style={{ border: "2.5px solid var(--mq-card)" }} />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold relative z-10" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}>
                      {(username || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold truncate" style={{ color: "var(--mq-text)" }}>{username || "User"}</p>
                  <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{email || "—"}</p>
                </div>
                <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }} onClick={() => setView("profile")}
                  className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}>
                  Открыть
                </motion.button>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Cloud} title="Данные" />
              <SettingRow icon={RefreshCw} label="Синхронизация" subtitle={lastSyncAt ? `Последняя: ${new Date(lastSyncAt).toLocaleString("ru-RU")}` : "Не синхронизировано"}
                onClick={handleSync} rightElement={isSyncing ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} /> : undefined} />
              <SettingRow icon={Download} label="Экспорт данных" subtitle="Сохранить избранное и плейлисты в JSON" onClick={handleExportData} />
              <SettingRow icon={Upload} label="Импорт данных" subtitle="Восстановить из JSON-файла" onClick={handleImportData} />
              <SettingRow icon={LogOut} label="Выйти" subtitle="До встречи" onClick={handleLogout} danger />
            </Card>

            {/* Delete account — danger zone */}
            <Card>
              <CardTitle icon={AlertTriangle} title="Опасная зона" />
              {!deleteConfirm ? (
                <SettingRow
                  icon={Trash2}
                  label="Удалить аккаунт"
                  subtitle="Безвозвратно удалить все данные"
                  onClick={() => setDeleteConfirm(true)}
                  danger
                />
              ) : (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                    Вы уверены? Все данные будут удалены безвозвратно.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ backgroundColor: "var(--mq-error, #ef4444)", color: "var(--mq-text-on-accent, #fff)" }}
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Удалить навсегда
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border-thin)" }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* ════ APPEARANCE ════ */}
        {activeTab === "appearance" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card>
              <CardTitle icon={Palette} title="Тема" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto">
                  {Object.entries(themes).map(([key, theme]: [string, any]) => {
                    const isActive = currentTheme === key;
                    return (
                      <motion.button key={key} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }} onClick={() => setTheme(key)}
                        className="relative p-2 rounded-xl flex flex-col items-center gap-1.5"
                        style={{ backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "var(--mq-overlay-hover)", border: isActive ? "1px solid var(--mq-border-accent)" : "1px solid var(--mq-border-hairline)" }}>
                        <div className="w-10 h-10 rounded-full" style={{ background: `linear-gradient(135deg, ${theme.accent || "#e03131"}, ${theme.bg || "#0e0e0e"})` }} />
                        <span className="text-[10px] font-medium truncate w-full text-center" style={{ color: "var(--mq-text-muted)" }}>{theme.name || key}</span>
                        {isActive && <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}><Check className="w-2.5 h-2.5" style={{ color: "var(--mq-text-on-accent, #fff)" }} /></div>}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Акцент" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="flex flex-wrap gap-2">
                  {accentPresets.map(color => (
                    <motion.button key={color} whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={() => setCustomAccent(color)}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: color, boxShadow: customAccent === color ? `0 0 0 3px var(--mq-bg), 0 0 0 5px ${color}` : "none" }}>
                      {customAccent === color && <Check className="w-4 h-4" style={{ color: "var(--mq-text-on-accent, #fff)" }} />}
                    </motion.button>
                  ))}
                  <label className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer" style={{ backgroundColor: "var(--mq-glass-bg)", border: "1px dashed var(--mq-border-medium)" }}>
                    <input type="color" value={customAccent || "#e03131"} onChange={(e) => setCustomAccent(e.target.value)} className="opacity-0 absolute w-0 h-0" />
                    <Palette className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                  </label>
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Type} title="Текст" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <RangeSlider value={fontSize} min={13} max={20} onChange={setFontSize} minLabel="A" maxLabel="A" />
              </div>
              <SettingToggle icon={Minimize2} label="Компактный режим" subtitle="Меньше отступов" value={compactMode} onCheckedChange={setCompactMode} />
            </Card>

            <Card>
              <CardTitle icon={Zap} title="Анимации" />
              <SettingToggle icon={Sparkles} label="Анимации интерфейса" subtitle="Переходы, эффекты" value={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
              <SettingToggle icon={Moon} label="Уменьшить движение" subtitle="Для вестибулярных потребностей" value={reduceMotion} onCheckedChange={setReduceMotion} />
            </Card>
          </motion.div>
        )}

        {/* ════ PLAYBACK ════ */}
        {activeTab === "playback" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card>
              <CardTitle icon={Volume2} title="Громкость" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <VolumeSlider volume={volume} onChange={setVolume} showValue className="w-full" />
              </div>
            </Card>

            <Card>
              <CardTitle icon={Headphones} title="Качество" />
              <SettingRow
                icon={Sliders}
                label="Эквалайзер"
                subtitle={eqEnabled ? `Активен · ${eqPreset === "custom" ? "свои настройки" : eqPreset}` : "10-полосный с пресетами"}
                value={eqEnabled ? "ON" : "OFF"}
                onClick={() => setEqOpen(true)}
              />
              <SettingToggle icon={Headphones} label="Пространственное аудио" subtitle="3D-звучание" value={spatialAudioEnabled} onCheckedChange={setSpatialAudioEnabled} />
              <SettingToggle icon={Zap} label="Gapless" subtitle="Без пауз между треками" value={gaplessEnabled} onCheckedChange={setGaplessEnabled} />
              <SettingRow
                icon={Gauge}
                label="Скорость воспроизведения"
                subtitle={playbackRate === 1 ? "Обычная" : `${playbackRate}×`}
                value={`${playbackRate}×`}
                onClick={() => {
                  const rates = [0.75, 1, 1.25, 1.5, 2];
                  const idx = rates.indexOf(playbackRate);
                  const next = rates[(idx + 1) % rates.length];
                  setPlaybackRate(next);
                  toast({ title: `Скорость: ${next}×` });
                }}
              />
            </Card>

            <Card>
              <CardTitle icon={RefreshCw} title="Переходы" />
              <SettingToggle icon={RefreshCw} label="Crossfade" subtitle="Плавный переход" value={crossfadeEnabled} onCheckedChange={setCrossfadeEnabled} />
              {crossfadeEnabled && (
                <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                  <div className="flex items-center gap-3">
                    <RangeSlider
                      value={crossfadeDuration}
                      min={0.5}
                      max={8}
                      step={0.5}
                      onChange={setCrossfadeDuration}
                      minLabel="0.5s"
                      maxLabel="8s"
                      showValue
                      valueSuffix="s"
                    />
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* ════ NOTIFICATIONS ════ */}
        {activeTab === "notifications" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card>
              <CardTitle icon={Bell} title="Push-уведомления" />
              <SettingToggle icon={Bell} label="Уведомления" subtitle="Новые сообщения, обновления" value={pushEnabled} onCheckedChange={handlePushToggle} />
              {pushLoading && (
                <div className="px-4 py-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Обработка...</span>
                </div>
              )}
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Контент" />
              <SettingToggle icon={Sparkles} label="ИИ-подборки" subtitle="Рекомендации на главной" value={!aiRecsHidden} onCheckedChange={(v) => setAiRecsHidden(!v)} />
            </Card>
          </motion.div>
        )}

        {/* ════ MORE ════ */}
        {activeTab === "more" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card>
              <CardTitle icon={Info} title="О приложении" />
              <SettingRow icon={Info} label="Версия" value={typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION ? `v${process.env.NEXT_PUBLIC_APP_VERSION}` : "v1.3.0"} />
              <SettingRow icon={Cloud} label="Сервер" value={APP_URL.replace("https://", "")} />
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Дополнительно" />
              <SettingToggle icon={Sparkles} label="MqCat" subtitle="Котик на экране" value={catEnabled} onCheckedChange={setCatEnabled} />
              <SettingRow icon={Trash2} label="Очистить кэш" subtitle="Закэшированные треки и изображения" onClick={handleClearCache} danger />
            </Card>

            <Card>
              <CardTitle icon={Download} title="Скачать приложение" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip" target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}>
                    <Monitor className="w-5 h-5" style={{ color: "#3b82f6" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>Windows</span>
                  </motion.a>
                  <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    href="https://github.com/killkinhi-a11y/mq-player/releases" target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}>
                    <Apple className="w-5 h-5" style={{ color: "#a855f7" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>macOS</span>
                  </motion.a>
                  <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    href="https://github.com/killkinhi-a11y/mq-player/releases" target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}>
                    <Terminal className="w-5 h-5" style={{ color: "#eab308" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "var(--mq-text)" }}>Linux</span>
                  </motion.a>
                  <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    href="https://github.com/killkinhi-a11y/mq-player/releases/latest/download/mq-player.apk" target="_blank" rel="noopener noreferrer" download
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer relative" style={{ backgroundColor: "color-mix(in srgb, #3ddc84 12%, var(--mq-input-bg))", border: "1px solid color-mix(in srgb, #3ddc84 35%, transparent)", boxShadow: "0 0 16px color-mix(in srgb, #3ddc84 12%, transparent)" }}>
                    <Smartphone className="w-5 h-5" style={{ color: "#3ddc84" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "color-mix(in srgb, #3ddc84 80%, var(--mq-text))" }}>Android APK</span>
                  </motion.a>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                  <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    APK обновляется автоматически при каждом релизе
                  </p>
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium underline"
                    style={{ color: "var(--mq-accent)" }}
                  >
                    Все версии →
                  </a>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}
