import { useEffect, type DependencyList } from "react";

/**
 * Like useEffect, but passes an AbortSignal to the async callback.
 * Automatically aborts the in-flight HTTP request when deps change
 * or component unmounts — unlike `let cancelled = false`, which only
 * prevents setState but lets the request complete on the server.
 *
 * The double `signal.aborted` check (after fetch AND after json()) is
 * necessary because the AbortController.abort() is synchronous, but
 * the Promise chain is async — the fetch may resolve between abort()
 * and the next await.
 *
 * @example
 * useAbortableEffect(async (signal) => {
 *   const res = await fetch("/api/messages", { signal });
 *   if (signal.aborted) return;
 *   const data = await res.json();
 *   if (signal.aborted) return;
 *   setMessages(data);
 * }, [userId, selectedContactId]);
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => Promise<void> | void,
  deps: DependencyList
): void {
  useEffect(() => {
    const controller = new AbortController();

    const result = effect(controller.signal);
    if (result instanceof Promise) {
      result.catch((e) => {
        // AbortError is expected — not a real error
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.warn("[useAbortableEffect]", e);
      });
    }

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
