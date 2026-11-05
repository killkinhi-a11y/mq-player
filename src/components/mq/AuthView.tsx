"use client";

import { AUTH_ERROR_MESSAGES } from "./auth/validation";
import { AlertTriangle, ArrowLeft, AtSign, Check, Eye, EyeOff, Loader2, Lock, Mail, Send, UserPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AuthBanner, AuthCard, BrandHeader, EASE, Reveal, ShakeField } from "./auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { CodeBoxes } from "./auth/CodeBoxes";
import { GoogleIcon } from "./auth/AuthIcons";
import { Input } from "@/components/ui/input";
import { readAuthRedirect } from "./auth/redirect";
import { useAuthProviders } from "./auth/useAuthProviders";
import { useTelegramAuth } from "./auth/useTelegramAuth";
import { useEmailLogin } from "./auth/useEmailLogin";
import { useEmailRegistration } from "./auth/useEmailRegistration";
import { useForgotPassword } from "./auth/useForgotPassword";
import { useGoogleLogin } from "./auth/useGoogleLogin";
import { useDemoLogin } from "./auth/useDemoLogin";
import { useAuthStepMotion } from "./auth/useAuthStepMotion";
import { useAppStore } from "@/store/useAppStore";
import { useEffect, useMemo, useRef, useState } from "react";
import "./auth-motion.css";

export default function AuthView() {
  const authStep = useAppStore((s) => s.authStep);
  const setAuthStep = useAppStore((s) => s.setAuthStep);
  const setAuth = useAppStore((s) => s.setAuth);

  // ─── Provider availability (server probe — no secrets) ──────────────

  // Desktop (Windows app) detection — must be declared BEFORE the effects
  // below that reference it (widget injection skips on desktop; the shell
  // installs window.__MQ_DESKTOP__ before the app boots).
  const isDesktopApp =
    typeof window !== "undefined" &&
    !!(window as unknown as { __MQ_DESKTOP__?: unknown }).__MQ_DESKTOP__;

  // ─── Post-OAuth redirect state (URL params) ─────────────────────────
  // OAuth redirect result (URL params), parsed once on mount. AppShell is
  // client-only (dynamic, ssr:false), so window is available here.
  const [authRedirect] = useState(readAuthRedirect);
  const [restoringSession, setRestoringSession] = useState(() => authRedirect.auth === "success");
  const [redirectError, setRedirectError] = useState(() =>
    authRedirect.error ? AUTH_ERROR_MESSAGES[authRedirect.error] || "Ошибка авторизации. Попробуйте ещё раз." : "",
  );

  // ─── Auth flows (hooks in ./auth) ───────────────────────────────────
  const { providers, tgBotConfigured, tgBotLoading, tgBotName } = useAuthProviders();
  const { handleTgCodeInput, handleTgCodeKeyDown, handleTgCodePaste, handleTgLinkSubmit, handleTgRegister, handleTgVerify, handleUsernameChange, handleWidgetRegister, pendingTgWidgetRef, setTgLinkError, setTgLinkPassword, setTgLinkShowPassword, tgCodeInputRefs, tgLinkEmail, tgLinkError, tgLinkLoading, tgLinkPassword, tgLinkShowPassword, tgRegisterError, tgRegisterLoading, tgUsername, tgVerifyError, tgVerifyLoading, tgrError, tgrLoading, tgrUsername, usernameError, usernameStatus, verifyCode, widgetLinkMode } = useTelegramAuth(authStep, setAuthStep, setAuth, authRedirect.tgSuggestion ?? "");
  const { handleEmailLogin, loginEmail, loginError, loginLoading, loginPassword, loginShowPassword, loginSuccess, prefillAfterReset, setLoginEmail, setLoginPassword, setLoginShowPassword, showConfirmHint } = useEmailLogin(authStep, setAuth);
  const { confirmCode, confirmEmail, confirmError, confirmInfo, confirmLoading, devCodeHint, handleConfirmVerify, handleRegister, handleResendCode, regEmail, regError, regLoading, regPassword, regShowPassword, regUsername, setConfirmCode, setConfirmEmail, setDevCodeHint, setRegEmail, setRegPassword, setRegShowPassword, setRegUsername } = useEmailRegistration(authStep, setAuthStep, setAuth);
  const { fpCode, fpConfirmPassword, fpEmail, fpError, fpInfo, fpLoading, fpNewPassword, fpShowPassword, fpStage, handleForgotRequest, handleResetPassword, setFpCode, setFpConfirmPassword, setFpEmail, setFpNewPassword, setFpShowPassword } = useForgotPassword(authStep, setAuthStep, prefillAfterReset);
  const { googleRedirecting, handleGoogleLogin } = useGoogleLogin(providers, isDesktopApp);
  const { demoLoading, handleDemoLogin } = useDemoLogin(setAuth);
  const { firstMount, fullMotion, stepDir, stepMotion } = useAuthStepMotion(authStep);

  // ─── Handle OAuth redirect result (URL params) on mount ─────────────
  // State derived from the params is seeded in useState initializers above;
  // this effect performs only the side effects (URL cleanup, store, fetch).
  useEffect(() => {
    const { auth: authParam, step: authStepParam, token: tokenParam, hadParams } = authRedirect;

    if (hadParams) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      url.searchParams.delete("authError");
      url.searchParams.delete("authStep");
      url.searchParams.delete("token");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
    }

    // Telegram widget new-user registration → username selection screen
    if (authStepParam === "telegram-widget-register" && tokenParam) {
      pendingTgWidgetRef.current = tokenParam;
      setAuthStep("telegram-widget-register");
      return;
    }

    // Successful OAuth callback → session cookie already set → restore
    if (authParam === "success") {
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
  // Desktop: the widget's data-auth-url callback must land on the real
  // site origin — inside the app webview it would point at tauri.localhost
  // and the hash verification could never complete. The bot-code flow
  // (t.me → 6-digit code) is the desktop path and stays fully available.
  //
  // v14: the widget mounts ONLY on hostnames the server allows
  // (telegramWidgetDomains — BotFather-bound hosts). On any other host
  // the iframe would show the raw red «Bot domain invalid» error which
  // we cannot suppress cross-origin, so we never mount it there and the
  // honest neutral fallback below carries the flow instead.
  const tgWidgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetHostAllowed = useMemo(() => {
    if (typeof window === "undefined") return false;
    const allowed = providers?.telegramWidgetDomains;
    if (!Array.isArray(allowed) || allowed.length === 0) return false;
    return allowed.includes(window.location.hostname.toLowerCase());
  }, [providers]);
  useEffect(() => {
    if (authStep !== "telegram") return;
    if (isDesktopApp) return;
    if (!providers?.telegramWidget || !providers.telegramBotName) return;
    if (!widgetHostAllowed) return;
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
  }, [authStep, providers, widgetHostAllowed]);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="mq-auth-root min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-x-hidden"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      {/* Ambient background — static gradient wash + very slow gradient
          drift (CSS, 18s, transform-only — no per-frame JS). The drift
          layer is only rendered when motion is allowed. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: "var(--mq-gradient)" }} />
        {fullMotion && (
          <>
            <div
              className="mq-auth-blob"
              style={{
                width: "46vmax",
                height: "46vmax",
                left: "-12%",
                top: "-18%",
                opacity: 0.05,
                background: "radial-gradient(circle, var(--mq-telegram, #2AABEE) 0%, transparent 70%)",
                animationDelay: "-6s",
              }}
            />
            <div
              className="mq-auth-blob"
              style={{
                width: "40vmax",
                height: "40vmax",
                right: "-14%",
                bottom: "-16%",
                opacity: 0.04,
                background: "radial-gradient(circle, var(--mq-accent, #e03131) 0%, transparent 70%)",
                animationDelay: "-12s",
              }}
            />
            <div
              className="mq-auth-blob"
              style={{
                width: "34vmax",
                height: "34vmax",
                left: "28%",
                bottom: "-10%",
                opacity: 0.035,
                background: "radial-gradient(circle, var(--mq-telegram, #2AABEE) 0%, transparent 70%)",
                animationDelay: "-2s",
              }}
            />
          </>
        )}
      </div>

      {/* Session restore overlay (after OAuth redirect back) — the visible
          success moment: brand mark with wave rings + a light 1→1.02→1
          flourish while the session cookie is being verified. */}
      <AnimatePresence>
        {restoringSession && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
            style={{ backgroundColor: "var(--mq-bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <motion.div
              className="relative flex items-center justify-center"
              style={{ width: 64, height: 64 }}
              initial={{ opacity: 0 }}
              animate={fullMotion ? { opacity: 1, scale: [1, 1.02, 1] } : { opacity: 1 }}
              transition={fullMotion ? { duration: 0.5, ease: EASE } : { duration: 0.12 }}
            >
              {fullMotion &&
                [0, 1, 2].map((i) => (
                  <span key={i} className="mq-auth-ring" style={{ animationDelay: `${i * 1.2}s` }} />
                ))}
              <div
                className="mq-auth-logo relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
              >
                <span
                  className="text-2xl font-black text-white"
                  style={{ fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
                >
                  mq
                </span>
              </div>
            </motion.div>
            <motion.p
              className="text-sm font-medium"
              style={{ color: "var(--mq-text)" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3, ease: EASE }}
            >
              Завершаем вход…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent column: brand header (stages 1–2, never replays) +
          the step stack (shared-axis transitions below). */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        <BrandHeader fullMotion={fullMotion} />

        <AnimatePresence
          mode="wait"
          custom={{ dir: stepDir, first: false }}
        >
        {/* ─── Landing: provider selection + Telegram code entry ─── */}
        {authStep === "telegram" && (
          <motion.div key="telegram" {...stepMotion("telegram")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={tgVerifyLoading || googleRedirecting}>

              {/* Title */}
              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Вход в MQ Player</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Музыка, плейлисты и чаты синхронизированы между устройствами
                </p>
              </Reveal>

              {/* OAuth redirect error (from URL param) */}
              {redirectError && (
                <AuthBanner tone="error" fullMotion={fullMotion} className="text-center">
                  {redirectError}
                </AuthBanner>
              )}

              {/* Continue with Google — Apple-ID style: crisp white slab,
                  real shadow, hover lift (V13: was a flat gray-ish white that
                  read as disabled). */}
              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion}>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleRedirecting || tgBotLoading || (providers !== null && !providers.google)}
                  className="mq-auth-google flex items-center justify-center gap-2.5 w-full min-h-[46px] rounded-xl text-sm font-semibold transition-[filter,transform,box-shadow] duration-200 hover:brightness-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#17181c",
                    border: "1px solid rgba(255,255,255,0.9)",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.06)",
                  }}
                >
                  {googleRedirecting || (tgBotLoading && providers === null) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <GoogleIcon className="w-[18px] h-[18px]" />
                      {providers !== null && !providers.google ? "Google недоступен (не настроен)" : "Продолжить с Google"}
                    </>
                  )}
                </button>
              </Reveal>

              {/* Continue with Telegram — official Login Widget.
                  Desktop uses the bot-code flow below (widget callback
                  can't reach the app origin).
                  v14: the widget mounts ONLY on BotFather-bound hosts
                  (server allowlist). Elsewhere Telegram would render the
                  raw «Bot domain invalid» inside the cross-origin iframe —
                  instead we show a NEUTRAL honest note; the bot-code flow
                  below always carries Telegram login. */}
              {providers?.telegramWidget && !isDesktopApp && widgetHostAllowed && (
                <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion} className="mt-3 flex flex-col items-center gap-1.5 min-h-[40px]">
                  <div ref={tgWidgetContainerRef} />
                  <p className="text-[11px] text-center" style={{ color: "var(--mq-text-muted)" }}>
                    Кнопка не нажимается или показывает ошибку? Войдите по коду из бота ниже
                  </p>
                </Reveal>
              )}
              {providers?.telegramWidget && !isDesktopApp && !widgetHostAllowed && (
                <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion} className="mt-3">
                  <div
                    className="flex items-center gap-2.5 w-full min-h-[44px] rounded-xl px-4 text-[12.5px] leading-snug"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--mq-text) 4%, transparent)",
                      border: "1px solid var(--mq-border-hairline)",
                      color: "var(--mq-text-muted)",
                    }}
                    role="note"
                  >
                    <Send className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-telegram)" }} aria-hidden="true" />
                    <span>
                      Вход через Telegram-кнопку доступен на привязанном домене. Здесь — по коду из бота ниже
                    </span>
                  </div>
                </Reveal>
              )}

              {/* Telegram bot-code flow (fallback — works everywhere) */}
              <Reveal index={3} firstMount={firstMount} fullMotion={fullMotion} className="mt-4 pt-4" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
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
                  <AuthBanner tone="warn" fullMotion={fullMotion} className="text-xs text-center">
                    Бот ещё не настроен. Обратитесь к администратору.
                  </AuthBanner>
                )}

                {/* Open bot button — ?start=code triggers /code automatically */}
                {tgBotConfigured && tgBotName && (
                  <Reveal index={4} firstMount={firstMount} fullMotion={fullMotion}>
                    <a
                      href={`https://t.me/${tgBotName}?start=code`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl text-sm font-medium transition-[filter,background-color] duration-200 hover:brightness-110 mb-4"
                      style={{ backgroundColor: "rgba(42,171,238,0.15)", color: "var(--mq-telegram)", border: "1px solid rgba(42,171,238,0.3)" }}
                    >
                      <Send className="w-4 h-4" />
                      Открыть бота в Telegram
                    </a>
                  </Reveal>
                )}

                {/* Telegram code error */}
                {tgVerifyError && (
                  <AuthBanner tone="error" fullMotion={fullMotion} className="text-center">
                    {tgVerifyError}
                  </AuthBanner>
                )}

                {/* 6-digit code inputs */}
                <ShakeField trigger={tgVerifyError} fullMotion={fullMotion}>
                  <div className="flex justify-center gap-2.5 sm:gap-3 mb-4">
                    {verifyCode.map((digit, index) => (
                      <Reveal key={index} index={5 + index} firstMount={firstMount} fullMotion={fullMotion}>
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
                      </Reveal>
                    ))}
                  </div>
                </ShakeField>

                {/* Verify button */}
                <Reveal index={11} firstMount={firstMount} fullMotion={fullMotion}>
                  <Button
                    onClick={() => handleTgVerify()}
                    disabled={tgVerifyLoading || verifyCode.some(d => !d)}
                    className="w-full min-h-[44px]"
                    style={{ backgroundColor: "var(--mq-telegram)", color: "#ffffff" }}
                  >
                    {tgVerifyLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Проверяем…</span>
                      </span>
                    ) : "Подтвердить"}
                  </Button>
                </Reveal>
              </Reveal>

              {/* Continue with Email */}
              <Reveal index={12} firstMount={firstMount} fullMotion={fullMotion} className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setAuthStep("login")}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2.5"
                  style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}
                >
                  <Mail className="w-4 h-4" />
                  Продолжить с Email
                </Button>
              </Reveal>

              {/* Bottom links */}
              <Reveal index={13} firstMount={firstMount} fullMotion={fullMotion} className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <Button variant="ghost" onClick={handleDemoLogin} disabled={demoLoading} className="text-sm h-auto p-0 flex items-center gap-2"
                  style={{ color: "var(--mq-text-muted)" }}>
                  {demoLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка...</> : "Демо-режим"}
                </Button>
                <button
                  type="button"
                  onClick={() => setAuthStep("register")}
                  className="text-sm font-medium transition-opacity hover:opacity-80 py-2.5 px-1"
                  style={{ color: "var(--mq-text)" }}
                >
                  Регистрация
                </button>
              </Reveal>

              {/* Legal links — real routes (Google OAuth branding requirement) */}
              <Reveal index={14} firstMount={firstMount} fullMotion={fullMotion} className="mt-4 pt-4 flex items-center justify-center gap-2 text-xs" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
                <a href="/privacy" className="underline underline-offset-2 hover:opacity-80 transition-opacity py-2.5 px-1" style={{ color: "var(--mq-text-muted)" }}>
                  Политика конфиденциальности
                </a>
                <span style={{ color: "var(--mq-text-muted)" }}>·</span>
                <a href="/terms" className="underline underline-offset-2 hover:opacity-80 transition-opacity py-2.5 px-1" style={{ color: "var(--mq-text-muted)" }}>
                  Условия использования
                </a>
              </Reveal>

            </AuthCard>
          </motion.div>
        )}

        {/* ─── Email: Login ─── */}
        {authStep === "login" && (
          <motion.div key="login" {...stepMotion("login")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={loginLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button onClick={() => setAuthStep("telegram")} className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <Mail className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Вход по Email</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Введите email и пароль от вашего аккаунта
                </p>
              </Reveal>

              {/* Success banner (e.g. after password reset) */}
              {loginSuccess && (
                <AuthBanner tone="success" fullMotion={fullMotion} className="text-center">
                  {loginSuccess}
                </AuthBanner>
              )}

              {loginError && (
                <AuthBanner tone="error" fullMotion={fullMotion}>
                  {loginError}
                </AuthBanner>
              )}

              {/* Unconfirmed account → jump straight to confirmation */}
              {showConfirmHint && (
                <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion} className="mb-4">
                  <Button
                    onClick={() => { setConfirmEmail(loginEmail); setConfirmCode(["", "", "", "", "", ""]); setDevCodeHint(null); setAuthStep("confirm"); }}
                    className="w-full min-h-[44px]"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)", color: "var(--mq-text)", border: "1px solid color-mix(in srgb, var(--mq-text) 18%, transparent)" }}
                  >
                    Подтвердить почту
                  </Button>
                </Reveal>
              )}

              <Reveal index={3} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="space-y-4">
                  <ShakeField trigger={loginError} fullMotion={fullMotion}>
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
                          className="pl-10 min-h-[44px]"
                          autoComplete="email"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${loginError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                      </div>
                    </div>
                  </ShakeField>

                  <ShakeField trigger={loginError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                      <div className="relative">
                        <Input
                          type={loginShowPassword ? "text" : "password"}
                          placeholder="Введите пароль"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleEmailLogin(); }}
                          className="pr-10 min-h-[44px]"
                          autoComplete="current-password"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${loginError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setLoginShowPassword(!loginShowPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                          style={{ color: "var(--mq-text-muted)" }}
                          aria-label={loginShowPassword ? "Скрыть пароль" : "Показать пароль"}
                        >
                          {loginShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </ShakeField>

                  <Button onClick={handleEmailLogin}
                    disabled={loginLoading || !loginEmail || !loginPassword}
                    className="mq-platinum-btn w-full min-h-[44px]"
                    style={{ color: "#ffffff" }}>
                    {loginLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Входим…</span>
                      </span>
                    ) : "Войти"}
                  </Button>
                </div>
              </Reveal>

              <Reveal index={4} firstMount={firstMount} fullMotion={fullMotion} className="mt-4 flex items-center justify-between text-sm">
                <button type="button" onClick={() => setAuthStep("forgot-password")}
                  className="transition-opacity hover:opacity-80 py-2.5" style={{ color: "var(--mq-text-muted)" }}>
                  Забыли пароль?
                </button>
                <button type="button" onClick={() => setAuthStep("register")}
                  className="font-medium transition-opacity hover:opacity-80 py-2.5" style={{ color: "var(--mq-accent, #e03131)" }}>
                  Создать аккаунт
                </button>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Email: Registration ─── */}
        {authStep === "register" && (
          <motion.div key="register" {...stepMotion("register")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={regLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button onClick={() => setAuthStep("telegram")} className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Регистрация</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Создайте аккаунт по email: музыка и чаты на всех устройствах
                </p>
              </Reveal>

              {/* Email delivery warning (admin has not configured Brevo) */}
              {providers !== null && !providers.emailDelivery && (
                <AuthBanner tone="warn" fullMotion={fullMotion} className="text-xs text-center flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Email-сервис не настроен. Код подтверждения придёт только в dev-режиме.</span>
                </AuthBanner>
              )}

              {regError && (
                <AuthBanner tone="error" fullMotion={fullMotion}>
                  {regError}
                </AuthBanner>
              )}

              <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="space-y-4">
                  <ShakeField trigger={regError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                        <Input
                          placeholder="username"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value.replace(/\s/g, ''))}
                          className="pl-10 min-h-[44px]"
                          autoComplete="username"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${regError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                      </div>
                      <p className="mq-t-meta-2 mt-1" style={{ color: "var(--mq-text-muted)" }}>
                        2-20 символов: буквы, цифры, _ и - (отображается как @{regUsername || "..."})
                      </p>
                    </div>
                  </ShakeField>

                  <ShakeField trigger={regError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="pl-10 min-h-[44px]"
                          autoComplete="email"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${regError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                      </div>
                    </div>
                  </ShakeField>

                  <ShakeField trigger={regError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                      <div className="relative">
                        <Input
                          type={regShowPassword ? "text" : "password"}
                          placeholder="Минимум 6 символов"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
                          className="pr-10 min-h-[44px]"
                          autoComplete="new-password"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${regError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setRegShowPassword(!regShowPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                          style={{ color: "var(--mq-text-muted)" }}
                          aria-label={regShowPassword ? "Скрыть пароль" : "Показать пароль"}
                        >
                          {regShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </ShakeField>

                  <Button onClick={handleRegister}
                    disabled={regLoading || !regUsername || !regEmail || !regPassword}
                    className="mq-platinum-btn w-full min-h-[44px]"
                    style={{ color: "#ffffff" }}>
                    {regLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Создаём…</span>
                      </span>
                    ) : "Зарегистрироваться"}
                  </Button>
                </div>
              </Reveal>

              <Reveal index={3} firstMount={firstMount} fullMotion={fullMotion} className="mt-4 text-center text-sm">
                <span style={{ color: "var(--mq-text-muted)" }}>Уже есть аккаунт? </span>
                <button type="button" onClick={() => setAuthStep("login")}
                  className="font-medium transition-opacity hover:opacity-80 py-2.5" style={{ color: "var(--mq-accent, #e03131)" }}>
                  Войти
                </button>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Email: Confirm code ─── */}
        {authStep === "confirm" && (
          <motion.div key="confirm" {...stepMotion("confirm")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={confirmLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button onClick={() => setAuthStep("login")} className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <Check className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>Подтверждение почты</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Код отправлен на <span className="font-medium" style={{ color: "var(--mq-text)" }}>{confirmEmail}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
                  Введите 6-значный код из письма
                </p>
              </Reveal>

              {devCodeHint && (
                <AuthBanner tone="info" fullMotion={fullMotion} className="text-xs text-center">
                  Dev-режим (email не настроен): ваш код <span className="font-bold">{devCodeHint}</span>
                </AuthBanner>
              )}

              {confirmInfo && (
                <AuthBanner tone="success" fullMotion={fullMotion} className="text-center">
                  {confirmInfo}
                </AuthBanner>
              )}

              {confirmError && (
                <AuthBanner tone="error" fullMotion={fullMotion} className="text-center">
                  {confirmError}
                </AuthBanner>
              )}

              <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                <ShakeField trigger={confirmError} fullMotion={fullMotion}>
                  <CodeBoxes
                    value={confirmCode}
                    onChange={setConfirmCode}
                    onAutoSubmit={(code) => handleConfirmVerify(code)}
                    disabled={confirmLoading}
                    error={!!confirmError}
                  />
                </ShakeField>
              </Reveal>

              <Reveal index={3} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="mt-6 space-y-3">
                  <Button onClick={() => handleConfirmVerify()}
                    disabled={confirmLoading || confirmCode.some(d => !d)}
                    className="mq-platinum-btn w-full min-h-[44px]"
                    style={{ color: "#ffffff" }}>
                    {confirmLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Подтверждаем…</span>
                      </span>
                    ) : "Подтвердить"}
                  </Button>
                  <Button variant="ghost" onClick={handleResendCode} disabled={confirmLoading}
                    className="w-full min-h-[44px] text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Отправить код повторно
                  </Button>
                </div>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Email: Forgot password ─── */}
        {authStep === "forgot-password" && (
          <motion.div key="forgot-password" {...stepMotion("forgot-password")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={fpLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button
                  onClick={() => setAuthStep(fpStage === "reset" ? "login" : "login")}
                  className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(224,49,49,0.12)" }}>
                  <Lock className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                  {fpStage === "request" ? "Восстановление пароля" : "Новый пароль"}
                </h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  {fpStage === "request"
                    ? "Введите email аккаунта, мы отправим код подтверждения"
                    : "Введите код из письма и новый пароль"}
                </p>
              </Reveal>

              {fpInfo && (
                <AuthBanner tone="success" fullMotion={fullMotion} className="text-center">
                  {fpInfo}
                </AuthBanner>
              )}

              {fpError && (
                <AuthBanner tone="error" fullMotion={fullMotion} className="text-center">
                  {fpError}
                </AuthBanner>
              )}

              {fpStage === "request" ? (
                <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                  <div className="space-y-4">
                    <ShakeField trigger={fpError} fullMotion={fullMotion}>
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
                            className="pl-10 min-h-[44px]"
                            autoComplete="email"
                            style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                          />
                        </div>
                      </div>
                    </ShakeField>
                    <Button onClick={handleForgotRequest}
                      disabled={fpLoading || !fpEmail}
                      className="mq-platinum-btn w-full min-h-[44px]"
                      style={{ color: "#ffffff" }}>
                      {fpLoading ? (
                        <span className="flex items-center justify-center gap-2 w-full">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Отправляем…</span>
                        </span>
                      ) : "Отправить код"}
                    </Button>
                  </div>
                </Reveal>
              ) : (
                <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                  <div className="space-y-4">
                    <ShakeField trigger={fpError} fullMotion={fullMotion}>
                      <CodeBoxes
                        value={fpCode}
                        onChange={setFpCode}
                        disabled={fpLoading}
                        error={!!fpError}
                      />
                    </ShakeField>
                    <ShakeField trigger={fpError} fullMotion={fullMotion}>
                      <div>
                        <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Новый пароль</label>
                        <div className="relative">
                          <Input
                            type={fpShowPassword ? "text" : "password"}
                            placeholder="Минимум 6 символов"
                            value={fpNewPassword}
                            onChange={(e) => setFpNewPassword(e.target.value)}
                            className="pr-10 min-h-[44px]"
                            autoComplete="new-password"
                            style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                          />
                          <button
                            type="button"
                            onClick={() => setFpShowPassword(!fpShowPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                            style={{ color: "var(--mq-text-muted)" }}
                            aria-label={fpShowPassword ? "Скрыть пароль" : "Показать пароль"}
                          >
                            {fpShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </ShakeField>
                    <ShakeField trigger={fpError} fullMotion={fullMotion}>
                      <div>
                        <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Повторите пароль</label>
                        <Input
                          type={fpShowPassword ? "text" : "password"}
                          placeholder="Ещё раз"
                          value={fpConfirmPassword}
                          onChange={(e) => setFpConfirmPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
                          className="min-h-[44px]"
                          autoComplete="new-password"
                          style={{ backgroundColor: "var(--mq-input-bg)", border: `1px solid ${fpError ? '#ef4444' : 'var(--mq-border)'}`, color: "var(--mq-text)" }}
                        />
                      </div>
                    </ShakeField>
                    <Button onClick={() => handleResetPassword()}
                      disabled={fpLoading || fpCode.some(d => !d) || !fpNewPassword || !fpConfirmPassword}
                      className="mq-platinum-btn w-full min-h-[44px]"
                      style={{ color: "#ffffff" }}>
                      {fpLoading ? (
                        <span className="flex items-center justify-center gap-2 w-full">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Сохраняем…</span>
                        </span>
                      ) : "Изменить пароль"}
                    </Button>
                  </div>
                </Reveal>
              )}
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Telegram: New User Registration (bot-code flow) ─── */}
        {authStep === "telegram-register" && (
          <motion.div key="telegram-register" {...stepMotion("telegram-register")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={tgRegisterLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button onClick={() => { setAuthStep("telegram"); }} className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}>
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Новый аккаунт</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Telegram подтверждён! Выберите имя пользователя
                </p>
              </Reveal>

              {tgRegisterError && (
                <AuthBanner tone="error" fullMotion={fullMotion}>
                  {tgRegisterError}
                </AuthBanner>
              )}

              <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="space-y-4">
                  <ShakeField trigger={tgRegisterError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                        <Input placeholder="username" value={tgUsername}
                          onChange={(e) => handleUsernameChange(e.target.value, false)}
                          className="pl-10 pr-9 min-h-[44px]" style={{
                            backgroundColor: "var(--mq-input-bg)",
                            border: `1px solid ${tgRegisterError ? '#ef4444' : usernameStatus === 'available' ? '#22c55e' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : 'var(--mq-border)'}`,
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
                  </ShakeField>

                  <Button onClick={handleTgRegister}
                    disabled={tgRegisterLoading || !tgUsername || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                    className="w-full min-h-[44px]" style={{ backgroundColor: usernameStatus === 'taken' ? '#1d4ed8' : "var(--mq-telegram)", color: "#ffffff" }}>
                    {tgRegisterLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Создаём…</span>
                      </span>
                    ) : usernameStatus === 'taken' ? "Привязать к существующему аккаунту" : "Создать аккаунт"}
                  </Button>
                </div>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Telegram Widget: New User Registration (official Login Widget) ─── */}
        {authStep === "telegram-widget-register" && (
          <motion.div key="telegram-widget-register" {...stepMotion("telegram-widget-register")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={tgrLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button onClick={() => { pendingTgWidgetRef.current = null; setAuthStep("telegram"); }} className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}>
                  <UserPlus className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
                </div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mq-text)" }}>Новый аккаунт</h2>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Telegram подтверждён! Выберите имя пользователя
                </p>
              </Reveal>

              {tgrError && (
                <AuthBanner tone="error" fullMotion={fullMotion}>
                  {tgrError}
                </AuthBanner>
              )}

              <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="space-y-4">
                  <ShakeField trigger={tgrError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Имя пользователя</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                        <Input placeholder="username" value={tgrUsername}
                          onChange={(e) => handleUsernameChange(e.target.value, true)}
                          className="pl-10 pr-9 min-h-[44px]" style={{
                            backgroundColor: "var(--mq-input-bg)",
                            border: `1px solid ${tgrError ? '#ef4444' : usernameStatus === 'available' ? '#22c55e' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : 'var(--mq-border)'}`,
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
                  </ShakeField>

                  <Button onClick={handleWidgetRegister}
                    disabled={tgrLoading || !tgrUsername || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                    className="w-full min-h-[44px]" style={{ backgroundColor: usernameStatus === 'taken' ? '#1d4ed8' : "var(--mq-telegram)", color: "#ffffff" }}>
                    {tgrLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Создаём…</span>
                      </span>
                    ) : usernameStatus === 'taken' ? "Привязать к существующему аккаунту" : "Создать аккаунт"}
                  </Button>
                </div>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        {/* ─── Telegram: Link to existing account (password required) ─── */}
        {authStep === "telegram-link" && (
          <motion.div key="telegram-link" {...stepMotion("telegram-link")}>
            <AuthCard firstMount={firstMount} fullMotion={fullMotion} loading={tgLinkLoading}>

              <Reveal index={0} firstMount={firstMount} fullMotion={fullMotion}>
                <button
                  onClick={() => { setAuthStep(widgetLinkMode ? "telegram-widget-register" : "telegram-register"); setTgLinkError(""); }}
                  className="flex items-center gap-1 mb-4 min-h-[44px]" style={{ color: "var(--mq-text-muted)" }}>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">Назад</span>
                </button>
              </Reveal>

              <Reveal index={1} firstMount={firstMount} fullMotion={fullMotion} className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "rgba(42,171,238,0.12)" }}>
                  <Lock className="w-8 h-8" style={{ color: "var(--mq-telegram)" }} />
                </div>
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
              </Reveal>

              {tgLinkError && (
                <AuthBanner tone="error" fullMotion={fullMotion}>
                  {tgLinkError}
                </AuthBanner>
              )}

              <Reveal index={2} firstMount={firstMount} fullMotion={fullMotion}>
                <div className="space-y-4">
                  <ShakeField trigger={tgLinkError} fullMotion={fullMotion}>
                    <div>
                      <label className="text-sm mb-1 block" style={{ color: "var(--mq-text-muted)" }}>Пароль</label>
                      <div className="relative">
                        <Input
                          type={tgLinkShowPassword ? "text" : "password"}
                          placeholder="Введите пароль от аккаунта"
                          value={tgLinkPassword}
                          onChange={(e) => setTgLinkPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleTgLinkSubmit(); }}
                          className="pr-10 min-h-[44px]"
                          style={{
                            backgroundColor: "var(--mq-input-bg)",
                            border: `1px solid ${tgLinkError ? '#ef4444' : 'var(--mq-border)'}`,
                            color: "var(--mq-text)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setTgLinkShowPassword(!tgLinkShowPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                          style={{ color: "var(--mq-text-muted)" }}
                          aria-label={tgLinkShowPassword ? "Скрыть пароль" : "Показать пароль"}
                        >
                          {tgLinkShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </ShakeField>

                  <Button onClick={handleTgLinkSubmit}
                    disabled={tgLinkLoading || !tgLinkPassword}
                    className="w-full min-h-[44px]" style={{ backgroundColor: "var(--mq-telegram)", color: "#ffffff" }}>
                    {tgLinkLoading ? (
                      <span className="flex items-center justify-center gap-2 w-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Привязываем…</span>
                      </span>
                    ) : "Привязать Telegram"}
                  </Button>
                </div>
              </Reveal>
            </AuthCard>
          </motion.div>
        )}

        </AnimatePresence>
      </div>
    </div>
  );
}
