"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { themes } from "@/lib/themes";
import { APP_URL } from "@/lib/config";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Palette, Headphones, Bell,
  Volume2, Moon, Type, Minimize2, Sparkles, Zap,
  RefreshCw, Cloud, Trash2, LogOut, Download, Upload,
  Smartphone, Monitor, Apple, Info, ChevronRight, ChevronDown, X, Check, Loader2,
  AlertTriangle, Sliders, Gauge, Terminal, Cpu, Keyboard as KeyboardIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import VolumeSlider from "@/components/ui/volume-slider";
import RangeSlider from "@/components/ui/range-slider";
import { toast } from "@/hooks/use-toast";
import { useUpdateManager } from "@/hooks/useUpdateManager";
import { getUpdateManager } from "@/lib/updateManager";
import {
  ANDROID_STABLE_VERSION,
  ANDROID_RELEASED_AT,
  ANDROID_APK_URL,
  ANDROID_WHATS_NEW,
} from "@/lib/androidRelease";
import { hoverProps } from "@/lib/hoverCapability";
import { WEB_RELEASE_NOTES } from "@/lib/releaseNotes";

// v72: hotkeys reference for the About tab — the exact bindings
// useKeyboardShortcuts listens to (mirrors KeyboardShortcutsHelp SHORTCUTS).
const SETTINGS_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Space"], action: "Играть / пауза" },
  { keys: ["→"], action: "Перемотать вперёд на 10 сек" },
  { keys: ["←"], action: "Перемотать назад на 10 сек" },
  { keys: ["↑"], action: "Громче на 5" },
  { keys: ["↓"], action: "Тише на 5" },
  { keys: ["M"], action: "Без звука / вернуть звук" },
  { keys: ["N"], action: "Следующий трек" },
  { keys: ["P"], action: "Предыдущий трек" },
  { keys: ["L"], action: "Лайк текущего трека" },
  { keys: ["F"], action: "Полноэкранный вид трека" },
  { keys: ["Esc"], action: "Закрыть полноэкранный вид" },
  { keys: ["?"], action: "Показать справку" },
];

// ─── Tab ──────────────────────────────────────────────────────────────────

type Tab = "account" | "appearance" | "playback" | "notifications" | "downloads" | "about";

const TABS: { id: Tab; label: string; labelShort: string; icon: React.ElementType }[] = [
  { id: "account", label: "Аккаунт", labelShort: "Профиль", icon: User },
  { id: "appearance", label: "Оформление", labelShort: "Тема", icon: Palette },
  { id: "playback", label: "Звук", labelShort: "Звук", icon: Headphones },
  { id: "notifications", label: "Уведомления", labelShort: "Уведом.", icon: Bell },
  { id: "downloads", label: "Загрузки", labelShort: "Файлы", icon: Download },
  { id: "about", label: "О программе", labelShort: "Ещё", icon: Info },
];

// ─── Card ─────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--mq-r-card)] overflow-hidden"
      style={{
        backgroundColor: "var(--mq-surface-2)",
        border: "1px solid var(--mq-edge)",
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 flex items-center gap-2.5">
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
      <span className="mq-t-meta-2 font-bold uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
        {title}
      </span>
    </div>
  );
}

/** Android update card — human-language «Что нового» + one accent download
 *  action. Version/copy come from src/lib/androidRelease.ts (single source of
 *  truth, updated together with each stable GitHub release). */
function AndroidUpdateCard() {
  const [expanded, setExpanded] = useState(false);
  // First 3 bullets are the always-visible summary; the rest unfold.
  const summary = ANDROID_WHATS_NEW.slice(0, 3);
  const rest = ANDROID_WHATS_NEW.slice(3);

  return (
    <div className="px-3 sm:px-4 pb-4" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
      {/* ── Version row (wraps on mobile: title left, button below/right) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Smartphone className="w-5 h-5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mq-t-section font-semibold" style={{ color: "var(--mq-text)" }}>
                MQ Player {ANDROID_STABLE_VERSION}
              </span>
              <span
                className="mq-t-num rounded-md px-1.5 py-0.5 mq-t-meta-2 font-semibold whitespace-nowrap"
                style={{
                  color: "var(--mq-accent)",
                  backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                }}
              >
                новая версия
              </span>
            </div>
            <p className="mq-t-meta-2 mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
              Обновление от {ANDROID_RELEASED_AT}
            </p>
          </div>
        </div>
        <a
          href={ANDROID_APK_URL}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="mq-update-apk-btn flex h-11 items-center justify-center gap-2 rounded-lg px-5 mq-t-btn font-semibold
                     transition-colors duration-150 flex-shrink-0"
          style={{
            backgroundColor: "var(--mq-accent)",
            color: "var(--mq-text-on-accent, #fff)",
          }}
          aria-label={`Скачать приложение MQ Player ${ANDROID_STABLE_VERSION} для Android`}
        >
          <Download className="w-4 h-4" aria-hidden />
          Скачать APK
        </a>
      </div>

      {/* ── What's new (human changelog; details unfold) ── */}
      <div
        className="mt-3 rounded-[var(--mq-r-card)] overflow-hidden"
        style={{
          backgroundColor: "var(--mq-surface-1)",
          border: "1px solid var(--mq-border-hairline)",
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left
                     transition-colors duration-150 hover:bg-[var(--mq-overlay-hover)]"
          style={{ color: "var(--mq-text)" }}
        >
          <span className="mq-t-label" style={{ color: "var(--mq-text-muted)" }}>
            Что нового
          </span>
          <ChevronDown
            className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
            style={{
              color: "var(--mq-text-muted)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden
          />
        </button>
        <AnimatePresence initial={false}>
          {(expanded || rest.length === 0) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <ul className="px-3 pb-3 pt-1 flex flex-col gap-2">
                {ANDROID_WHATS_NEW.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: "var(--mq-accent)" }}
                      aria-hidden
                    />
                    <span className="mq-t-body leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Always-visible short summary (hidden once fully expanded) */}
        {!expanded && (
          <ul className="px-3 pb-3 pt-1 flex flex-col gap-2" aria-hidden>
            {summary.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--mq-text-muted)", opacity: 0.55 }}
                />
                <span className="mq-t-body leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Phase M #14/#16 — honest system + deployment diagnostics.
 * Shows ONLY real runtime data (audio engine actually in use, current build,
 * deployment version). Advanced, collapsed by default. */
function SystemDiagnosticsCard() {
  const { state, info, checkNow, applyUpdate } = useUpdateManager();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // Same source of truth as the UpdateManager (inlined NEXT_PUBLIC_MQ_BUILD_ID)
  const buildId =
    typeof window !== "undefined"
      ? getUpdateManager().getCurrentBuildId()
      : null;

  const handleCheck = async () => {
    setChecking(true);
    // Wait for the fetch + state settle, then read FRESH manager state
    // (the hook-closure `info` would be stale immediately after checkNow()).
    await new Promise((r) => setTimeout(r, 700));
    setChecking(false);
    const fresh = getUpdateManager().getState();
    const page = getUpdateManager().getCurrentBuildId();
    if (fresh.info && page && fresh.info.buildId !== page) {
      toast({ title: "Доступна новая версия", description: `v${fresh.info.version} уже онлайн` });
    } else {
      toast({ title: "У вас последняя версия", description: fresh.info ? `v${fresh.info.version}` : "Версия проверена" });
    }
  };

  return (
    <Card>
      <CardTitle icon={Terminal} title="Система и обновления" />
      <SettingRow
        icon={Info}
        label="Версия сборки"
        subtitle={buildId ? buildId.replace("mq-build-", "v") : "—"}
        value={info ? `v${info.version}` : "—"}
        onClick={() => setOpen((v) => !v)}
      />
      {state === "available" && (
        <SettingRow
          icon={Cloud}
          label="Доступно обновление"
          subtitle={info ? `Новая версия v${info.version} уже онлайн` : undefined}
          value="Обновить"
          onClick={applyUpdate}
        />
      )}
      {open && (
        <div
          className="px-3 sm:px-4 py-3 space-y-1.5"
          style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
        >
          <div className="flex justify-between items-center">
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
              АУДИОДВИЖОК
            </span>
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-secondary, var(--mq-text-muted))" }}>
              HTML5 Audio + WebAudio
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
              ПОСЛЕДНИЙ ДЕПЛОЙ
            </span>
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-secondary, var(--mq-text-muted))" }}>
              {info?.releasedAt ? new Date(info.releasedAt).toLocaleString("ru-RU") : "—"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
              BUILD ID
            </span>
            <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-secondary, var(--mq-text-muted))" }}>
              {buildId || "—"}
            </span>
          </div>
        </div>
      )}
      <SettingRow
        icon={RefreshCw}
        label="Проверить обновления"
        subtitle="Проверка версии deployment на сервере"
        value={checking ? "…" : "Проверить"}
        onClick={() => {
          checkNow();
          void handleCheck();
        }}
      />
    </Card>
  );
}

function SettingRow({
  icon: Icon, label, subtitle, value, onClick, danger, rightElement,
}: {
  icon: React.ElementType; label: string; subtitle?: string; value?: string;
  onClick?: () => void; danger?: boolean; rightElement?: React.ReactNode;
}) {
  /* §HOVER/§PRESS (v71): plain button + CSS hover tint (one owner).
     Was: Framer whileTap press-scale + whileHover bg — press feedback
     removed app-wide; hover now matches SettingToggle (CSS only). */
  const Wrapper: "button" | "div" = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { onClick } : {})}
      className={`w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)] focus-visible:bg-[var(--mq-overlay-hover)]`}
      style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
    >
      <div
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-[var(--mq-r-card)] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: danger ? "rgba(239,68,68,0.08)" : "var(--mq-surface-2)", border: "1px solid " + (danger ? "rgba(239,68,68,0.15)" : "var(--mq-edge)") }}
      >
        <Icon className="w-4 h-4" style={{ color: danger ? "#ef4444" : "var(--mq-text-muted)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? "#ef4444" : "var(--mq-text)" }}>{label}</p>
        {subtitle && <p className="mq-t-meta-2 sm:text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
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
  /* §HOVER one-owner: CSS owns background (hover:bg + transition-colors);
     the old Framer whileHover={hoverProps({ backgroundColor })} double-eased with the
     CSS transition — one visible "highlight twice / second flash" bug. */
  return (
    <div
      className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 transition-colors hover:bg-[var(--mq-overlay-hover)]"
      style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
    >
      <div
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-[var(--mq-r-card)] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: value ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "var(--mq-surface-2)", border: "1px solid " + (value ? "color-mix(in srgb, var(--mq-accent) 22%, transparent)" : "var(--mq-edge)") }}
      >
        <Icon className="w-4 h-4" style={{ color: value ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>{label}</p>
        {subtitle && <p className="mq-t-meta-2 sm:text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{subtitle}</p>}
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
  const wasmEngineEnabled = useAppStore((s) => s.wasmEngineEnabled);
  const setWasmEngineEnabled = useAppStore((s) => s.setWasmEngineEnabled);
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
      const stored = localStorage.getItem("mq-settings-tab");
      // v72: legacy "more" tab maps to "about"; new ids pass through.
      if (stored === "more") return "about";
      if (stored && ["account", "appearance", "playback", "notifications", "downloads", "about"].includes(stored)) return stored as Tab;
    } catch {}
    return "account";
  });
  useEffect(() => { try { localStorage.setItem("mq-settings-tab", activeTab); } catch {} }, [activeTab]);

  // ── §K Theme picker — collapsed by default (compact row "Тема · Dark >"),
  // tap toggles the preview grid; selection does NOT auto-collapse (per spec:
  // collapse happens only on a repeated tap of the row).
  const [themeExpanded, setThemeExpanded] = useState(false);

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
        toast({ title: "Ошибка импорта: неверный файл", variant: "destructive" });
      }
    };
    input.click();
  }, []);

  const accentPresets = [
    "#e03131", "#8b5cf6", "#4ade80", "#f59e0b",
    "#ec4899", "#06b6d4", "#f97316", "#3b82f6",
    "#a855f7", "#10b981", "#ef4444", "#eab308",
  ];

  return (
    /* §K IA: categories → selected section → controls.
       Desktop (lg+): sticky LEFT NAV + wide content pane (no long narrow
       column). Mobile: compact scrollable pill bar. Content sections keep
       their scannable Card structure. */
    <div className="p-3 sm:p-4 lg:p-6 max-w-[var(--mq-container-narrow)] lg:max-w-[var(--mq-container-wide)] mx-auto pb-32 lg:pb-24" data-active-tab={activeTab}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4 sm:mb-5">
        <h1 className="mq-t-display text-[26px] sm:text-[30px]" style={{ color: "var(--mq-text)" }}>Настройки</h1>
        <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>Персонализируйте ваш mq</p>
      </motion.div>

      <div className="lg:flex lg:gap-6 lg:items-start">
        {/* Desktop — sticky left category nav */}
        <aside className="hidden lg:block w-[216px] flex-shrink-0">
          <div className="sticky top-24 rounded-[var(--mq-r-card)] overflow-hidden"
            style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
            {TABS.map((tab, i) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left transition-colors duration-150 hover:bg-[var(--mq-overlay-hover)]"
                  style={{
                    backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
                    color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    borderTop: i > 0 ? "1px solid var(--mq-border-hairline)" : undefined,
                    borderLeft: isActive ? "2px solid var(--mq-accent)" : "2px solid transparent",
                  }}
                  aria-current={isActive ? "true" : undefined}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mobile — compact scrollable pill bar */}
        <div className="lg:hidden sticky z-30 mb-4 sm:mb-5" style={{ top: 0, paddingTop: 8, paddingBottom: 8, backgroundColor: "var(--mq-bg)" }}>
          <div className="flex gap-1 p-1 rounded-[var(--mq-r-card)] overflow-x-auto scrollbar-none"
            style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", WebkitOverflowScrolling: "touch" }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-4 min-h-[44px] py-1.5 rounded-full mq-t-meta-2 sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 flex-shrink-0"
                  style={{ background: isActive ? "var(--mq-accent)" : "transparent", color: isActive ? "#fff" : "var(--mq-text-muted)" }}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.labelShort}</span>
                </button>
              );
            })}
          </div>
        </div>

      <div className="space-y-4 flex-1 min-w-0 lg:max-w-[760px]">
        {/* ════ ACCOUNT ════ */}
        {activeTab === "account" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
            <Card>
              <CardTitle icon={User} title="Профиль" />
              <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="relative flex-shrink-0">
                  {avatar ? (
                    <img src={avatar} alt="" className="w-14 h-14 rounded-full object-cover relative z-10" style={{ border: "1px solid var(--mq-edge-strong)" }} />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold relative z-10" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}>
                      {(username || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold truncate" style={{ color: "var(--mq-text)" }}>{username || "User"}</p>
                  <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{email || "нет"}</p>
                </div>
                <button onClick={() => setView("profile")}
                  className="px-3 py-2 rounded-[var(--mq-r-card)] text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}>
                  Открыть
                </button>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Cloud} title="Приватность и данные" />
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
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
                      style={{ backgroundColor: "var(--mq-error, #ef4444)", color: "var(--mq-text-on-accent, #fff)" }}
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Удалить навсегда
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--mq-overlay-hover)]"
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
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
            <Card>
              {/* §K Theme — compact collapsed row by default:
                  [mini preview] Тема · <current name> [chevron]
                  Tap → expands the preview grid; repeated tap → collapses.
                  Selection keeps it open; the row chevron mirrors state. */}
              <button
                onClick={() => setThemeExpanded(o => !o)}
                className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left transition-colors duration-150 hover:bg-[var(--mq-overlay-hover)]"
                aria-expanded={themeExpanded}
                aria-controls="mq-theme-picker"
              >
                {/* Mini preview of the CURRENT theme (bg + card + accent) */}
                <div
                  className="w-11 h-11 rounded-[var(--mq-r-card)] flex-shrink-0 relative overflow-hidden"
                  style={{
                    backgroundColor: (themes as any)[currentTheme]?.background || "#0e0e0e",
                    border: "1px solid var(--mq-edge)",
                  }}
                  aria-hidden
                >
                  <div className="absolute left-1.5 top-2 bottom-2 rounded-[3px]" style={{ width: 12, backgroundColor: (themes as any)[currentTheme]?.card || "#1a1a1a" }} />
                  <div className="absolute left-1.5 bottom-2 h-[3px] rounded-full" style={{ width: 12, backgroundColor: (themes as any)[currentTheme]?.accent || "#e03131" }} />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full" style={{ width: 5, height: 5, backgroundColor: (themes as any)[currentTheme]?.accent || "#e03131" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Тема</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {(themes as any)[currentTheme]?.name || currentTheme}
                  </p>
                </div>
                <ChevronDown
                  className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
                  style={{ color: "var(--mq-text-muted)", transform: themeExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              <AnimatePresence initial={false}>
                {themeExpanded && (
                  <motion.div
                    id="mq-theme-picker"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.entries(themes).map(([key, theme]: [string, any]) => {
                    const isActive = currentTheme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setTheme(key)}
                        aria-pressed={isActive}
                        title={theme.name || key}
                        data-active={isActive}
                        className="mq-swatch group relative p-2 rounded-xl flex flex-col items-center gap-1.5"
                      >
                        {/* Mini UI preview — the theme's own colors: background,
                            card block, accent bar + dot. Communicates the actual
                            look, not just a gradient ball. */}
                        <div
                          className="w-full rounded-lg overflow-hidden relative shrink-0"
                          style={{ backgroundColor: theme.background || "#0e0e0e", height: 44, border: "1px solid color-mix(in srgb, " + String(theme.text || "#fff") + " 8%, transparent)" }}
                        >
                          <div
                            className="absolute left-1.5 top-2 bottom-2 rounded-[3px]"
                            style={{ width: 14, backgroundColor: theme.card || "#1a1a1a" }}
                          />
                          <div
                            className="absolute left-1.5 bottom-2 h-[3px] rounded-full"
                            style={{ width: 14, backgroundColor: theme.accent || "#e03131" }}
                          />
                          <div
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                            style={{ width: 6, height: 6, backgroundColor: theme.accent || "#e03131" }}
                          />
                          <div
                            className="absolute left-[22px] top-2.5 h-[3px] rounded-full"
                            style={{ width: 16, backgroundColor: "color-mix(in srgb, " + String(theme.text || "#fff") + " 55%, transparent)" }}
                          />
                          <div
                            className="absolute left-[22px] top-[18px] h-[2px] rounded-full"
                            style={{ width: 10, backgroundColor: "color-mix(in srgb, " + String(theme.text || "#fff") + " 30%, transparent)" }}
                          />
                        </div>
                        <span className="mq-t-meta-2 font-medium truncate w-full text-center" style={{ color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)" }}>{theme.name || key}</span>
                        {isActive && <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}><Check className="w-2.5 h-2.5" style={{ color: "var(--mq-text-on-accent, #fff)" }} /></div>}
                      </button>
                    );
                  })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Акцент" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="flex flex-wrap gap-2">
                  {accentPresets.map(color => (
                    <button key={color} onClick={() => setCustomAccent(color)}
                      aria-label={`Акцент ${color}`}
                      className="mq-accent-dot w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: color, boxShadow: customAccent === color ? `0 0 0 3px var(--mq-bg), 0 0 0 5px ${color}` : "none" }}>
                      {customAccent === color && <Check className="w-4 h-4" style={{ color: "var(--mq-text-on-accent, #fff)" }} />}
                    </button>
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
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
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
                value={eqEnabled ? "ВКЛ" : "ВЫКЛ"}
                onClick={() => setEqOpen(true)}
              />
              <SettingToggle icon={Headphones} label="Пространственное аудио" subtitle="3D-звучание" value={spatialAudioEnabled} onCheckedChange={setSpatialAudioEnabled} />
              <SettingToggle icon={Zap} label="Gapless" subtitle="Без пауз между треками" value={gaplessEnabled} onCheckedChange={setGaplessEnabled} />
              <SettingToggle icon={Cpu} label="WASM-движок (эксперимент)" subtitle={wasmEngineEnabled ? "Rust-декодер + DSP · возможны щелчки на стыках" : "Стандартный браузерный декодер (рекомендуется)"} value={wasmEngineEnabled} onCheckedChange={setWasmEngineEnabled} />
              {/* Playback rate — segmented control (was a cyclic button whose
                  value was only discoverable after tapping; PART E 3.5). */}
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Gauge className="w-4 h-4 shrink-0" style={{ color: "var(--mq-accent)" }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>Скорость воспроизведения</p>
                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>Воспроизведение треков (не для WASM-движка)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full p-1 shrink-0" style={{ backgroundColor: "var(--mq-overlay-hover)" }}>
                    {[0.75, 1, 1.25, 1.5, 2].map((r) => {
                      const active = Math.abs(playbackRate - r) < 0.001;
                      return (
                        <button
                          key={r}
                          onClick={() => setPlaybackRate(r)}
                          className="min-w-[38px] min-h-[32px] px-1.5 rounded-full text-xs font-semibold transition-colors duration-150"
                          style={{ backgroundColor: active ? "var(--mq-accent)" : "transparent", color: active ? "var(--mq-text-on-accent, #fff)" : "var(--mq-text-muted)" }}
                          aria-pressed={active}
                        >
                          {r}×
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
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
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
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

          </motion.div>
        )}

        {/* ════ DOWNLOADS (v72: desktop-app category — APK + desktop builds + cache) ════ */}
        {activeTab === "downloads" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
            <Card>
              <CardTitle icon={Download} title="Приложение для Android" />
              <AndroidUpdateCard />
            </Card>

            <Card>
              <CardTitle icon={Download} title="Скачать приложение" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases/download/desktop-v1.0.0/MQ.Player_1.0.0_x64-setup.exe" target="_blank" rel="noopener noreferrer"
                    className="mq-dl-link flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer relative">
                    <Monitor className="w-5 h-5" style={{ color: "#3b82f6" }} />
                    <span className="mq-t-meta-2 font-semibold" style={{ color: "var(--mq-text)" }}>Windows</span>
                    <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)", fontSize: "10.5px" }}>MQ Player 1.0.0 · 11 МБ</span>
                  </a>
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases" target="_blank" rel="noopener noreferrer"
                    className="mq-dl-link flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer">
                    <Apple className="w-5 h-5" style={{ color: "#a855f7" }} />
                    <span className="mq-t-meta-2 font-semibold" style={{ color: "var(--mq-text)" }}>macOS</span>
                  </a>
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases" target="_blank" rel="noopener noreferrer"
                    className="mq-dl-link flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer">
                    <Terminal className="w-5 h-5" style={{ color: "#eab308" }} />
                    <span className="mq-t-meta-2 font-semibold" style={{ color: "var(--mq-text)" }}>Linux</span>
                  </a>
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk" target="_blank" rel="noopener noreferrer" download
                    className="mq-dl-link mq-dl-link--android flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer relative">
                    <Smartphone className="w-5 h-5" style={{ color: "#3ddc84" }} />
                    <span className="mq-t-meta-2 font-semibold" style={{ color: "color-mix(in srgb, #3ddc84 80%, var(--mq-text))" }}>Android APK</span>
                  </a>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                  <p className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
                    APK обновляется автоматически при каждом релизе
                  </p>
                  <a
                    href="https://github.com/killkinhi-a11y/mq-player/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mq-t-meta-2 font-medium underline"
                    style={{ color: "var(--mq-accent)" }}
                  >
                    Все версии →
                  </a>
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Хранилище" />
              <SettingRow icon={Trash2} label="Очистить кэш" subtitle="Закэшированные треки и изображения" onClick={handleClearCache} danger />
            </Card>
          </motion.div>
        )}

        {/* ════ ABOUT (v72: version + human release notes + hotkeys + extras) ════ */}
        {activeTab === "about" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
            {/* Phase M #14/#16: honest audio-system + deployment diagnostics.
                IA fix: moved from the "Звук" tab — system diagnostics are not
                an audio setting (PART E 3.8). */}
            <SystemDiagnosticsCard />

            <Card>
              <CardTitle icon={Info} title="О приложении" />
              <SettingRow icon={Info} label="Версия" value={typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION ? `v${process.env.NEXT_PUBLIC_APP_VERSION}` : "v1.3.0"} />
              <SettingRow icon={Cloud} label="Сервер" value={APP_URL.replace("https://", "")} />
            </Card>

            {/* v72 (task §20): the same human «Что нового» the update banner
                shows — always reachable, not only right after a deploy. */}
            <Card>
              <CardTitle icon={Sparkles} title="Что нового" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <ul className="flex flex-col gap-2">
                  {WEB_RELEASE_NOTES.map((n) => (
                    <li key={n.text} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: "var(--mq-text-muted)" }}>
                      <span
                        className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 16%, transparent)", color: "var(--mq-accent)" }}
                        aria-hidden
                      >
                        ✓
                      </span>
                      {n.text}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            {/* v72 (task §18): keyboard shortcuts reference — the same real
                bindings useKeyboardShortcuts listens to (no fake list). */}
            <Card>
              <CardTitle icon={KeyboardIcon} title="Горячие клавиши" />
              <div className="px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {SETTINGS_SHORTCUTS.map((s) => (
                    <div key={s.action} className="flex items-center justify-between gap-3 py-0.5">
                      <span className="text-[13px] min-w-0 truncate" style={{ color: "var(--mq-text-muted)" }}>{s.action}</span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 rounded font-mono mq-t-meta-2"
                            style={{ backgroundColor: "var(--mq-surface-1)", color: "var(--mq-text)", border: "1px solid var(--mq-border-hairline)" }}
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
                  Нажмите <span className="font-mono">?</span> в приложении, чтобы открыть справку целиком
                </p>
              </div>
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Контент" />
              <SettingToggle icon={Sparkles} label="ИИ-подборки" subtitle="Рекомендации на главной" value={!aiRecsHidden} onCheckedChange={(v) => setAiRecsHidden(!v)} />
            </Card>

            <Card>
              <CardTitle icon={Sparkles} title="Дополнительно" />
              <SettingToggle icon={Sparkles} label="MqCat" subtitle="Котик на экране" value={catEnabled} onCheckedChange={setCatEnabled} />
            </Card>
          </motion.div>
        )}
      </div>
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
