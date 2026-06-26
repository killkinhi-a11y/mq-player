/**
 * Safe state update utilities — prevent React error #300.
 *
 * React error #300: "Cannot update a component while rendering a different
 * component." This happens when a useEffect calls setState synchronously
 * during mount, and the state update triggers a re-render of a parent
 * component that is still in its render phase.
 *
 * Solution: defer the state update to the next macrotask via setTimeout(0).
 * Macrotasks run AFTER the current render commit, so they can safely update
 * any component's state without triggering #300.
 */

/**
 * Defer a state update to the next macrotask.
 * Use this inside useEffect when you need to call setState synchronously
 * on mount or when deps change.
 *
 * @example
 * useEffect(() => {
 *   safeSetState(() => setTracksLoading(true));
 * }, [artist.name]);
 */
export function safeSetState(fn: () => void): void {
  if (typeof window === "undefined") {
    // SSR — just run synchronously
    fn();
    return;
  }
  setTimeout(fn, 0);
}

/**
 * Defer multiple state updates as a batch.
 * All updates run in the same macrotask, so React batches them.
 *
 * @example
 * useEffect(() => {
 *   safeBatch(() => {
 *     setTracksLoading(true);
 *     setTracks([]);
 *   });
 * }, [artist.name]);
 */
export function safeBatch(fn: () => void): void {
  if (typeof window === "undefined") {
    fn();
    return;
  }
  setTimeout(fn, 0);
}
