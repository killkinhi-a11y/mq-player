"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Send, ArrowLeft, AtSign, Check, X, Loader2, UserPlus, Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const USERNAME_LENGTH_MIN = 2;
const USERNAME_LENGTH_MAX = 20;

export default function AuthView() {
  const { authStep, setAuthStep, setAuth } = useAppStore();

  // Telegram auth states
  const [tgVerifyLoading, setTgVerifyLoading] = useState(false);
  const [tgVerifyError, setTgVerifyError] = useState("");
  const [tgRegisterLoading, setTgRegisterLoading] = useState(false);
  const [tgRegisterError, setTgRegisterError] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const tgCodeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [tgBotName, setTgBotName] = useState<string | null>(null);
  const [tgBotConfigured, setTgBotConfigured] = useState<boolean | null>(null);
  const [tgBotLoading, setTgBotLoading] = useState(true);

  // Telegram link (password for existing account)
  const [tgLinkPassword, setTgLinkPassword] = useState("");
  const [tgLinkShowPassword, setTgLinkShowPassword] = useState(false);
  const [tgLinkLoading, setTgLinkLoading] = useState(false);
  const [tgLinkError, setTgLinkError] = useState("");
  const [tgLinkEmail, setTgLinkEmail] = useState("");

  // Webhook setup
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  // Username validation
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verification code (shared between telegram and telegram-register)
  const [verifyCode, setVerifyCode] = useState<string[]>(["", "", "", "", "", ""]);

  // Auto-redirect to telegram step on mount
  useEffect(() => {
    if (authStep === "login" || authStep === "register") {
      setAuthStep("telegram");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch bot name and auto-open on mount
  useEffect(() => {
    const fetchBotInfo = async () => {
      try {
        const res = await fetch("/api/auth/telegram-bot-name");
        const data = await res.json();
        setTgBotConfigured(data.configured);
        setTgBotName(data.botName || null);

        if (data.configured && data.botName) {
          // Auto-open bot after animation
          const timer = setTimeout(() => {
            window.open(`https://t.me/${data.botName}`, "_blank", "noopener");
          }, 800);
          return () => clearTimeout(timer);
        }
      } catch {
        setTgBotConfigured(false);
      } finally {
        setTgBotLoading(false);
      }
    };
    fetchBotInfo();
  }, []);

  // Reset states when entering steps
  useEffect(() => {
    if (authStep === "telegram") {
      setVerifyCode(["", "", "", "", "", ""]);
      setTgVerifyError("");
      setTimeout(() => tgCodeInputRefs.current[0]?.focus(), 400);
    }
    if (authStep === "telegram-register") {
      setTgUsername("");
      setTgRegisterError("");
      setUsernameStatus('idle');
      setUsernameError('');
    }
  }, [authStep]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // ─── Username helpers ─────────────────────────────────
  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/auth/username-check?username=${encodeURIComponent(username)}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;

      if (!res.ok) {
        setUsernameStatus('idle');
        setUsernameError('Не удалось проверить имя, но вы можете продолжить');
        return;
      }

      if (data.available) {
        setUsernameStatus('available');
        setUsernameError('');
      } else {
        setUsernameStatus('taken');
        setUsernameError(data.error || 'Это имя уже занято');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setUsernameStatus('idle');
      setUsernameError('Нет подключения к серверу, но вы можете продолжить');
    }
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    const cleaned = value.replace('@', '').replace(/\s/g, '');
    setTgUsername(cleaned);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!cleaned) {
      setUsernameStatus('idle');
      setUsernameError('');
      return;
    }
    if (cleaned.length < USERNAME_LENGTH_MIN || cleaned.length > USERNAME_LENGTH_MAX) {
      setUsernameStatus('invalid');
      setUsernameError('От 2 до 20 символов');
      return;
    }
    if (!USERNAME_REGEX.test(cleaned)) {
      setUsernameStatus('invalid');
      setUsernameError('Имя может содержать только буквы, цифры, _ и -');
      return;
    }

    setUsernameStatus('checking');
    setUsernameError('');
    debounceTimerRef.current = setTimeout(() => {
      checkUsernameAvailability(cleaned);
    }, 300);
  }, [checkUsernameAvailability]);

  // ─── Telegram code handlers ───────────────────────────
  const handleTgCodeInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "");
    if (!digit) {
      setVerifyCode(prev => { const n = [...prev]; n[index] = ""; return n; });
      return;
    }
    setVerifyCode(prev => { const n = [...prev]; n[index] = digit[0]; return n; });
    if (index < 5) tgCodeInputRefs.current[index + 1]?.focus();
    const newCode = [...verifyCode]; newCode[index] = digit[0];
    if (newCode.every(d => d !== "")) setTimeout(() => handleTgVerify(newCode.join("")), 200);
  };

  const handleTgCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (verifyCode[index] === "" && index > 0) {
        tgCodeInputRefs.current[index - 1]?.focus();
        setVerifyCode(prev => { const n = [...prev]; n[index - 1] = ""; return n; });
      } else {
        setVerifyCode(prev => { const n = [...prev]; n[index] = ""; return n; });
      }
    }
  };

  const handleTgCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newCode = [...verifyCode];
    for (let i = 0; i < pasted.length; i++) newCode[i] = pasted[i];
    setVerifyCode(newCode);
    tgCodeInputRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) setTimeout(() => handleTgVerify(pasted), 200);
  };

  // ─── Telegram verify ──────────────────────────────────
  const handleTgVerify = async (codeStr?: string) => {
    const code = codeStr || verifyCode.join("");
    if (code.length !== 6) { setTgVerifyError("Введите 6-значный код"); return; }
    setTgVerifyLoading(true); setTgVerifyError("");
    try {
      const res = await fetch("/api/auth/telegram-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTgVerifyError(data.error);
        setVerifyCode(["", "", "", "", "", ""]);
        setTimeout(() => tgCodeInputRefs.current[0]?.focus(), 100);
        return;
      }
      if (data.isNewUser) {
        setAuthStep("telegram-register");
      } else {
        setAuth(data.userId, data.username, data.email || "", data.role, data.avatar);
      }
    } catch {
      setTgVerifyError("Ошибка соединения");
    } finally {
      setTgVerifyLoading(false);
    }
  };

  // ─── Telegram register ────────────────────────────────
  const handleTgRegister = async () => {
    if (!tgUsername) { setTgRegisterError("Введите имя пользователя"); return; }
    if (usernameStatus === 'taken') { setTgRegisterError("Это имя уже занято"); return; }
    if (usernameStatus === 'invalid') { setTgRegisterError(usernameError); return; }
    if (tgUsername.length < 2) { setTgRegisterError("От 2 до 20 символов"); return; }

    setTgRegisterLoading(true); setTgRegisterError("");
    try {
      const res = await fetch("/api/auth/telegram-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.join(""), username: tgUsername }),
      });
      const data = await res.json();
      if (!res.ok) { setTgRegisterError(data.error); return; }

      // Server asks for password — this is an existing account
      if (data.needsPassword) {
        setTgLinkEmail(data.maskedEmail || "");
        setTgLinkPassword("");
        setTgLinkError("");
        setAuthStep("telegram-link");
        return;
      }

      setAuth(data.userId, data.username, "", data.role, data.avatar);
    } catch {
      setTgRegisterError("Ошибка соединения");
    } finally {
      setTgRegisterLoading(false);
    }
  };

  // ─── Telegram link password submit ─────────────────────
  const handleTgLinkSubmit = async () => {
    if (!tgLinkPassword) { setTgLinkError("Введите пароль"); return; }
    setTgLinkLoading(true); setTgLinkError("");
    try {
      const res = await fetch("/api/auth/telegram-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.join(""), username: tgUsername, password: tgLinkPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setTgLinkError(data.error); return; }
      setAuth(data.userId, data.username, "", data.role, data.avatar);
    } catch {
      setTgLinkError("Ошибка соединения");
    } finally {
      setTgLinkLoading(false);
    }
  };

  // ─── Webhook setup ────────────────────────────────────
  const handleSetupWebhook = async () => {
    setWebhookLoading(true);
    setWebhookStatus(null);
    try {
      const res = await fetch("/api/telegram/setup-webhook", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.webhookInfo?.url) {
        setWebhookStatus(`Webhook настроен: ${data.webhookInfo.url}`);
      } else if (data.error) {
        setWebhookStatus(`Ошибка: ${data.error}`);
      } else {
        setWebhookStatus(`Результат: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      setWebhookStatus("Не удалось подключиться к серверу");
    } finally {
      setWebhookLoading(false);
    }
  };

  // ─── Demo login ───────────────────────────────────────
  const handleDemoLogin = () => {
    setAuth("demo-user-id", "Демо", "demo@mqplayer.com");
  };

  // ─── Render ───────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--mq-gradient)" }} />

      {/* Animated background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 100 + i * 60,
              height: 100 + i * 60,
              background: "radial-gradient(circle, #2AABEE 0%, transparent 70%)",
              opacity: 0.03 + i * 0.01,
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 20}%`,
            }}
            animate={{
              x: [0, 20, -10, 0],
              y: [0, -15, 10, 0],
              scale: [1, 1.1, 0.95, 1],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ─── Telegram: Code Entry (main auth screen) ─── */}
        {(authStep === "telegram" || authStep === "login" || authStep === "register") && (
          <motion.div key="telegram"
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              {/* Logo */}
              <motion.div
                className="flex items-center justify-center gap-3 mb-6"
                initial={{ opacity: 0, scale: 0.3, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}>
                <motion.div
                  animate={{
                    boxShadow: [
                      "0 0 0px rgba(42,171,238,0)",
                      "0 0 25px rgba(42,171,238,0.4)",
                      "0 0 0px rgba(42,171,238,0)",
                    ],
                    rotate: [0, 3, -3, 0],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="rounded-xl overflow-hidden"
                >
                  <img src="/favicon.ico" alt="mq" className="w-10 h-10 object-cover" />
                </motion.div>
                <motion.h1
                  className="text-4xl tracking-tight"
                  style={{ color: "#2AABEE", fontFamily: "var(--font-outfit), system-ui, sans-serif", fontWeight: 300 }}
                  animate={{
                    textShadow: [
                      "0 0 0px transparent",
                      "0 0 20px rgba(42,171,238,0.5)",
                      "0 0 0px transparent",
                    ]
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >mq</motion.h1>
              </motion.div>

              {/* Title & instructions */}
              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(42,171,238,0)", "0 0 30px rgba(42,171,238,0.2)", "0 0 0px rgba(42,171,238,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Send className="w-8 h-8" style={{ color: "#2AABEE" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Вход через Telegram</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Нажмите кнопку ниже, чтобы открыть бота в Telegram
                </p>
                <p className="text-sm font-medium mt-0.5" style={{ color: "#2AABEE" }}>
                  и отправьте любое сообщение
                </p>
                <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)" }}>
                  Бот пришлёт вам 6-значный код подтверждения
                </p>
              </motion.div>

              {/* Bot not configured warning */}
              {!tgBotLoading && tgBotConfigured === false && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-xs text-center"
                  style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.25)" }}
                >
                  Бот ещё не настроен. Обратитесь к администратору.
                </motion.div>
              )}

              {/* Open bot button */}
              {tgBotConfigured && tgBotName && (
                <motion.a
                  href={`https://t.me/${tgBotName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl text-sm font-medium transition-all duration-200 hover:brightness-110 mb-6"
                  style={{ backgroundColor: "rgba(42,171,238,0.15)", color: "#2AABEE", border: "1px solid rgba(42,171,238,0.3)" }}
                >
                  <Send className="w-4 h-4" />
                  Открыть бота в Telegram
                </motion.a>
              )}

              {/* Error */}
              {tgVerifyError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {tgVerifyError}
                </motion.div>
              )}

              {/* 6-digit code inputs */}
              <motion.div
                className="flex justify-center gap-2.5 sm:gap-3 mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
              >
                {verifyCode.map((digit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + index * 0.05, duration: 0.3 }}
                  >
                    <input
                      ref={(el) => { tgCodeInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleTgCodeInput(index, e.target.value)}
                      onKeyDown={(e) => handleTgCodeKeyDown(index, e)}
                      onPaste={index === 0 ? handleTgCodePaste : undefined}
                      disabled={tgVerifyLoading}
                      className="w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl outline-none transition-all duration-200"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `2px solid ${tgVerifyError ? '#ef4444' : digit ? '#2AABEE' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)",
                        caretColor: "#2AABEE",
                        boxShadow: digit ? '0 0 12px rgba(42,171,238,0.15)' : 'none',
                      }}
                      autoComplete="one-time-code"
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Verify button */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }}>
                <Button
                  onClick={() => handleTgVerify()}
                  disabled={tgVerifyLoading || verifyCode.some(d => !d)}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "#2AABEE", color: "#ffffff" }}
                >
                  {tgVerifyLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Подтвердить"}
                </Button>
              </motion.div>

              {/* Bottom links */}
              <motion.div className="mt-6 pt-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--mq-border)" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.3 }}>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={handleDemoLogin} className="text-sm h-auto p-0"
                    style={{ color: "var(--mq-text-muted)" }}>
                    Демо-режим
                  </Button>
                  {tgBotConfigured && tgBotName && (
                    <a
                      href={`https://t.me/${tgBotName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 hover:brightness-110"
                      style={{ color: "#2AABEE" }}
                    >
                      <Send className="w-4 h-4" />
                      Открыть бота
                    </a>
                  )}
                </div>

                {/* Webhook setup (for admin) */}
                {tgBotConfigured && (
                  <div className="flex flex-col gap-1.5">
                    <Button
                      variant="ghost"
                      onClick={handleSetupWebhook}
                      disabled={webhookLoading}
                      className="text-xs h-auto p-0 w-fit"
                      style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}
                    >
                      {webhookLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Настроить webhook
                    </Button>
                    {webhookStatus && (
                      <p className="text-[10px] leading-tight" style={{ color: webhookStatus.includes("Ошибка") ? "#ff6b6b" : "var(--mq-text-muted)" }}>
                        {webhookStatus}
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => window.open("/api/telegram/diagnose", "_blank")}
                      className="text-xs h-auto p-0 w-fit"
                      style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}
                    >
                      Диагностика бота
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ─── Telegram: New User Registration ─── */}
        {authStep === "telegram-register" && (
          <motion.div key="telegram-register"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => { setAuthStep("telegram"); }} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(42,171,238,0)", "0 0 25px rgba(42,171,238,0.3)", "0 0 0px rgba(42,171,238,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <UserPlus className="w-8 h-8" style={{ color: "#2AABEE" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Новый аккаунт</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Telegram подтверждён! Выберите имя пользователя
                </p>
              </motion.div>

              {tgRegisterError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {tgRegisterError}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input placeholder="username" value={tgUsername}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      className="pl-10 pr-9" style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `1px solid ${usernameStatus === 'available' ? '#22c55e' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)"
                      }} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AnimatePresence mode="wait">
                        {usernameStatus === 'checking' && (
                          <motion.div key="tg-checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                          </motion.div>
                        )}
                        {usernameStatus === 'available' && (
                          <motion.div key="tg-available" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                          </motion.div>
                        )}
                        {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                          <motion.div key="tg-error" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <X className="w-4 h-4" style={{ color: "#ef4444" }} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <AnimatePresence mode="wait">
                    {usernameStatus === 'available' && (
                      <motion.p key="tg-avail" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#22c55e" }}>
                        <Check className="w-3 h-3" /> Имя доступно
                      </motion.p>
                    )}
                    {usernameStatus === 'taken' && usernameError && (
                      <motion.p key="tg-taken" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" /> {usernameError}
                      </motion.p>
                    )}
                    {usernameStatus === 'invalid' && usernameError && (
                      <motion.p key="tg-inv" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" /> {usernameError}
                      </motion.p>
                    )}
                    {usernameStatus === 'idle' && (
                      <motion.p key="tg-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Отображается как @{tgUsername || "..."}
                      </motion.p>
                    )}
                    {usernameStatus === 'checking' && (
                      <motion.p key="tg-checking-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Проверка имени...
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <Button onClick={handleTgRegister}
                  disabled={tgRegisterLoading || !tgUsername || usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                  className="w-full min-h-[44px]" style={{ backgroundColor: "#2AABEE", color: "#ffffff" }}>
                  {tgRegisterLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Создать аккаунт"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Telegram: Link to existing account (password required) ─── */}
        {authStep === "telegram-link" && (
          <motion.div key="telegram-link"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => { setAuthStep("telegram-register"); setTgLinkError(""); }} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(42,171,238,0)", "0 0 25px rgba(42,171,238,0.3)", "0 0 0px rgba(42,171,238,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Lock className="w-8 h-8" style={{ color: "#2AABEE" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Подтверждение аккаунта</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Аккаунт <span className="font-medium" style={{ color: "var(--mq-text)" }}>@{tgUsername}</span> уже существует
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
                  Email: {tgLinkEmail}
                </p>
                <p className="text-sm mt-2" style={{ color: "#2AABEE" }}>
                  Введите пароль для привязки Telegram
                </p>
              </motion.div>

              {tgLinkError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {tgLinkError}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                  <div className="relative">
                    <Input
                      type={tgLinkShowPassword ? "text" : "password"}
                      placeholder="Введите пароль от аккаунта"
                      value={tgLinkPassword}
                      onChange={(e) => setTgLinkPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleTgLinkSubmit(); }}
                      className="pr-10"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `1px solid ${tgLinkError ? '#ef4444' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setTgLinkShowPassword(!tgLinkShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {tgLinkShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button onClick={handleTgLinkSubmit}
                  disabled={tgLinkLoading || !tgLinkPassword}
                  className="w-full min-h-[44px]" style={{ backgroundColor: "#2AABEE", color: "#ffffff" }}>
                  {tgLinkLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Привязать Telegram"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
