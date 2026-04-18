"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { themes } from "@/lib/themes";
import {
  Palette, Type, Sparkles, Minimize2, Volume2, RotateCcw, Check, Moon, Music, Shield, Zap, User, ChevronDown, ChevronUp, Settings, MessageCircle, Send, X, Loader2, Headphones, Lock, Eye, Server, Trash2, Fingerprint, Cloud, CloudOff
} from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function SettingsView() {
  const {
    currentTheme, setTheme, customAccent, setCustomAccent,
    animationsEnabled, setAnimationsEnabled, compactMode, setCompactMode,
    fontSize, setFontSize, volume, setVolume, logout, username, animationsEnabled: anim, setView,
    liquidGlassMobile, setLiquidGlassMobile, email, avatar,
    lastSyncAt, isSyncing, syncToServer, syncFromServer,
  } = useAppStore();

  const ADMIN_EMAILS = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ADMIN_EMAILS) 
    ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(",").map((e: string) => e.trim().toLowerCase())
    : ["killkin.hi@gmail.com"];
  const showAdminLink = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  const [accentInput, setAccentInput] = useState(customAccent || "");
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [supportError, setSupportError] = useState("");
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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

  const themeList = Object.values(themes);

  const handleAccentChange = (color: string) => {
    setAccentInput(color);
    setCustomAccent(color);
  };

  const handleSendSupport = async () => {
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSupportLoading(true);
    setSupportError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || "",
          subject: supportSubject.trim(),
          message: supportMessage.trim(),
          userId: useAppStore.getState().userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupportError(data.error);
        return;
      }
      setSupportSuccess(true);
      setTimeout(() => {
        setShowSupportDialog(false);
        setSupportSubject("");
        setSupportMessage("");
        setSupportSuccess(false);
      }, 2000);
    } catch {
      setSupportError("Ошибка соединения");
    } finally {
      setSupportLoading(false);
    }
  };

  const presetAccents = ["#e03131", "#8b5cf6", "#4ade80", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];

  return (
    <div className="p-4 lg:p-6 pb-40 lg:pb-28 space-y-6 max-w-2xl mx-auto">
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
          Настройки
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          Персонализируйте ваш MQ Player
        </p>
      </motion.div>

      {/* Profile */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
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
              MQ Player Premium
            </p>
          </div>
        </div>
      </motion.div>

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

      {/* Themes — collapsed by default */}
      <motion.div
        initial={anim ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
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
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Accent color */}
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

      {/* Support */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setShowSupportDialog(true); setSupportError(""); setSupportSuccess(false); }}
        className="w-full p-3 rounded-xl text-left text-sm font-medium flex items-center gap-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
      >
        <Headphones className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        Связь с поддержкой
      </motion.button>

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

      {/* Support Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: "var(--mq-text)",
            maxWidth: 480,
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--mq-text)" }}>
              <Headphones className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              Связь с поддержкой
            </DialogTitle>
          </DialogHeader>

          {supportSuccess ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(74,222,128,0.15)" }}>
                <Check className="w-7 h-7" style={{ color: "#4ade80" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#4ade80" }}>Сообщение отправлено!</p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Мы ответим на вашу почту как можно скорее</p>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                Опишите проблему или задайте вопрос. Мы ответим на <span style={{ color: "var(--mq-text)", fontWeight: 500 }}>{email || "вашу почту"}</span>
              </p>

              {supportError && (
                <div className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b" }}>
                  {supportError}
                </div>
              )}

              <div>
                <label className="text-xs mb-1.5 block" style={{ color: "var(--mq-text-muted)" }}>Тема</label>
                <input
                  type="text"
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Кратко опишите проблему"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs mb-1.5 block" style={{ color: "var(--mq-text-muted)" }}>Сообщение</label>
                <textarea
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="Подробно опишите проблему или вопрос..."
                  rows={4}
                  className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                />
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  onClick={handleSendSupport}
                  disabled={supportLoading || !supportSubject.trim() || !supportMessage.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    color: "var(--mq-text)",
                    opacity: supportLoading || !supportSubject.trim() || !supportMessage.trim() ? 0.5 : 1,
                  }}
                >
                  {supportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Отправить
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
