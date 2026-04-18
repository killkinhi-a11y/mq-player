"use client";

import { useEffect, useCallback } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorMsg = error?.message || "";

  useEffect(() => {
    console.error("[MQ Error]", errorMsg);
  }, [errorMsg]);

  const handleReset = useCallback(() => {
    // Only clear the app store, NOT all localStorage
    try { localStorage.removeItem("mq-store-v5"); } catch {}
    reset();
  }, [reset]);

  const handleFullReset = useCallback(() => {
    // Clear only the app store, then hard reload
    try { localStorage.removeItem("mq-store-v5"); } catch {}
    window.location.href = "/";
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
