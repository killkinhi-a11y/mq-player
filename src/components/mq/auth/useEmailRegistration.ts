"use client";

// Email registration and 6-digit email confirmation (verify / resend).
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useState } from "react";
import { EMAIL_REGEX, USERNAME_LENGTH_MAX, USERNAME_LENGTH_MIN, USERNAME_REGEX } from "./validation";
import type { AppState, AuthStep } from "@/store/types";

export function useEmailRegistration(authStep: AuthStep, setAuthStep: AppState["setAuthStep"], setAuth: AppState["setAuth"]) {
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

  // Reset own fields when entering a step (adjusted during render,
  // same pattern as before the split — no cascading effect pass).
  const [stepFor, setStepFor] = useState(authStep);
  if (stepFor !== authStep) {
    setStepFor(authStep);
    if (authStep === "register") {
      setRegError("");
    }
    if (authStep === "confirm") {
      setConfirmError("");
      setConfirmInfo("");
    }
  }

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

  return { confirmCode, confirmEmail, confirmError, confirmInfo, confirmLoading, devCodeHint, handleConfirmVerify, handleRegister, handleResendCode, regEmail, regError, regLoading, regPassword, regShowPassword, regUsername, setConfirmCode, setConfirmEmail, setDevCodeHint, setRegEmail, setRegPassword, setRegShowPassword, setRegUsername };
}
