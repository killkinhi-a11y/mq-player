"use client";

/*
 * /desktop-auth — the browser side of the desktop Google login handoff.
 *
 * The OAuth callback redirected here with ?c=<one-time code>. This page
 * exchanges the code for a session JWT (POST — the token never enters
 * the URL), then hands it to the OS via the registered mq:// protocol
 * (fragment-carried), where the installed MQ Player desktop app picks it
 * up. No MQ app installed? The page says so honestly — nothing fake.
 */

import { useEffect, useState, useCallback } from "react";

type Phase = "exchanging" | "ready" | "done" | "failed" | "no-app";

export default function DesktopAuthPage() {
  // The code is read ONCE at first render (lazy initializer — the URL never
  // changes for this page's lifetime; no sync setState in effect needed).
  // Window guard: this page is prerendered on the server where there is no
  // URL to read — the server renders the safe fallback and the client
  // corrects instantly on hydration (the page is always entered via a
  // redirect with ?c= in practice).
  const [code] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("c")
      : null
  );
  const [phase, setPhase] = useState<Phase>(code ? "exchanging" : "failed");
  const [message, setMessage] = useState(
    code ? "" : "Ссылка недействительна — войдите заново."
  );
  const [token, setToken] = useState<string | null>(null);

  const handoffToApp = useCallback((jwt: string) => {
    // Fragment navigation → the OS protocol handler receives the full URL;
    // fragments stay out of server logs and browser history.
    window.location.href = `mq://auth#${jwt}`;
    // If the OS has no handler the navigation is a no-op — the visible
    // button below stays as the manual fallback.
    setTimeout(() => setPhase((p) => (p === "done" ? p : "no-app")), 1200);
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/desktop-handoff", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.token) {
          if (!cancelled) {
            setPhase("failed");
            setMessage(
              "Код истёк (действует 2 минуты). Войдите через приложение заново."
            );
          }
          return;
        }
        if (!cancelled) {
          setToken(data.token);
          setPhase("done");
          handoffToApp(data.token);
        }
      } catch {
        if (!cancelled) {
          setPhase("failed");
          setMessage("Нет соединения с сервером.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, handoffToApp]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0e0e",
        color: "#f2f2f4",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          borderRadius: 24,
          background: "rgba(24, 24, 30, 0.86)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          padding: 28,
          textAlign: "center",
        }}
      >
        <svg width="56" height="56" viewBox="0 0 512 512" style={{ margin: "0 auto 14px", display: "block" }}>
          <rect x="24" y="24" width="464" height="464" rx="112" fill="#14141f" />
          <text x="256" y="316" text-anchor="middle" fontFamily="system-ui" fontWeight="800" fontSize="204" fill="#e03131">mq</text>
          <circle cx="416" cy="96" r="26" fill="#e03131" />
        </svg>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>
          Вход в MQ Player
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: "#9a9aa3" }}>
          {phase === "exchanging" && "Проверяем вход…"}
          {phase === "done" && "Готово! Возвращаемся в приложение…"}
          {phase === "no-app" &&
            "Браузер не смог открыть MQ Player автоматически. Нажмите кнопку ниже — если приложение установлено, оно откроется."}
          {phase === "failed" && (message || "Не удалось завершить вход.")}
        </p>

        {phase === "failed" && (
          <a
            href="/play"
            style={{
              display: "inline-block",
              padding: "10px 22px",
              borderRadius: 12,
              background: "#e03131",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Войти на сайте
          </a>
        )}

        {token && phase !== "failed" && (
          <button
            onClick={() => handoffToApp(token)}
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              border: "none",
              background: "#e03131",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Открыть в MQ Player
          </button>
        )}

        <p style={{ margin: "18px 0 0", fontSize: 12, color: "#6a6a72" }}>
          Это окно можно закрыть после входа.
        </p>
      </div>
    </main>
  );
}
