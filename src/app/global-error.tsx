"use client";

/**
 * global-error.tsx — frontend-patterns skill: root-level error boundary.
 * Catches errors in the root layout itself (which error.tsx cannot catch).
 * Must render its own <html> and <body> since the root layout is bypassed
 * when this component is invoked.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[mq] Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: 24,
          backgroundColor: "#0e0e0e",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Критическая ошибка
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
            Приложение не может загрузиться. Попробуйте обновить страницу.
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px",
            borderRadius: 9999,
            border: "none",
            backgroundColor: "#e03131",
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
