/**
 * Centralized error logger for catch blocks.
 * Filters expected errors (AbortError) and logs everything else.
 * In production, forwards to Sentry if available.
 *
 * Replaces 167 empty `catch {}` blocks across the codebase.
 *
 * Usage patterns:
 *   catch (e) { logCatch("MessengerView.fetchMessages")(e); }
 *   .catch(logCatch("auth.verifyToken"))
 *
 * AbortError is filtered — it's an expected cancellation, not a real error.
 * This prevents console spam when using AbortController for fetch cancellation.
 */
export function logCatch(context: string): (e: unknown) => void {
  return (e: unknown) => {
    // AbortError is expected when using AbortController — not a real error
    if (e instanceof DOMException && e.name === "AbortError") return;
    if (e instanceof Error && e.message.includes("aborted")) return;

    console.error(`[${context}]`, e);

    // Forward to Sentry if available (loaded via Sentry browser SDK)
    if (typeof window !== "undefined" && (window as any).Sentry) {
      (window as any).Sentry.captureException(e, { tags: { context } });
    }
  };
}

/**
 * Safe JSON parse — never throws, returns fallback on parse failure.
 * Use for parsing localStorage, API responses, or untrusted JSON.
 *
 * @example
 * const data = safeJsonParse(raw, null);
 * if (!data) return;
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logCatch("safeJsonParse")(e);
    return fallback;
  }
}
