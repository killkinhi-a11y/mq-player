"use client";

/**
 * error.tsx — frontend-patterns skill: Next.js App Router error boundary.
 * Catches unhandled errors in any route segment and shows a recovery UI
 * instead of a blank page. User can retry without full reload.
 */

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console (Sentry/other monitoring can hook here)
    console.error("[mq] Route error boundary caught:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-accent, #e03131) 15%, transparent)",
          }}
        >
          <RotateCcw
            className="w-5 h-5"
            style={{ color: "var(--mq-accent, #e03131)" }}
          />
        </div>
        <h2
          className="text-xl font-semibold"
          style={{
            color: "var(--mq-text)",
            fontFamily: "var(--mq-font-serif)",
          }}
        >
          Что-то пошло не так
        </h2>
        <p
          className="text-sm max-w-sm"
          style={{ color: "var(--mq-text-muted)" }}
        >
          Произошла ошибка при загрузке страницы. Попробуйте ещё раз — это
          обычно помогает.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-full text-sm font-medium transition-all"
        style={{
          backgroundColor: "var(--mq-accent, #e03131)",
          color: "var(--mq-text-on-accent, #ffffff)",
          boxShadow: "var(--mq-shadow-accent)",
        }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
