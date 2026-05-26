"use client";

import { useEffect, useCallback } from "react";

const MAX_AUTO_RELOADS = 2;
const RELOAD_KEY = "mq-root-error-reload-count";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorMsg = error?.message || "";

  useEffect(() => {
    console.error("[MQ Root Error]", errorMsg);

    // ── Auto-recover from TDZ / stale-data errors ──
    const tdzPattern = /can't access.*lexical declaration/i;
    const isTdZError = tdzPattern.test(errorMsg);

    const stalePatterns = [
      "Failed to execute 'getItem' on 'Storage'",
      "Parsing failed",
      "shellSuspendCounter",
    ];
    const isStaleError = stalePatterns.some((p) => errorMsg.includes(p));

    if (!isTdZError && !isStaleError) return;

    try {
      const count = parseInt(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (count >= MAX_AUTO_RELOADS) {
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }
      sessionStorage.setItem(RELOAD_KEY, String(count + 1));
    } catch {
      return;
    }

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
  }, [errorMsg]);

  const handleReset = useCallback(() => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch {}
    reset();
  }, [reset]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center"
        style={{
          backgroundColor: "var(--mq-card, #1a1a1a)",
          border: "1px solid var(--mq-border, #333)",
        }}
      >
        <div
          className="text-5xl mb-4"
          style={{ color: "var(--mq-accent, #e03131)" }}
        >
          !
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: "var(--mq-text, #f5f5f5)" }}
        >
          Что-то пошло не так
        </h2>
        <p
          className="text-sm mb-6"
          style={{ color: "var(--mq-text-muted, #888)" }}
        >
          Произошла ошибка при загрузке приложения.
        </p>
        <div className="space-y-3">
          <button
            onClick={handleReset}
            className="w-full p-3 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: "var(--mq-accent, #e03131)",
              color: "var(--mq-text, #f5f5f5)",
            }}
          >
            Перезагрузить
          </button>
          <button
            onClick={() => {
              try { sessionStorage.removeItem(RELOAD_KEY); } catch {}
              window.location.href = "/";
            }}
            className="w-full p-3 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--mq-border, #333)",
              color: "var(--mq-text-muted, #888)",
            }}
          >
            Сбросить данные и перезагрузить
          </button>
        </div>
        <p
          className="text-xs mt-4"
          style={{ color: "var(--mq-text-muted, #888)", opacity: 0.5 }}
        >
          {errorMsg || "Unknown error"}
        </p>
      </div>
    </div>
  );
}
