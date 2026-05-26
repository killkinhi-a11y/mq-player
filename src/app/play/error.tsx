"use client";

import { useEffect, useCallback, useRef } from "react";

const MAX_AUTO_RELOADS = 2;
const RELOAD_KEY = "mq-error-reload-count";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorMsg = error?.message || "";
  const didReload = useRef(false);

  useEffect(() => {
    if (didReload.current) return;

    console.error("[MQ Error]", errorMsg);

    // ── TDZ / module-init errors are almost always caused by stale chunks ──
    // The error "can't access lexical declaration 'X' before initialization"
    // means a JS chunk references a variable before its declaration executes.
    // This happens when the browser mixes old + new chunks (cache, SW, CDN race).
    // The only reliable fix is a hard reload with full cache busting.
    const tdzPattern = /can't access.*lexical declaration/i;
    const isTdZError = tdzPattern.test(errorMsg);

    // Other stale-data / cache-bust error patterns
    const stalePatterns = [
      "Failed to execute 'getItem' on 'Storage'", // Storage blocked/corrupted
      "Parsing failed",                           // Zustand JSON parse error
      "shellSuspendCounter",                      // React internal — recoverable
    ];
    const isStaleError = stalePatterns.some((p) => errorMsg.includes(p));

    if (!isTdZError && !isStaleError) return; // For all other errors, just show the UI

    // Check retry limit to prevent infinite reload loop
    try {
      const count = parseInt(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (count >= MAX_AUTO_RELOADS) {
        sessionStorage.removeItem(RELOAD_KEY);
        console.warn("[MQ Error] Max auto-reloads reached, showing error UI");
        return;
      }
      sessionStorage.setItem(RELOAD_KEY, String(count + 1));
    } catch {
      return;
    }

    didReload.current = true;
    console.warn("[MQ Error] Detected TDZ / stale-data error, auto-clearing...");

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

    // Clear Cache API then hard reload
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

  const handleFullReset = useCallback(() => {
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
    try { sessionStorage.removeItem(RELOAD_KEY); } catch {}

    // Unregister service workers
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
    }

    // Clear all caches
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
          Произошла ошибка при загрузке. Если ошибка не исчезает — откройте в
          приватном окне (Ctrl+Shift+N) или очистите кэш браузера.
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
            onClick={handleFullReset}
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
