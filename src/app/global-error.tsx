"use client";

import { useCallback } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorMsg = error?.message || "";

  const handleReset = useCallback(() => {
    // Clear mq-related storage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.includes("mq") || k.includes("MQ") || k.includes("zustand"))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    try { sessionStorage.removeItem("mq-error-reload-count"); } catch {}

    // Unregister service workers
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
    }

    // Clear Cache API then reload
    if (window.caches) {
      window.caches.keys().then((ks) => {
        Promise.all(ks.map((k) => window.caches.delete(k))).then(() => {
          window.location.replace("/play?_r=" + Date.now());
        });
      });
      return;
    }

    window.location.replace("/play?_r=" + Date.now());
  }, []);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          backgroundColor: "#0e0e0e",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              borderRadius: "16px",
              padding: "24px",
              textAlign: "center",
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                marginBottom: "16px",
                color: "#e03131",
              }}
            >
              !
            </div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#f5f5f5",
              }}
            >
              Что-то пошло не так
            </h2>
            <p
              style={{
                fontSize: "14px",
                marginBottom: "24px",
                color: "#888",
                lineHeight: 1.5,
              }}
            >
              Произошла критическая ошибка. Попробуйте перезагрузить страницу.
              Если ошибка не исчезает — откройте в приватном окне (Ctrl+Shift+N)
              или очистите кэш браузера.
            </p>
            <button
              onClick={handleReset}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: 500,
                backgroundColor: "#e03131",
                color: "#f5f5f5",
                border: "none",
                cursor: "pointer",
              }}
            >
              Сбросить и перезагрузить
            </button>
            <p
              style={{
                fontSize: "12px",
                marginTop: "16px",
                color: "#888",
                opacity: 0.5,
              }}
            >
              {errorMsg || "Unknown error"}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
