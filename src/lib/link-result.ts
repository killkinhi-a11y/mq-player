/**
 * link-result — W13 OAuth link-result relay (linkSuccess / linkError).
 *
 * PROBLEM this module solves: the OAuth callbacks redirect the browser to
 * `/play?linkSuccess=…` / `/play?linkError=…`, and AccountLinkingCard shows
 * the result banner by reading those params at ITS mount. But the card
 * lives inside the LAZY-loaded SettingsView (AppShell `dynamic()` import),
 * while AppShell's history-sync effect rewrites the URL to `/play?v=settings`
 * right after the first commit — BEFORE the lazy chunk mounts the card.
 * The params were gone by the time the card read them, so the user got NO
 * feedback (silently OK for success, invisible for conflicts).
 *
 * Same solution as the ?pl/?artist/?track deep links in AppShell (see the
 * "Parse DURING FIRST RENDER" note there): AppShell captures the params
 * during its first render — before any effect can rewrite the URL — into
 * this module-level snapshot; the card reads it at mount.
 *
 * StrictMode-safe semantics (dev double-invokes useState initializers):
 *  - capture: OVERWRITES when the URL carries a link result (a fresh OAuth
 *    redirect is always newer than anything buffered); leaves the buffer
 *    untouched otherwise (does not clobber with nulls on param-less loads).
 *  - consume: PURE read — no clearing here. The double-invoked initializer
 *    must observe the same value both times.
 *  - clear:   called from an EFFECT in the card (effects run after commit,
 *    after both initializer invocations) so the banner shows exactly once
 *    per redirect, never replaying on later remounts.
 *
 * Pure module state, no React — trivially testable, SSR-safe.
 */

export interface LinkResult {
  ok: string | null;
  err: string | null;
}

let captured: LinkResult | null = null;

/**
 * Capture linkSuccess/linkError from the CURRENT URL. Runs during AppShell's
 * first client render. A URL that carries a result always wins (fresh OAuth
 * redirect); a param-less URL never clobbers what was already captured.
 */
export function captureLinkResultFromLocation(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ok = params.get("linkSuccess");
  const err = params.get("linkError");
  if (ok === null && err === null) return;
  captured = { ok, err };
}

/**
 * Read the captured result. PURE — idempotent under StrictMode's double
 * initializer invocation. Returns nulls when nothing was captured.
 */
export function consumeLinkResult(): LinkResult {
  return captured ?? { ok: null, err: null };
}

/**
 * Clear the snapshot so a later mount of the card (tab switches etc.)
 * does not replay the banner. Called from the card's banner effect —
 * after commit, i.e. after every initializer invocation has read it.
 */
export function clearLinkResult(): void {
  captured = null;
}
