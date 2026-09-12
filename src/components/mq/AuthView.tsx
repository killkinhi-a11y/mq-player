"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Send, ArrowLeft, AtSign, Check, X, Loader2, UserPlus, Lock, Eye, EyeOff, Mail, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const USERNAME_LENGTH_MIN = 2;
const USERNAME_LENGTH_MAX = 20;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Human-readable messages for OAuth redirect error codes
// (set by /api/auth/google/callback and /api/auth/telegram-widget/callback)
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Вход через Google ещё не настроен. Обратитесь к администратору.",
  google_cancelled: "Вход через Google отменён.",
  invalid_state: "Проверка безопасности не пройдена. Попробуйте войти снова.",
  missing_code: "Google не передал код авторизации. Попробуйте снова.",
  google_exchange_failed: "Не удалось завершить вход через Google. Попробуйте позже.",
  google_token_invalid: "Данные Google не прошли проверку. Попробуйте снова.",
  google_failed: "Ошибка входа через Google. Попробуйте позже.",
  telegram_hash_invalid: "Не удалось подтвердить данные Telegram. Попробуйте снова.",
  telegram_failed: "Ошибка входа через Telegram. Попробуйте позже.",
  blocked: "Аккаунт заблокирован.",
  maintenance: "Проводятся технические работы. Вход временно недоступен.",
  account_missing: "Аккаунт не найден. Обратитесь в поддержку.",
};

interface AuthProviders {
  google: boolean;
  telegramWidget: boolean;
  telegramBot: boolean;
  telegramBotName: string | null;
  email: boolean;
  emailDelivery: boolean;
}

/** Google "G" logo (official multicolor SVG paths). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.307c-1.646,4.646-6.07,8-11.307,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.514,6.757,29.604,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.335,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.835C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.514,6.757,29.604,4,24,4C16.318,4,9.656,8.336,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.236,0-9.657-3.347-11.307-7.99l-6.534,5.046C9.505,39.556,16.228,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.307c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.36,33.131,44,27.417,44,24C44,22.659,43.862,21.335,43.611,20.083z" />
    </svg>
  );
}

/** Reusable 6-digit code input (email confirmation / password reset). */
function CodeBoxes({
  value,
  onChange,
  onAutoSubmit,
  disabled,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onAutoSubmit?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "");
    if (!digit) {
      onChange(value.map((d, i) => (i === index ? "" : d)));
      return;
    }
    const next = value.map((d, i) => (i === index ? digit[0] : d));
    onChange(next);
    if (index < 5) refs.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && onAutoSubmit) {
      setTimeout(() => onAutoSubmit(next.join("")), 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (value[index] === "" && index > 0) {
        refs.current[index - 1]?.focus();
        onChange(value.map((d, i) => (i === index - 1 ? "" : d)));
      } else {
        onChange(value.map((d, i) => (i === index ? "" : d)));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...value];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    onChange(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6 && onAutoSubmit) {
      setTimeout(() => onAutoSubmit(pasted), 200);
    }
  };

  return (
    <div className="flex justify-center gap-2.5 sm:gap-3">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleInput(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          disabled={disabled}
          className="w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl outline-none transition-all duration-200"
          style={{
            backgroundColor: "var(--mq-input-bg)",
            border: `2px solid ${error ? '#ef4444' : digit ? 'var(--mq-accent, #e03131)' : 'var(--mq-border)'}`,
            color: "var(--mq-text)",
            caretColor: "var(--mq-accent, #e03131)",
          }}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

export default function AuthView() {
  const authStep = useAppStore((s) => s.authStep);
  const setAuthStep = useAppStore((s) => s.setAuthStep);
  const setAuth = useAppStore((s) => s.setAuth);

  // ─── Provider availability (server probe — no secrets) ──────────────
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  // ─── Post-OAuth redirect state (URL params) ─────────────────────────
  const [restoringSession, setRestoringSession] = useState(false);
  const [redirectError, setRedirectError] = useState("");

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

  // Telegram Login Widget (official) — pending registration
  const pendingTgWidgetRef = useRef<string | null>(null);
  const [widgetLinkMode, setWidgetLinkMode] = useState(false);
  const [tgrUsername, setTgrUsername] = useState("");
  const [tgrLoading, setTgrLoading] = useState(false);
  const [tgrError, setTgrError] = useState("");

  // Username validation
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verification code (shared between telegram and telegram-register)
  const [verifyCode, setVerifyCode] = useState<string[]>(["", "", "", "", "", ""]);

  // ─── Email login ────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [showConfirmHint, setShowConfirmHint] = useState(false);

  // ─── Email registration ─────────────────────────────────────────────
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // ─── Email confirmation (6-digit code) ──────────────────────────────
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmCode, setConfirmCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmInfo, setConfirmInfo] = useState("");
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);

  // ─── Forgot password ────────────────────────────────────────────────
  const [fpStage, setFpStage] = useState<"request" | "reset">("request");
  const [fpEmail, setFpEmail] = useState("");
  const [fpCode, setFpCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [fpNewPassword, setFpNewPassword] = useState("");
  const [fpConfirmPassword, setFpConfirmPassword] = useState("");
  const [fpShowPassword, setFpShowPassword] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpInfo, setFpInfo] = useState("");

  // ─── Fetch provider availability on mount ───────────────────────────
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch("/api/auth/providers");
        const data = await res.json();
        setProviders(data);
        setTgBotConfigured(data.telegramBot);
        setTgBotName(data.telegramBotName || null);
      } catch {
        setTgBotConfigured(false);
        setProviders(null);
      } finally {
        setTgBotLoading(false);
      }
    };
    fetchProviders();
  }, []);

  // ─── Handle OAuth redirect result (URL params) on mount ─────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authParam = url.searchParams.get("auth");
    const authErrorParam = url.searchParams.get("authError");
    const authStepParam = url.searchParams.get("authStep");
    const tokenParam = url.searchParams.get("token");

    if (authParam || authErrorParam || authStepParam || tokenParam) {
      url.searchParams.delete("auth");
      url.searchParams.delete("authError");
      url.searchParams.delete("authStep");
      url.searchParams.delete("token");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
    }

    if (authErrorParam) {
      setRedirectError(AUTH_ERROR_MESSAGES[authErrorParam] || "Ошибка авторизации. Попробуйте ещё раз.");
    }

    // Telegram widget new-user registration → username selection screen
    if (authStepParam === "telegram-widget-register" && tokenParam) {
      pendingTgWidgetRef.current = tokenParam;
      // Prefill suggestion from the signed token payload (server re-verifies it)
      try {
        const b64 = tokenParam.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(b64));
        if (payload.username) {
          const suggestion = String(payload.username).toLowerCase().slice(0, 20).replace(/[^a-z0-9_-]/g, "");
          if (suggestion.length >= 2) setTgrUsername(suggestion);
        }
      } catch {
        // Prefill is best-effort only
      }
      setAuthStep("telegram-widget-register");
      return;
    }

    // Successful OAuth callback → session cookie already set → restore
    if (authParam === "success") {
      setRestoringSession(true);
      fetch("/api/auth/me", { credentials: "include" })
        .then(async (r) => {
          if (!r.ok) throw new Error("unauthenticated");
          return r.json();
        })
        .then((me) => {
          if (me && me.authenticated) {
            setAuth(me.userId, me.username, me.email, me.role, me.avatar, me.telegramUsername);
          } else {
            throw new Error("unauthenticated");
          }
        })
        .catch(() => {
          setRestoringSession(false);
          setRedirectError("Не удалось завершить вход. Попробуйте ещё раз.");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Official Telegram Login Widget script injection ────────────────
  const tgWidgetContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (authStep !== "telegram") return;
    if (!providers?.telegramWidget || !providers.telegramBotName) return;
    if (typeof window === "undefined") return;
    const container = tgWidgetContainerRef.current;
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", providers.telegramBotName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    // Full-page redirect with auth data → server-side hash verification
    script.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/auth/telegram-widget/callback`
    );
    container.appendChild(script);
  }, [authStep, providers]);

  // ─── Reset states when entering steps ───────────────────────────────
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
    if (authStep === "telegram-widget-register") {
      setTgrError("");
      setUsernameStatus('idle');
      setUsernameError('');
    }
    if (authStep === "login") {
      setLoginError("");
      setShowConfirmHint(false);
    }
    if (authStep === "register") {
      setRegError("");
    }
    if (authStep === "confirm") {
      setConfirmError("");
      setConfirmInfo("");
    }
    if (authStep === "forgot-password") {
      setFpError("");
      setFpInfo("");
      setFpStage("request");
    }
  }, [authStep]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // ─── Username helpers ───────────────────────────────────────────────
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

  const handleUsernameChange = useCallback((value: string, forWidget: boolean) => {
    const cleaned = value.replace('@', '').replace(/\s/g, '');
    if (forWidget) {
      setTgrUsername(cleaned);
    } else {
      setTgUsername(cleaned);
    }

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

  // ─── Google OAuth (full-page redirect — mobile + popup-blocker safe) ─
  const handleGoogleLogin = () => {
    if (!providers?.google || googleRedirecting) return;
    setGoogleRedirecting(true);
    window.location.href = "/api/auth/google";
  };

  // ─── Telegram code handlers (bot flow) ──────────────────────────────
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

  // ─── Telegram verify (bot flow) ─────────────────────────────────────
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
        setAuth(data.userId, data.username, data.email || "", data.role, data.avatar, data.telegramUsername);
      }
    } catch {
      setTgVerifyError("Ошибка соединения");
    } finally {
      setTgVerifyLoading(false);
    }
  };

  // ─── Telegram register (bot flow) ───────────────────────────────────
  const handleTgRegister = async () => {
    if (!tgUsername) { setTgRegisterError("Введите имя пользователя"); return; }
    if (usernameStatus === 'invalid') { setTgRegisterError(usernameError); return; }
    if (tgUsername.length < 2) { setTgRegisterError("От 2 до 20 символов"); return; }

    // If username is 'taken', clear the frontend-only error and let backend
    // decide — it may return needsPassword to link an existing account
    setTgRegisterError("");

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
        setWidgetLinkMode(false);
        setAuthStep("telegram-link");
        return;
      }

      setAuth(data.userId, data.username, "", data.role, data.avatar, data.telegramUsername);
    } catch {
      setTgRegisterError("Ошибка соединения");
    } finally {
      setTgRegisterLoading(false);
    }
  };

  // ─── Telegram widget register (official Login Widget) ────────────────
  const handleWidgetRegister = async () => {
    if (!pendingTgWidgetRef.current) {
      setTgrError("Сессия авторизации истекла. Вернитесь и войдите через Telegram.");
      return;
    }
    if (!tgrUsername) { setTgrError("Введите имя пользователя"); return; }
    if (usernameStatus === 'invalid') { setTgrError(usernameError); return; }

    setTgrLoading(true); setTgrError("");
    try {
      const res = await fetch("/api/auth/telegram-widget/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingTgWidgetRef.current, username: tgrUsername }),
      });
      const data = await res.json();
      if (!res.ok) { setTgrError(data.error); return; }

      if (data.needsPassword) {
        setTgLinkEmail(data.maskedEmail || "");
        setTgLinkPassword("");
        setTgLinkError("");
        setWidgetLinkMode(true);
        setAuthStep("telegram-link");
        return;
      }

      setAuth(data.userId, data.username, "", data.role, data.avatar, data.telegramUsername);
    } catch {
      setTgrError("Ошибка соединения");
    } finally {
      setTgrLoading(false);
    }
  };

  // ─── Telegram link password submit (bot OR widget mode) ─────────────
  const handleTgLinkSubmit = async () => {
    if (!tgLinkPassword) { setTgLinkError("Введите пароль"); return; }
    setTgLinkLoading(true); setTgLinkError("");
    try {
      let res: Response;
      if (widgetLinkMode && pendingTgWidgetRef.current) {
        res = await fetch("/api/auth/telegram-widget/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: pendingTgWidgetRef.current,
            username: tgrUsername,
            password: tgLinkPassword,
          }),
        });
      } else {
        res = await fetch("/api/auth/telegram-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: verifyCode.join(""), username: tgUsername, password: tgLinkPassword }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setTgLinkError(data.error); return; }
      setAuth(data.userId, data.username, "", data.role, data.avatar, data.telegramUsername);
    } catch {
      setTgLinkError("Ошибка соединения");
    } finally {
      setTgLinkLoading(false);
    }
  };

  // ─── Email login ────────────────────────────────────────────────────
  const handleEmailLogin = async () => {
    if (!loginEmail || !loginPassword) {
      setLoginError("Введите email и пароль");
      return;
    }
    setLoginLoading(true); setLoginError(""); setShowConfirmHint(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Ошибка входа");
        // Unconfirmed account → offer the confirmation screen
        if (res.status === 403 && typeof data.error === "string" && data.error.toLowerCase().includes("подтверд")) {
          setShowConfirmHint(true);
        }
        return;
      }
      setAuth(data.userId, data.username, data.email, data.role, data.avatar);
    } catch {
      setLoginError("Ошибка соединения. Проверьте интернет.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ─── Email registration ─────────────────────────────────────────────
  const handleRegister = async () => {
    if (!regUsername || !regEmail || !regPassword) {
      setRegError("Все поля обязательны");
      return;
    }
    if (!USERNAME_REGEX.test(regUsername) || regUsername.length < USERNAME_LENGTH_MIN || regUsername.length > USERNAME_LENGTH_MAX) {
      setRegError("Имя пользователя: 2-20 символов, только буквы, цифры, _ и -");
      return;
    }
    if (!EMAIL_REGEX.test(regEmail)) {
      setRegError("Некорректный адрес электронной почты");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Пароль должен быть не менее 6 символов");
      return;
    }

    setRegLoading(true); setRegError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, email: regEmail, password: regPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || "Ошибка регистрации");
        return;
      }
      // Success → email confirmation step
      setConfirmEmail(regEmail);
      setConfirmCode(["", "", "", "", "", ""]);
      setDevCodeHint(data.devCode || null);
      setAuthStep("confirm");
    } catch {
      setRegError("Ошибка соединения. Проверьте интернет.");
    } finally {
      setRegLoading(false);
    }
  };

  // ─── Email confirmation ─────────────────────────────────────────────
  const handleConfirmVerify = async (codeStr?: string) => {
    const code = codeStr || confirmCode.join("");
    if (code.length !== 6) { setConfirmError("Введите 6-значный код"); return; }
    if (!confirmEmail) { setConfirmError("Не указан email. Начните регистрацию заново."); return; }
    setConfirmLoading(true); setConfirmError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || "Неверный код");
        setConfirmCode(["", "", "", "", "", ""]);
        return;
      }
      // Server sets the session cookie — auto-login
      setAuth(data.userId, data.username, confirmEmail, data.role, data.avatar);
    } catch {
      setConfirmError("Ошибка соединения");
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!confirmEmail) return;
    setConfirmInfo("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmInfo(data.message || "Код отправлен на email");
        if (data.devCode) setDevCodeHint(data.devCode);
      } else {
        setConfirmInfo(data.error || "Не удалось отправить код");
      }
    } catch {
      setConfirmInfo("Ошибка соединения");
    }
  };

  // ─── Forgot password ────────────────────────────────────────────────
  const handleForgotRequest = async () => {
    if (!fpEmail || !EMAIL_REGEX.test(fpEmail)) {
      setFpError("Введите корректный email");
      return;
    }
    setFpLoading(true); setFpError(""); setFpInfo("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFpError(data.error || "Не удалось отправить код");
        return;
      }
      // Generic response — never reveals whether the email is registered
      setFpInfo(data.message || "Если аккаунт с такой почтой существует, код отправлен.");
      if (data.devCode) {
        // Dev convenience: prefill the code
        const digits = String(data.devCode).slice(0, 6).split("");
        setFpCode(digits.map((d, i) => (i < 6 ? d : "")));
      }
      setFpStage("reset");
    } catch {
      setFpError("Ошибка соединения");
    } finally {
      setFpLoading(false);
    }
  };

  const handleResetPassword = async (codeStr?: string) => {
    const code = codeStr || fpCode.join("");
    if (code.length !== 6) { setFpError("Введите 6-значный код"); return; }
    if (fpNewPassword.length < 6) { setFpError("Новый пароль должен быть не менее 6 символов"); return; }
    if (fpNewPassword !== fpConfirmPassword) { setFpError("Пароли не совпадают"); return; }

    setFpLoading(true); setFpError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, code, newPassword: fpNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFpError(data.error || "Не удалось изменить пароль");
        return;
      }
      // Success → back to login with the new password
      setLoginSuccess("Пароль изменён. Войдите с новым паролем.");
      setLoginEmail(fpEmail);
      setLoginPassword("");
      setFpNewPassword("");
      setFpConfirmPassword("");
      setFpCode(["", "", "", "", "", ""]);
      setFpStage("request");
      setAuthStep("login");
    } catch {
      setFpError("Ошибка соединения");
    } finally {
      setFpLoading(false);
    }
  };

  // ─── Demo login ─────────────────────────────────────────────────────
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      setAuth("demo-user-id", "Демо", "demo@mq-player.internal");
      useAppStore.setState({ demoLoading: true });
      const { DEMO_TRACKS } = await import("@/lib/demoTracks");
      await new Promise((r) => setTimeout(r, 300));
      const store = useAppStore.getState();
      if (store.queue.length === 0) {
        useAppStore.setState({
          queue: DEMO_TRACKS,
          currentTrack: DEMO_TRACKS[0],
          isPlaying: false,
          queueIndex: 0,
          demoLoading: false,
        });
      } else {
        useAppStore.setState({ demoLoading: false });
      }
    } catch (err) {
      console.error("[Demo] Failed to load:", err);
      setDemoLoading(false);
      useAppStore.setState({ demoLoading: false });
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────
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
              background: "radial-gradient(circle, var(--mq-telegram) 0%, transparent 70%)",
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

      {/* Session restore overlay (after OAuth redirect back) */}
      <AnimatePresence>
        {restoringSession && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
            style={{ backgroundColor: "var(--mq-bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--mq-accent, #e03131)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Завершаем вход…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* ─── Landing: provider selection + Telegram code entry ─── */}
        {authStep === "telegram" && (
          <motion.div key="telegram"
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              {/* Title */}
              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(224,49,49,0)", "0 0 30px rgba(224,49,49,0.25)", "0 0 0px rgba(224,49,49,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="text-2xl font-black text-white">mq</span>
                </motion.div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Вход в MQ Player</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Музыка, плейлисты и чаты синхронизированы между устройствами
                </p>
              </motion.div>

              {/* OAuth redirect error (from URL param) */}
              {redirectError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {redirectError}
                </motion.div>
              )}

              {/* Continue with Google */}
              <motion.button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleRedirecting || tgBotLoading || (providers !== null && !providers.google)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.3 }}
                className="flex items-center justify-center gap-2.5 w-full min-h-[44px] rounded-xl text-sm font-medium transition-[filter,transform] duration-200 hover:brightness-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#ffffff", color: "#1f2937", border: "1px solid #e5e7eb" }}
              >
                {googleRedirecting || (tgBotLoading && providers === null) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon className="w-[18px] h-[18px]" />
                    {providers !== null && !providers.google ? "Google недоступен (не настроен)" : "Продолжить с Google"}
                  </>
                )}
              </motion.button>

              {/* Continue with Telegram — official Login Widget */}
              {providers?.telegramWidget && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="mt-3 flex justify-center min-h-[40px]"
                >
                  <div ref={tgWidgetContainerRef} />
                </motion.div>
              )}

              {/* Telegram bot-code flow (fallback — works everywhere) */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
                className="mt-4 pt-4"
                style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
              >
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Send className="w-4 h-4" style={{ color: "var(--mq-telegram)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                    Вход через Telegram
                  </p>
                </div>
                <p className="text-xs text-center mb-3" style={{ color: "var(--mq-text-muted)" }}>
                  Откройте бота в Telegram и отправьте любое сообщение. Бот пришлёт 6-значный код подтверждения
                </p>

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

                {/* Open bot button — ?start=code triggers /code automatically */}
                {tgBotConfigured && tgBotName && (
                  <motion.a
                    href={`https://t.me/${tgBotName}?start=code`}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl text-sm font-medium transition-[filter,background-color] duration-200 hover:brightness-110 mb-4"
                    style={{ backgroundColor: "rgba(42,171,238,0.15)", color: "var(--mq-telegram)", border: "1px solid rgba(42,171,238,0.3)" }}
                  >
                    <Send className="w-4 h-4" />
                    Открыть бота в Telegram
                  </motion.a>
                )}

                {/* Telegram code error */}
                {tgVerifyError && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 rounded-lg text-sm text-center"
                    style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                    {tgVerifyError}
                  </motion.div>
                )}

                {/* 6-digit code inputs */}
                <motion.div
                  className="flex justify-center gap-2.5 sm:gap-3 mb-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.4 }}
                >
                  {verifyCode.map((digit, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + index * 0.05, duration: 0.3 }}
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
                          border: `2px solid ${tgVerifyError ? '#ef4444' : digit ? 'var(--mq-telegram)' : 'var(--mq-border)'}`,
                          color: "var(--mq-text)",
                          caretColor: "var(--mq-telegram)",
                          boxShadow: digit ? '0 0 12px rgba(42,171,238,0.15)' : 'none',
                        }}
                        autoComplete="one-time-code"
                      />
                    </motion.div>
                  ))}
                </motion.div>

                {/* Verify button */}
                <Button
                  onClick={() => handleTgVerify()}
                  disabled={tgVerifyLoading || verifyCode.some(d => !d)}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "var(--mq-telegram)", color: "#ffffff" }}
                >
                  {tgVerifyLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Подтвердить"}
                </Button>
              </motion.div>

              {/* Continue with Email */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.3 }}
                className="mt-4"
              >
                <Button
                  variant="outline"
                  onClick={() => setAuthStep("login")}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2.5"
                  style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}
                >
                  <Mail className="w-4 h-4" />
                  Продолжить с Email
                </Button>
              </motion.div>

              {/* Bottom links */}
              <motion.div className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.3 }}>
                <Button variant="ghost" onClick={handleDemoLogin} disabled={demoLoading} className="text-sm h-auto p-0 flex items-center gap-2"
                  style={{ color: "var(--mq-text-muted)" }}>
                  {demoLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка...</> : "Демо-режим"}
                </Button>
                <button
                  type="button"
                  onClick={() => setAuthStep("register")}
                  className="text-sm font-medium transition-opacity hover:opacity-80 py-2 px-1"
                  style={{ color: "var(--mq-text)" }}
                >
                  Регистрация
                </button>
              </motion.div>

              {/* Legal links — real routes (Google OAuth branding requirement) */}
              <motion.div
                className="mt-4 pt-4 flex items-center justify-center gap-2 text-xs"
                style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65, duration: 0.3 }}
              >
                <a href="/privacy" className="underline underline-offset-2 hover:opacity-80 transition-opacity py-2 px-1" style={{ color: "var(--mq-text-muted)" }}>
                  Политика конфиденциальности
                </a>
                <span style={{ color: "var(--mq-text-muted)" }}>·</span>
                <a href="/terms" className="underline underline-offset-2 hover:opacity-80 transition-opacity py-2 px-1" style={{ color: "var(--mq-text-muted)" }}>
                  Условия использования
                </a>
              </motion.div>

            </div>
          </motion.div>
        )}

        {/* ─── Email: Login ─── */}
        {authStep === "login" && (
          <motion.div key="login"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => setAuthStep("telegram")} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(224,49,49,0)", "0 0 25px rgba(224,49,49,0.2)", "0 0 0px rgba(224,49,49,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Mail className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Вход по Email</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Введите email и пароль от вашего аккаунта
                </p>
              </motion.div>

              {/* Success banner (e.g. after password reset) */}
              {loginSuccess && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                  {loginSuccess}
                </motion.div>
              )}

              {loginError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {loginError}
                </motion.div>
              )}

              {/* Unconfirmed account → jump straight to confirmation */}
              {showConfirmHint && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
                  <Button
                    onClick={() => { setConfirmEmail(loginEmail); setConfirmCode(["", "", "", "", "", ""]); setDevCodeHint(null); setAuthStep("confirm"); }}
                    className="w-full min-h-[44px]"
                    style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "var(--mq-accent, #e03131)", border: "1px solid rgba(224,49,49,0.3)" }}
                  >
                    Подтвердить почту
                  </Button>
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEmailLogin(); }}
                      className="pl-10"
                      autoComplete="email"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${loginError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                  <div className="relative">
                    <Input
                      type={loginShowPassword ? "text" : "password"}
                      placeholder="Введите пароль"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEmailLogin(); }}
                      className="pr-10"
                      autoComplete="current-password"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${loginError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setLoginShowPassword(!loginShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--mq-text-muted)" }}
                      aria-label={loginShowPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {loginShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button onClick={handleEmailLogin}
                  disabled={loginLoading || !loginEmail || !loginPassword}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#ffffff" }}>
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Войти"}
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" onClick={() => setAuthStep("forgot-password")}
                  className="transition-opacity hover:opacity-80" style={{ color: "var(--mq-text-muted)" }}>
                  Забыли пароль?
                </button>
                <button type="button" onClick={() => setAuthStep("register")}
                  className="font-medium transition-opacity hover:opacity-80" style={{ color: "var(--mq-accent, #e03131)" }}>
                  Создать аккаунт
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Email: Registration ─── */}
        {authStep === "register" && (
          <motion.div key="register"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => setAuthStep("telegram")} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Регистрация</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Создайте аккаунт по email: музыка и чаты на всех устройствах
                </p>
              </motion.div>

              {/* Email delivery warning (admin has not configured Brevo) */}
              {providers !== null && !providers.emailDelivery && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-xs text-center flex items-start gap-2"
                  style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "#fbbf24", border: "1px solid rgba(234,179,8,0.25)" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Email-сервис не настроен. Код подтверждения придёт только в dev-режиме.</span>
                </motion.div>
              )}

              {regError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {regError}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input
                      placeholder="username"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value.replace(/\s/g, ''))}
                      className="pl-10"
                      autoComplete="username"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: '1px solid var(--mq-border)', color: "var(--mq-text)" }}
                    />
                  </div>
                  <p className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    2-20 символов: буквы, цифры, _ и - (отображается как @{regUsername || "..."})
                  </p>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-10"
                      autoComplete="email"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: '1px solid var(--mq-border)', color: "var(--mq-text)" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                  <div className="relative">
                    <Input
                      type={regShowPassword ? "text" : "password"}
                      placeholder="Минимум 6 символов"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
                      className="pr-10"
                      autoComplete="new-password"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: '1px solid var(--mq-border)', color: "var(--mq-text)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowPassword(!regShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--mq-text-muted)" }}
                      aria-label={regShowPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {regShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button onClick={handleRegister}
                  disabled={regLoading || !regUsername || !regEmail || !regPassword}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#ffffff" }}>
                  {regLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Зарегистрироваться"}
                </Button>
              </div>

              <div className="mt-4 text-center text-sm">
                <span style={{ color: "var(--mq-text-muted)" }}>Уже есть аккаунт? </span>
                <button type="button" onClick={() => setAuthStep("login")}
                  className="font-medium transition-opacity hover:opacity-80" style={{ color: "var(--mq-accent, #e03131)" }}>
                  Войти
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Email: Confirm code ─── */}
        {authStep === "confirm" && (
          <motion.div key="confirm"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => setAuthStep("login")} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <Check className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Подтверждение почты</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Код отправлен на <span className="font-medium" style={{ color: "var(--mq-text)" }}>{confirmEmail}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
                  Введите 6-значный код из письма
                </p>
              </motion.div>

              {devCodeHint && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="mb-4 p-3 rounded-lg text-xs text-center"
                  style={{ backgroundColor: "rgba(42,171,238,0.1)", color: "var(--mq-telegram)", border: "1px solid rgba(42,171,238,0.25)" }}>
                  Dev-режим (email не настроен): ваш код <span className="font-bold">{devCodeHint}</span>
                </motion.div>
              )}

              {confirmInfo && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                  {confirmInfo}
                </motion.div>
              )}

              {confirmError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {confirmError}
                </motion.div>
              )}

              <CodeBoxes
                value={confirmCode}
                onChange={setConfirmCode}
                onAutoSubmit={(code) => handleConfirmVerify(code)}
                disabled={confirmLoading}
                error={!!confirmError}
              />

              <div className="mt-6 space-y-3">
                <Button onClick={() => handleConfirmVerify()}
                  disabled={confirmLoading || confirmCode.some(d => !d)}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#ffffff" }}>
                  {confirmLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Подтвердить"}
                </Button>
                <Button variant="ghost" onClick={handleResendCode} disabled={confirmLoading}
                  className="w-full min-h-[44px] text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Отправить код повторно
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Email: Forgot password ─── */}
        {authStep === "forgot-password" && (
          <motion.div key="forgot-password"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button
                onClick={() => setAuthStep(fpStage === "reset" ? "login" : "login")}
                className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <Lock className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                  {fpStage === "request" ? "Восстановление пароля" : "Новый пароль"}
                </h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  {fpStage === "request"
                    ? "Введите email аккаунта, мы отправим код подтверждения"
                    : "Введите код из письма и новый пароль"}
                </p>
              </motion.div>

              {fpInfo && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                  {fpInfo}
                </motion.div>
              )}

              {fpError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {fpError}
                </motion.div>
              )}

              {fpStage === "request" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={fpEmail}
                        onChange={(e) => setFpEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleForgotRequest(); }}
                        className="pl-10"
                        autoComplete="email"
                        style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                      />
                    </div>
                  </div>
                  <Button onClick={handleForgotRequest}
                    disabled={fpLoading || !fpEmail}
                    className="w-full min-h-[44px]"
                    style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#ffffff" }}>
                    {fpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Отправить код"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <CodeBoxes
                    value={fpCode}
                    onChange={setFpCode}
                    disabled={fpLoading}
                    error={!!fpError}
                  />
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Новый пароль</label>
                    <div className="relative">
                      <Input
                        type={fpShowPassword ? "text" : "password"}
                        placeholder="Минимум 6 символов"
                        value={fpNewPassword}
                        onChange={(e) => setFpNewPassword(e.target.value)}
                        className="pr-10"
                        autoComplete="new-password"
                        style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFpShowPassword(!fpShowPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--mq-text-muted)" }}
                        aria-label={fpShowPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {fpShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Повторите пароль</label>
                    <Input
                      type={fpShowPassword ? "text" : "password"}
                      placeholder="Ещё раз"
                      value={fpConfirmPassword}
                      onChange={(e) => setFpConfirmPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
                      autoComplete="new-password"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                    />
                  </div>
                  <Button onClick={() => handleResetPassword()}
                    disabled={fpLoading || fpCode.some(d => !d) || !fpNewPassword || !fpConfirmPassword}
                    className="w-full min-h-[44px]"
                    style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#ffffff" }}>
                    {fpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Изменить пароль"}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Telegram: New User Registration (bot-code flow) ─── */}
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
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
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
                      onChange={(e) => handleUsernameChange(e.target.value, false)}
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
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#60a5fa" }}>
                        <Lock className="w-3 h-3" /> Аккаунт с таким именем уже существует. Нажмите кнопку ниже для входа
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
                        className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Отображается как @{tgUsername || "..."}
                      </motion.p>
                    )}
                    {usernameStatus === 'checking' && (
                      <motion.p key="tg-checking-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Проверка имени...
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <Button onClick={handleTgRegister}
                  disabled={tgRegisterLoading || !tgUsername || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                  className="w-full min-h-[44px]" style={{ backgroundColor: usernameStatus === 'taken' ? '#1d4ed8' : "var(--mq-telegram)", color: "#ffffff" }}>
                  {tgRegisterLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : usernameStatus === 'taken' ? "Привязать к существующему аккаунту" : "Создать аккаунт"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── Telegram Widget: New User Registration (official Login Widget) ─── */}
        {authStep === "telegram-widget-register" && (
          <motion.div key="telegram-widget-register"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>

              <button onClick={() => { pendingTgWidgetRef.current = null; setAuthStep("telegram"); }} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
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
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Новый аккаунт</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Telegram подтверждён! Выберите имя пользователя
                </p>
              </motion.div>

              {tgrError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {tgrError}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input placeholder="username" value={tgrUsername}
                      onChange={(e) => handleUsernameChange(e.target.value, true)}
                      className="pl-10 pr-9" style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `1px solid ${usernameStatus === 'available' ? '#22c55e' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)"
                      }} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AnimatePresence mode="wait">
                        {usernameStatus === 'checking' && (
                          <motion.div key="tgr-checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                          </motion.div>
                        )}
                        {usernameStatus === 'available' && (
                          <motion.div key="tgr-available" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                          </motion.div>
                        )}
                        {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                          <motion.div key="tgr-error" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <X className="w-4 h-4" style={{ color: "#ef4444" }} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <AnimatePresence mode="wait">
                    {usernameStatus === 'available' && (
                      <motion.p key="tgr-avail" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#22c55e" }}>
                        <Check className="w-3 h-3" /> Имя доступно
                      </motion.p>
                    )}
                    {usernameStatus === 'taken' && usernameError && (
                      <motion.p key="tgr-taken" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#60a5fa" }}>
                        <Lock className="w-3 h-3" /> Аккаунт с таким именем уже существует. Нажмите кнопку ниже для входа
                      </motion.p>
                    )}
                    {usernameStatus === 'invalid' && usernameError && (
                      <motion.p key="tgr-inv" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" /> {usernameError}
                      </motion.p>
                    )}
                    {usernameStatus === 'idle' && (
                      <motion.p key="tgr-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Отображается как @{tgrUsername || "..."}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <Button onClick={handleWidgetRegister}
                  disabled={tgrLoading || !tgrUsername || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                  className="w-full min-h-[44px]" style={{ backgroundColor: usernameStatus === 'taken' ? '#1d4ed8' : "var(--mq-telegram)", color: "#ffffff" }}>
                  {tgrLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : usernameStatus === 'taken' ? "Привязать к существующему аккаунту" : "Создать аккаунт"}
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

              <button
                onClick={() => { setAuthStep(widgetLinkMode ? "telegram-widget-register" : "telegram-register"); setTgLinkError(""); }}
                className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
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
                  <Lock className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Подтверждение аккаунта</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Аккаунт <span className="font-medium" style={{ color: "var(--mq-text)" }}>@{widgetLinkMode ? tgrUsername : tgUsername}</span> уже существует
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
                  Email: {tgLinkEmail}
                </p>
                <p className="text-sm mt-2" style={{ color: "var(--mq-telegram)" }}>
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
                  className="w-full min-h-[44px]" style={{ backgroundColor: "var(--mq-telegram)", color: "#ffffff" }}>
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
