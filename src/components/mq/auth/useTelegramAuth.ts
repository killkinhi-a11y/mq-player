"use client";

// Telegram flows: bot code (verify → register → link), official Login Widget registration, account linking with password, username availability check (debounced, abortable).
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useCallback, useEffect, useRef, useState } from "react";
import { USERNAME_LENGTH_MAX, USERNAME_LENGTH_MIN, USERNAME_REGEX, type UsernameStatus } from "./validation";
import { requestUsernameCheck } from "./authApi";
import type { AppState, AuthStep } from "@/store/types";

export function useTelegramAuth(authStep: AuthStep, setAuthStep: AppState["setAuthStep"], setAuth: AppState["setAuth"], initialWidgetUsername: string) {
  // Telegram auth states
  const [tgVerifyLoading, setTgVerifyLoading] = useState(false);
  const [tgVerifyError, setTgVerifyError] = useState("");
  const [tgRegisterLoading, setTgRegisterLoading] = useState(false);
  const [tgRegisterError, setTgRegisterError] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const tgCodeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Telegram link (password for existing account)
  const [tgLinkPassword, setTgLinkPassword] = useState("");
  const [tgLinkShowPassword, setTgLinkShowPassword] = useState(false);
  const [tgLinkLoading, setTgLinkLoading] = useState(false);
  const [tgLinkError, setTgLinkError] = useState("");
  const [tgLinkEmail, setTgLinkEmail] = useState("");

  // Telegram Login Widget (official) — pending registration
  const pendingTgWidgetRef = useRef<string | null>(null);
  const [widgetLinkMode, setWidgetLinkMode] = useState(false);
  const [tgrUsername, setTgrUsername] = useState(initialWidgetUsername);
  const [tgrLoading, setTgrLoading] = useState(false);
  const [tgrError, setTgrError] = useState("");

  // Username validation
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verification code (shared between telegram and telegram-register)
  const [verifyCode, setVerifyCode] = useState<string[]>(["", "", "", "", "", ""]);

  // Reset own fields when entering a step (adjusted during render,
  // same pattern as before the split — no cascading effect pass).
  const [stepFor, setStepFor] = useState(authStep);
  if (stepFor !== authStep) {
    setStepFor(authStep);
    if (authStep === "telegram") {
      setVerifyCode(["", "", "", "", "", ""]);
      setTgVerifyError("");
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
  }

  // Focus the first code cell when the Telegram code step opens.
  useEffect(() => {
    if (authStep !== "telegram") return;
    const t = setTimeout(() => tgCodeInputRefs.current[0]?.focus(), 400);
    return () => clearTimeout(t);
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
      const { ok, data } = await requestUsernameCheck(username, controller.signal);
      if (controller.signal.aborted) return;

      if (!ok) {
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

  return { handleTgCodeInput, handleTgCodeKeyDown, handleTgCodePaste, handleTgLinkSubmit, handleTgRegister, handleTgVerify, handleUsernameChange, handleWidgetRegister, pendingTgWidgetRef, setTgLinkError, setTgLinkPassword, setTgLinkShowPassword, tgCodeInputRefs, tgLinkEmail, tgLinkError, tgLinkLoading, tgLinkPassword, tgLinkShowPassword, tgRegisterError, tgRegisterLoading, tgUsername, tgVerifyError, tgVerifyLoading, tgrError, tgrLoading, tgrUsername, usernameError, usernameStatus, verifyCode, widgetLinkMode };
}
