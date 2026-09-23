"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { isDesktopApp } from "@/lib/desktop-mode";
import { consumeLinkResult, clearLinkResult } from "@/lib/link-result";
import { toast } from "@/hooks/use-toast";
import {
  Check, Link2, Loader2, AlertTriangle, X,
} from "lucide-react";

/**
 * AccountLinkingCard — W13 «Подключённые сервисы».
 *
 * Lets the SIGNED-IN user attach Google and Telegram identities to the
 * current MQ account (and see what's already linked). Security contract:
 *  - server-side link mode requires the authenticated session (never a
 *    silent merge of two accounts);
 *  - a provider already owned by ANOTHER account surfaces as a clear
 *    conflict state — nothing is merged or overwritten;
 *  - the flows reuse the production OAuth endpoints in link mode
 *    (/api/auth/google?link=1, telegram-widget callback ?link=1);
 *  - nothing secret ever reaches the client.
 *
 * Hidden entirely for demo sessions (no server session to link to).
 */

interface LinkProvidersResponse {
  google: { linked: boolean; email: string | null };
  telegram: { linked: boolean; username: string | null };
}

const CONFLICT_MESSAGES: Record<string, string> = {
  google_taken: "Этот Google-аккаунт уже привязан к другому профилю MQ",
  telegram_taken: "Этот Telegram уже привязан к другому профилю MQ",
  no_session: "Сессия истекла — войдите заново и повторите",
  link_no_session: "Сессия истекла — войдите заново и повторите",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  google: "Google подключён к вашему аккаунту",
  telegram: "Telegram подключён к вашему аккаунту",
};

export default function AccountLinkingCard() {
  const userId = useAppStore((s) => s.userId);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [desktopApp] = useState(() => isDesktopApp());

  const [status, setStatus] = useState<LinkProvidersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [telegramBotName, setTelegramBotName] = useState<string | null>(null);
  const [showTelegramWidget, setShowTelegramWidget] = useState(false);

  const tgWidgetRef = useRef<HTMLDivElement>(null);

  const isDemo = userId === "demo-user-id";
  const visible = isAuthenticated && !isDemo;

  // Result banner from the OAuth redirect (?linkSuccess= / ?linkError=) —
  // read ONCE at mount via the lazy initializer (client-only guard). The
  // snapshot captured by AppShell during ITS first render is consumed first:
  // this card lives inside the LAZY SettingsView, so by the time it mounts,
  // AppShell's history-sync effect has usually already rewritten the URL to
  // /play?v=… and the raw params are gone (see lib/link-result.ts). The
  // URLSearchParams fallback still covers contexts where the card mounts
  // before any URL cleanup (tests, direct embeds). The URL is cleaned in
  // the effect below WITHOUT any setState (lint-clean, no cascading render);
  // a successful link also refetches the status.
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const captured = consumeLinkResult();
    const ok = captured.ok ?? new URLSearchParams(window.location.search).get("linkSuccess");
    const err = captured.err ?? new URLSearchParams(window.location.search).get("linkError");
    if (ok) return { kind: "ok", text: SUCCESS_MESSAGES[ok] ?? "Сервис подключён" };
    if (err) return { kind: "error", text: CONFLICT_MESSAGES[err] ?? "Не удалось подключить сервис" };
    return null;
  });

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/link/providers");
      if (res.status === 401) {
        setStatus(null);
        return;
      }
      if (res.ok) setStatus(await res.json());
    } catch {
      /* offline — keep whatever we had */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Defer through a microtask so no setState runs synchronously inside
    // the effect body (react-compiler cascading-render rule).
    void Promise.resolve().then(loadStatus);
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => {
        setGoogleConfigured(!!data?.google);
        setTelegramBotName(data?.telegramBotName ?? null);
      })
      .catch(() => {});
  }, [visible, loadStatus]);

  // Clean the link result params from the URL (a refresh must not repeat
  // the banner), clear the relay snapshot (a later remount of this card —
  // tab switches — must not replay the banner), and refresh linkage state
  // after a successful link. No synchronous setState — all updates ride
  // async continuations. (The clear lives HERE — an effect — not in
  // consumeLinkResult: dev StrictMode double-invokes the useState
  // initializer, and both invocations must read the same snapshot.)
  useEffect(() => {
    if (!visible || !banner) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("linkSuccess") && !params.get("linkError")) {
      clearLinkResult();
      return;
    }
    const wasSuccess = banner.kind === "ok";
    params.delete("linkSuccess");
    params.delete("linkError");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    clearLinkResult();
    if (wasSuccess) void Promise.resolve().then(loadStatus);
  }, [visible, banner, loadStatus]);

  // Mount the official Telegram Login Widget in LINK mode (web only —
  // inside the desktop webview the widget origin is unreachable; desktop
  // users link via the system browser).
  useEffect(() => {
    if (!showTelegramWidget || !telegramBotName || desktopApp) return;
    const container = tgWidgetRef.current;
    if (!container || container.childElementCount > 0) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    script.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/auth/telegram-widget/callback?link=1`
    );
    container.appendChild(script);
  }, [showTelegramWidget, telegramBotName, desktopApp]);

  const linkGoogle = useCallback(() => {
    if (desktopApp) {
      // Desktop webview OAuth is blocked by Google — open in system browser
      window.open(`${window.location.origin}/api/auth/google?link=1`, "_blank");
      toast({
        title: "Открываем браузер",
        description: "Завершите подключение Google во внешнем браузере",
      });
      return;
    }
    window.location.href = "/api/auth/google?link=1";
  }, [desktopApp]);

  if (!visible) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
      }}
    >
      {/* Title */}
      <div className="px-3 sm:px-4 py-3 flex items-center gap-3">
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-[var(--mq-r-card)] flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
          }}
        >
          <Link2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
            Подключённые сервисы
          </p>
          <p className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
            Вход через Google и Telegram — один аккаунт MQ
          </p>
        </div>
      </div>

      {/* Result banner (link success / conflict) */}
      {banner && (
        <div
          className="mx-3 sm:mx-4 mb-2 px-3 py-2.5 rounded-xl flex items-start gap-2.5"
          role="status"
          style={{
            backgroundColor:
              banner.kind === "ok"
                ? "color-mix(in srgb, #22c55e 12%, transparent)"
                : "color-mix(in srgb, #ef4444 12%, transparent)",
            border: `1px solid ${
              banner.kind === "ok"
                ? "color-mix(in srgb, #22c55e 25%, transparent)"
                : "color-mix(in srgb, #ef4444 25%, transparent)"
            }`,
          }}
        >
          {banner.kind === "ok" ? (
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#22c55e" }} />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
          )}
          <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--mq-text)" }}>
            {banner.text}
          </p>
          <button
            onClick={() => setBanner(null)}
            aria-label="Закрыть"
            className="shrink-0 p-0.5 rounded-md hover:bg-[var(--mq-overlay-hover)]"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Google row */}
      <div
        className="px-3 sm:px-4 py-3 sm:py-3.5 flex items-center gap-3"
        style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
      >
        <div className="w-9 h-9 rounded-[var(--mq-r-card)] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--mq-surface-2)" }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.52 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.01-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Google</p>
          <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
            {loading
              ? "Проверяем…"
              : status?.google.linked
                ? status.google.email || "Подключён"
                : googleConfigured
                  ? "Не подключён"
                  : "Недоступен (не настроен на сервере)"}
          </p>
        </div>
        {status?.google.linked ? (
          <span
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg mq-t-meta-2 font-semibold flex-shrink-0"
            style={{
              backgroundColor: "color-mix(in srgb, #22c55e 12%, transparent)",
              color: "#22c55e",
            }}
          >
            <Check className="w-3.5 h-3.5" /> Подключён
          </span>
        ) : (
          <button
            onClick={linkGoogle}
            disabled={loading || !googleConfigured}
            className="px-3 py-2 rounded-[var(--mq-r-card)] text-xs font-semibold whitespace-nowrap flex-shrink-0 disabled:opacity-50"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
              color: "var(--mq-accent)",
            }}
          >
            Подключить
          </button>
        )}
      </div>

      {/* Telegram row */}
      <div
        className="px-3 sm:px-4 py-3 sm:py-3.5 flex items-center gap-3"
        style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
      >
        <div className="w-9 h-9 rounded-[var(--mq-r-card)] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--mq-surface-2)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#2AABEE" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
            <path fill="#fff" d="M5.491 11.74c3.552-1.55 5.918-2.57 6.999-3.06 3.333-1.386 4.025-1.626 4.476-1.634.099-.002.32.023.463.14.121.1.155.234.171.329.016.095.036.312.02.482-.181 1.897-.962 6.503-1.36 8.63-.168.896-.5 1.193-.821 1.222-.698.064-1.228-.461-1.903-.906-1.057-.693-1.655-1.124-2.681-1.8-1.184-.78-.416-1.21.759-2.348.519-.503 1.884-1.754 1.924-1.904.005-.02.01-.093-.035-.132-.044-.039-.11-.026-.157-.015-.067.015-1.135.722-3.204 2.12-.303.209-.577.31-.823.304-.27-.006-.79-.155-1.176-.282-.474-.154-.85-.236-.818-.498.017-.137.201-.277.553-.421 2.157-.94 3.596-1.56 4.316-1.86 2.056-.855 2.482-1.003 2.76-1.007.061-.001.198.014.287.088.075.061.096.144.106.227.01.083.023.273.013.42-.222 2.335-1.186 8.005-1.677 10.62-.207 1.105-.616 1.172-.99 1.166-.525-.008-1.02-.264-1.454-.49-1.024-.537-2.108-1.108-3.107-1.66-1.087-.607-1.05-1.213.064-1.897 2.108-1.293 4.227-2.586 6.355-3.879l.001-.001z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Telegram</p>
          <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
            {loading
              ? "Проверяем…"
              : status?.telegram.linked
                ? status.telegram.username
                  ? `@${status.telegram.username.replace(/^@/, "")}`
                  : "Подключён"
                : telegramBotName
                  ? "Не подключён"
                  : "Недоступен (бот не настроен)"}
          </p>
        </div>
        {status?.telegram.linked ? (
          <span
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg mq-t-meta-2 font-semibold flex-shrink-0"
            style={{
              backgroundColor: "color-mix(in srgb, #22c55e 12%, transparent)",
              color: "#22c55e",
            }}
          >
            <Check className="w-3.5 h-3.5" /> Подключён
          </span>
        ) : (
          <button
            onClick={() => setShowTelegramWidget((v) => !v)}
            disabled={loading || !telegramBotName || desktopApp}
            title={desktopApp ? "Доступно в браузере — откройте mq1.vercel.app" : undefined}
            className="px-3 py-2 rounded-[var(--mq-r-card)] text-xs font-semibold whitespace-nowrap flex-shrink-0 disabled:opacity-50"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
              color: "var(--mq-accent)",
            }}
          >
            Подключить
          </button>
        )}
      </div>

      {/* Telegram widget mount (link mode) */}
      {showTelegramWidget && telegramBotName && !desktopApp && !status?.telegram.linked && (
        <div
          className="px-3 sm:px-4 py-3 flex flex-col items-center gap-2"
          style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
        >
          <p className="mq-t-meta-2 text-center" style={{ color: "var(--mq-text-muted)" }}>
            Подтвердите вход через официальный виджет Telegram
          </p>
          <div ref={tgWidgetRef} className="min-h-[40px] flex items-center justify-center" />
        </div>
      )}

      {loading && (
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
          <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>Загрузка статуса…</span>
        </div>
      )}
    </div>
  );
}
