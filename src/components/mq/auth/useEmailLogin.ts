"use client";

// Email + password login, unconfirmed-account hint.
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useCallback, useState } from "react";
import type { AppState, AuthStep } from "@/store/types";

export function useEmailLogin(authStep: AuthStep, setAuth: AppState["setAuth"]) {
  // ─── Email login ────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [showConfirmHint, setShowConfirmHint] = useState(false);

  // Reset own fields when entering a step (adjusted during render,
  // same pattern as before the split — no cascading effect pass).
  const [stepFor, setStepFor] = useState(authStep);
  if (stepFor !== authStep) {
    setStepFor(authStep);
    if (authStep === "login") {
      setLoginError("");
      setShowConfirmHint(false);
    }
  }

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


  // Called by the forgot-password flow after a successful reset.
  const prefillAfterReset = useCallback((email: string) => {
    setLoginSuccess("Пароль изменён. Войдите с новым паролем.");
    setLoginEmail(email);
    setLoginPassword("");
  }, []);

  return { handleEmailLogin, loginEmail, loginError, loginLoading, loginPassword, loginShowPassword, loginSuccess, prefillAfterReset, setLoginEmail, setLoginPassword, setLoginShowPassword, showConfirmHint };
}
