"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LoaderState<T> {
  /** Last successfully loaded value (kept while a newer request is in flight). */
  data: T | undefined;
  /** Error from the latest settled request, if it failed. */
  error: unknown;
  /** True while the request for the current key has not settled yet. */
  loading: boolean;
  /** Re-run the loader for the current key (e.g. after a mutation or on a poll tick). */
  reload: () => void;
}

/**
 * Keyed async loader without synchronous setState inside effects.
 *
 * The request re-runs whenever `key` changes or `reload()` is called. `loading`
 * is derived (current key ≠ last settled key) instead of being toggled by hand,
 * so there is no `setLoading(true)` cascade render and no stale-response race:
 * responses for an outdated key are dropped via AbortController.
 *
 * Pass `key = null` to skip loading entirely.
 */
export function useLoader<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): LoaderState<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown } | null>(null);
  const requestKey = key === null ? null : `${key}#${nonce}`;

  useEffect(() => {
    if (requestKey === null) return;
    const ctrl = new AbortController();
    loadRef.current(ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setResult({ key: requestKey, data });
      },
      (error: unknown) => {
        if (!ctrl.signal.aborted) setResult((prev) => ({ key: requestKey, data: prev?.data, error }));
      },
    );
    return () => ctrl.abort();
  }, [requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: result?.data,
    error: result?.key === requestKey ? result?.error : undefined,
    loading: requestKey !== null && result?.key !== requestKey,
    reload,
  };
}
