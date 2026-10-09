"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { spotifyAuth } from "@/lib/spotify";

/**
 * Spotify OAuth callback (PKCE, no client secret).
 *
 * Spotify redirects here with ?code= (or ?error=). The page exchanges the
 * code browser→accounts.spotify.com (official CORS flow), stores the tokens,
 * fetches /me (product tier → Premium detection), then returns to /app.
 */

export default function SpotifyCallbackPage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      // Clean the URL immediately (tokens/code must not linger in history).
      window.history.replaceState({}, document.title, "/spotify/callback");

      if (error) {
        setState("error");
        setErrorMsg(
          error === "access_denied"
            ? "Подключение отменено"
            : `Spotify: ${error}`,
        );
        return;
      }
      if (!code) {
        setState("error");
        setErrorMsg("Spotify: код авторизации не получен");
        return;
      }

      const result = await spotifyAuth.handleCallback(code, state);
      if (!result.ok) {
        setState("error");
        setErrorMsg(
          result.error === "OAUTH_STATE_MISMATCH"
            ? "Проверка состояния не пройдена (возможен устаревший редирект) — попробуйте подключиться заново"
            : `Ошибка авторизации: ${result.error || "неизвестно"}`,
        );
        return;
      }

      // Back into the app — the library/settings surfaces pick the session up.
      router.replace("/app?spotify=connected");
    })();
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--mq-bg, #0a0a0f)",
        color: "var(--mq-text, #eee)",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 40 }}>MQ</div>
      {state === "working" ? (
        <>
          <div
            aria-live="polite"
            style={{ fontSize: 15, opacity: 0.8 }}
          >
            Подключение Spotify…
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.15)",
              borderTopColor: "#1db954",
              animation: "mq-spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes mq-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, color: "#ff6b6b", maxWidth: 340, textAlign: "center" }}>
            {errorMsg}
          </div>
          <button
            onClick={() => router.replace("/app?spotify=error")}
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Вернуться в MQ
          </button>
        </>
      )}
    </div>
  );
}
