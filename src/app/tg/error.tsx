"use client";

import { useEffect } from "react";

/**
 * Error boundary for /tg route.
 *
 * If the Mini App crashes for ANY reason (React error, chunk load failure,
 * runtime exception), this component renders instead of a white screen.
 * It shows the error message + a button to reload.
 */
export default function TgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[tg-error-boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        background: "#0e0e0e",
        color: "#f0f0f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 8 }}>
        Mini App упал
      </h1>
      <p style={{ fontSize: 14, color: "#9a9a9a", maxWidth: 320, lineHeight: 1.5, margin: 0, marginBottom: 16 }}>
        Произошла ошибка при загрузке. Попробуйте перезагрузить.
      </p>
      <details
        style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "left",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          fontSize: 12,
          color: "#9a9a9a",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#f0f0f0" }}>
          Детали ошибки
        </summary>
        <pre
          style={{
            fontFamily: "ui-monospace, Monaco, monospace",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            margin: "8px 0 0",
            color: "#e03131",
          }}
        >
          {error.message}
          {error.stack ? "\n\n" + error.stack : ""}
          {error.digest ? "\n\nDigest: " + error.digest : ""}
        </pre>
      </details>
      <button
        onClick={reset}
        style={{
          background: "#e03131",
          color: "#fff",
          border: "none",
          padding: "12px 24px",
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 280,
          width: "100%",
        }}
      >
        🔄 Перезагрузить
      </button>
      <a
        href="/"
        style={{
          display: "inline-block",
          marginTop: 8,
          color: "#9a9a9a",
          fontSize: 14,
          textDecoration: "underline",
        }}
      >
        Открыть обычную версию
      </a>
    </div>
  );
}
