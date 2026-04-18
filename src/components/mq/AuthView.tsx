"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Music, Mail, Eye, EyeOff, Loader2, ArrowLeft, AtSign, Check, X, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const USERNAME_LENGTH_MIN = 2;
const USERNAME_LENGTH_MAX = 20;

export default function AuthView() {
  const { authStep, setAuthStep, setAuth } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  // Verification code states
  const [confirmEmail, setConfirmEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [resendLoading, setResendLoading] = useState(false);

  // Username validation states
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refs for verification code inputs
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset username validation when switching away from register step
  useEffect(() => {
    if (authStep !== 'register') {
      setUsernameStatus('idle');
      setUsernameError('');
    }
  }, [authStep]);

  // Countdown timer for resend
  useEffect(() => {
    if (authStep !== "confirm" || resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [authStep, resendTimer]);

  // Auto-focus first code input when entering confirm step
  useEffect(() => {
    if (authStep === "confirm") {
      setVerifyCode(["", "", "", "", "", ""]);
      setVerifyError("");
      setResendTimer(60);
      // Small delay for animation
      setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 400);
    }
  }, [authStep]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const checkUsernameAvailability = useCallback(async (username: string) => {
    // Abort any in-flight request
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
        // Server error — don't block the form, backend will validate on submit
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
      // Network error — don't block the form
      setUsernameStatus('idle');
      setUsernameError('Нет подключения к серверу, но вы можете продолжить');
    }
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    // Strip @ and whitespace
    const cleaned = value.replace('@', '').replace(/\s/g, '');
    setFormData(prev => ({ ...prev, username: cleaned }));

    // Clear previous debounce timer
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    // Empty — reset to idle
    if (!cleaned) {
      setUsernameStatus('idle');
      setUsernameError('');
      return;
    }

    // Check length
    if (cleaned.length < USERNAME_LENGTH_MIN) {
      setUsernameStatus('invalid');
      setUsernameError('От 2 до 20 символов');
      return;
    }
    if (cleaned.length > USERNAME_LENGTH_MAX) {
      setUsernameStatus('invalid');
      setUsernameError('От 2 до 20 символов');
      return;
    }

    // Check character format
    if (!USERNAME_REGEX.test(cleaned)) {
      setUsernameStatus('invalid');
      setUsernameError('Имя может содержать только буквы, цифры, _ и -');
      return;
    }

    // Format looks good — debounce API call
    setUsernameStatus('checking');
    setUsernameError('');

    debounceTimerRef.current = setTimeout(() => {
      checkUsernameAvailability(cleaned);
    }, 300);
  }, [checkUsernameAvailability]);

  const handleRegister = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setConfirmEmail(formData.email);
      setAuthStep("confirm");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setAuth(data.userId, data.username, data.email, data.role, data.avatar);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = verifyCode.join("");
    if (code.length !== 6) {
      setVerifyError("Введите 6-значный код");
      return;
    }

    setVerifyLoading(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error);
        // Shake animation: clear and refocus
        setVerifyCode(["", "", "", "", "", ""]);
        setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
        return;
      }
      setAuth(data.userId, data.username, confirmEmail, data.role, data.avatar);
    } catch {
      setVerifyError("Ошибка соединения");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0 || resendLoading) return;
    setResendLoading(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error);
        return;
      }
      setResendTimer(60);
      setVerifyCode(["", "", "", "", "", ""]);
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    } catch {
      setVerifyError("Ошибка при повторной отправке кода");
    } finally {
      setResendLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "");
    if (!digit) {
      setVerifyCode(prev => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    setVerifyCode(prev => {
      const next = [...prev];
      next[index] = digit[0]; // Take only first digit
      return next;
    });

    // Auto-focus next input
    if (index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits filled, auto-verify
    const newCode = [...verifyCode];
    newCode[index] = digit[0];
    if (newCode.every(d => d !== "")) {
      setTimeout(() => handleVerifyCodeWithCode(newCode.join("")), 200);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (verifyCode[index] === "" && index > 0) {
        // Move to previous input and clear it
        codeInputRefs.current[index - 1]?.focus();
        setVerifyCode(prev => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
      } else {
        setVerifyCode(prev => {
          const next = [...prev];
          next[index] = "";
          return next;
        });
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newCode = [...verifyCode];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setVerifyCode(newCode);

    // Focus the next empty input or the last one
    const nextIndex = Math.min(pasted.length, 5);
    codeInputRefs.current[nextIndex]?.focus();

    // If 6 digits pasted, auto-verify
    if (pasted.length === 6) {
      setTimeout(() => handleVerifyCodeWithCode(pasted), 200);
    }
  };

  // Separate function to avoid stale closure issues
  const handleVerifyCodeWithCode = async (code: string) => {
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error);
        setVerifyCode(["", "", "", "", "", ""]);
        setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
        return;
      }
      setAuth(data.userId, data.username, confirmEmail, data.role, data.avatar);
    } catch {
      setVerifyError("Ошибка соединения");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      const email = formData.email || loginData.email;
      const res = await fetch("/api/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setAuthStep("confirmed");
      setAuth(data.userId, data.username, email, data.role, data.avatar);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setAuth("demo-user-id", "Демо", "demo@mqplayer.com");
  };

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
              background: `radial-gradient(circle, var(--mq-accent) 0%, transparent 70%)`,
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
        {authStep === "login" && (
          <motion.div key="login"
            initial={{ opacity: 0, y: 40, scale: 0.94, rotateX: 5 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.96, rotateX: -5 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
              <motion.div
                className="flex items-center justify-center gap-3 mb-6"
                initial={{ opacity: 0, scale: 0.3, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              >
                <motion.div
                  animate={{ 
                    boxShadow: [
                      "0 0 0px rgba(224,49,49,0)",
                      "0 0 25px rgba(224,49,49,0.4)",
                      "0 0 0px rgba(224,49,49,0)",
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
                  style={{ color: "var(--mq-accent)", fontFamily: "var(--font-outfit), system-ui, sans-serif", fontWeight: 300 }}
                  animate={{ 
                    textShadow: [
                      "0 0 0px transparent",
                      "0 0 20px var(--mq-glow)",
                      "0 0 0px transparent",
                    ]
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >mq</motion.h1>
              </motion.div>

              <h2 className="text-xl font-semibold text-center mb-6" style={{ color: "var(--mq-text)" }}>
                Вход в аккаунт
              </h2>

              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {error}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input type="email" placeholder="your@email.com" value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="pl-10" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="••••••" value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className="pr-10" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <input type="checkbox" id="remember-me" className="w-4 h-4 rounded accent-current" style={{ accentColor: "var(--mq-accent)" }} />
                  <label htmlFor="remember-me" className="text-sm cursor-pointer" style={{ color: "var(--mq-text-muted)" }}>
                    Запомнить меня
                  </label>
                </div>

                <Button onClick={handleLogin} disabled={loading || !loginData.email || !loginData.password}
                  className="w-full min-h-[44px]" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Войти"}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full" style={{ borderTop: "1px solid var(--mq-border)" }} />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-xs" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)" }}>или</span>
                  </div>
                </div>

                <Button variant="outline" onClick={handleDemoLogin} className="w-full min-h-[44px]"
                  style={{ borderColor: "var(--mq-border)", color: "var(--mq-text-muted)" }}>
                  Демо-режим
                </Button>

                <p className="text-center text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Нет аккаунта?{" "}
                  <button onClick={() => { setAuthStep("register"); setError(""); }} className="font-medium" style={{ color: "var(--mq-accent)" }}>
                    Зарегистрироваться
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {authStep === "register" && (
          <motion.div key="register"
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <motion.div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <button onClick={() => { setAuthStep("login"); setError(""); }} className="flex items-center gap-1 mb-4" style={{ color: "var(--mq-text-muted)" }}>
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Назад</span>
              </button>

              <motion.div 
                className="flex flex-col items-center gap-2 mb-6"
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <h1 className="text-4xl font-bold" style={{ color: "var(--mq-text)", fontFamily: "var(--font-outfit), system-ui, sans-serif", fontWeight: 300, letterSpacing: "-1px" }}>mq</h1>
                <p className="text-xs" style={{ color: "var(--mq-text-muted)", letterSpacing: "1px" }}>создайте аккаунт</p>
              </motion.div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {error}
                </motion.div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input placeholder="username" value={formData.username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      className="pl-10 pr-9" style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `1px solid ${usernameStatus === 'available' ? '#22c55e' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)"
                      }} />
                    {/* Status indicator on the right side of the input */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AnimatePresence mode="wait">
                        {usernameStatus === 'checking' && (
                          <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                          </motion.div>
                        )}
                        {usernameStatus === 'available' && (
                          <motion.div key="available" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                          </motion.div>
                        )}
                        {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                          <motion.div key="error" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                            <X className="w-4 h-4" style={{ color: "#ef4444" }} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  {/* Validation feedback */}
                  <AnimatePresence mode="wait">
                    {usernameStatus === 'available' && (
                      <motion.p key="available" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#22c55e" }}>
                        <Check className="w-3 h-3" /> Имя доступно
                      </motion.p>
                    )}
                    {usernameStatus === 'taken' && usernameError && (
                      <motion.p key="taken" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" /> {usernameError}
                      </motion.p>
                    )}
                    {usernameStatus === 'invalid' && usernameError && (
                      <motion.p key="invalid" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <X className="w-3 h-3" /> {usernameError}
                      </motion.p>
                    )}
                    {usernameStatus === 'idle' && (
                      <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Отображается как @{formData.username || "..."}
                      </motion.p>
                    )}
                    {usernameStatus === 'checking' && (
                      <motion.p key="checking-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        Проверка имени...
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <Input type="email" placeholder="your@email.com" value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="pl-10" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="Минимум 6 символов" value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="pr-10" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button onClick={handleRegister}
                  disabled={loading || !formData.username || !formData.email || !formData.password || usernameStatus === 'taken'}
                  className="w-full min-h-[44px]" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Создать аккаунт"}
                </Button>

                <p className="text-center text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Уже есть аккаунт?{" "}
                  <button onClick={() => { setAuthStep("login"); setError(""); }} className="font-medium" style={{ color: "var(--mq-accent)" }}>
                    Войти
                  </button>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {authStep === "confirm" && (
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md relative z-10">
            <div className="rounded-2xl p-6 lg:p-8"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
              
              <motion.div 
                className="flex flex-col items-center text-center mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}>
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}
                  animate={{ boxShadow: ["0 0 0px rgba(224,49,49,0)", "0 0 30px rgba(224,49,49,0.2)", "0 0 0px rgba(224,49,49,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ShieldCheck className="w-8 h-8" style={{ color: "var(--mq-accent)" }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Подтверждение email</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Код подтверждения отправлен на
                </p>
                <p className="text-sm font-medium mt-0.5" style={{ color: "var(--mq-text)" }}>
                  {confirmEmail}
                </p>
              </motion.div>

              {verifyError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg text-sm text-center"
                  style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.3)" }}>
                  {verifyError}
                </motion.div>
              )}

              {/* 6-digit code inputs */}
              <motion.div 
                className="flex justify-center gap-2.5 sm:gap-3 mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                {verifyCode.map((digit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
                  >
                    <input
                      ref={(el) => { codeInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeInput(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      onPaste={index === 0 ? handleCodePaste : undefined}
                      disabled={verifyLoading}
                      className="w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl outline-none transition-all duration-200"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: `2px solid ${verifyError ? '#ef4444' : digit ? 'var(--mq-accent)' : 'var(--mq-border)'}`,
                        color: "var(--mq-text)",
                        caretColor: "var(--mq-accent)",
                        boxShadow: digit ? '0 0 12px rgba(224,49,49,0.15)' : 'none',
                      }}
                      autoComplete="one-time-code"
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Verify button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                <Button
                  onClick={handleVerifyCode}
                  disabled={verifyLoading || verifyCode.some(d => !d)}
                  className="w-full min-h-[44px]"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Подтвердить"}
                </Button>
              </motion.div>

              {/* Resend code */}
              <motion.div 
                className="mt-4 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.3 }}
              >
                <p className="text-sm mb-2" style={{ color: "var(--mq-text-muted)" }}>
                  Не получили код?
                </p>
                <button
                  onClick={handleResendCode}
                  disabled={resendTimer > 0 || resendLoading}
                  className="text-sm font-medium transition-colors duration-200"
                  style={{
                    color: resendTimer > 0 ? "var(--mq-text-muted)" : "var(--mq-accent)",
                    opacity: resendTimer > 0 ? 0.6 : 1,
                    cursor: resendTimer > 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {resendLoading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Отправка...
                    </span>
                  ) : resendTimer > 0 ? (
                    `Отправить повторно (${resendTimer}с)`
                  ) : (
                    "Отправить код повторно"
                  )}
                </button>
              </motion.div>

              {/* Back to login */}
              <motion.div 
                className="mt-6 pt-4"
                style={{ borderTop: "1px solid var(--mq-border)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.3 }}
              >
                <button
                  onClick={() => { setAuthStep("login"); setError(""); }}
                  className="flex items-center gap-1.5 mx-auto text-sm transition-colors duration-200"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Вернуться к входу
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
