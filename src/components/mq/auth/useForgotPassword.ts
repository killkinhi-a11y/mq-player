"use client";

// Forgot password: request code → reset with new password → back to login.
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useState } from "react";
import { EMAIL_REGEX } from "./validation";
import type { AppState, AuthStep } from "@/store/types";

export function useForgotPassword(authStep: AuthStep, setAuthStep: AppState["setAuthStep"], onPasswordReset: (email: string) => void) {
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

  // Reset own fields when entering a step (adjusted during render,
  // same pattern as before the split — no cascading effect pass).
  const [stepFor, setStepFor] = useState(authStep);
  if (stepFor !== authStep) {
    setStepFor(authStep);
    if (authStep === "forgot-password") {
      setFpError("");
      setFpInfo("");
      setFpStage("request");
    }
  }

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
      onPasswordReset(fpEmail);
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

  return { fpCode, fpConfirmPassword, fpEmail, fpError, fpInfo, fpLoading, fpNewPassword, fpShowPassword, fpStage, handleForgotRequest, handleResetPassword, setFpCode, setFpConfirmPassword, setFpEmail, setFpNewPassword, setFpShowPassword };
}
