"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorCount: number;
  errorMessage: string;
}

/**
 * ViewErrorBoundary — catches React errors per-view.
 * Instead of crashing the entire app (white screen), it shows a fallback
 * with a "Go back" button so the user can navigate elsewhere.
 *
 * After 3 retries, it stops retrying and shows the fallback permanently.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorCount: 0,
      errorMessage: error?.message || "Unknown error",
    };
  }

  componentDidCatch(error: Error) {
    const msg = error?.message || "";
    console.error("[ViewErrorBoundary] caught error:", msg);

    // Auto-retry for known transient errors (up to 3 times)
    if (
      this.state.errorCount < 3 &&
      (msg.includes("Minified React error #300") ||
        msg.includes("Minified React error #310") ||
        msg.includes("Minified React error #185") ||
        msg.includes("Maximum update depth exceeded") ||
        msg.includes("Cannot read properties of undefined") ||
        msg.includes("Cannot read properties of null") ||
        msg.includes("is not a function") ||
        msg.includes("is not defined"))
    ) {
      console.warn("[ViewErrorBoundary] auto-retry", this.state.errorCount + 1);
      this.setState((prev) => ({
        hasError: false,
        errorCount: prev.errorCount + 1,
      }));
    }
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) return this.props.fallback;

      // Default fallback — never show null (that's what causes "everything disappears")
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(224,49,49,0.15)" }}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#e03131" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-center" style={{ color: "var(--mq-text, #fff)" }}>
            Что-то пошло не так
          </p>
          <p className="text-xs text-center max-w-xs" style={{ color: "var(--mq-text-muted, #888)" }}>
            {this.state.errorMessage || "Произошла ошибка при загрузке"}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => this.setState({ hasError: false, errorCount: 0, errorMessage: "" })}
              className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
              style={{ backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
            >
              Повторить
            </button>
            <button
              onClick={() => {
                // Navigate to main view
                try {
                  const { useAppStore } = require("@/store/useAppStore");
                  useAppStore.getState().setView("main");
                } catch {
                  window.location.href = "/play";
                }
              }}
              className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text, #fff)" }}
            >
              На главную
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
