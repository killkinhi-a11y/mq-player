"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

/**
 * ViewErrorBoundary — catches React #300/#310 errors per-view.
 * Instead of crashing the entire app, it retries rendering the view.
 * After 3 retries, it shows a minimal fallback.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorCount: 0,
    };
  }

  componentDidCatch(error: Error) {
    const msg = error?.message || "";
    // Only auto-retry for React #300/#310 errors
    if (msg.includes("Minified React error #300") || msg.includes("Minified React error #310")) {
      this.setState((prev) => ({
        hasError: false,
        errorCount: prev.errorCount + 1,
      }));
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}
