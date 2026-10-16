"use client";

/**
 * Player Dock Mode — user-selectable placement of the desktop player.
 *
 * The floating bottom capsule overlaps tall views (Messenger). Instead of
 * forcing one behavior, the user picks one of three modes; the choice is
 * persisted in localStorage and shared live across components via a
 * subscribe/get store (same pattern as settings toggles):
 *
 *   "bottom" — the classic floating capsule at the bottom
 *   "side"   — compact vertical capsule docked to the right edge
 *   "hidden" — no player chrome except a small restore chip
 *
 * ROUTE-AWARE DEFAULT (v14): until the user makes an EXPLICIT choice,
 * chat routes (messenger) at desktop widths (≥1024px) default to "side"
 * so the conversation is never covered by the bottom capsule. Everywhere
 * else the classic "bottom" default applies. The moment the user picks a
 * mode in the player menu, that choice wins on every route (persisted).
 *
 * Desktop-only by design: PlayerBar already returns null on mobile
 * (MobileDock combines player + nav there), so the mode has no effect
 * below the lg breakpoint.
 *
 * Storage: localStorage "mq-player-dock". Invalid values fall back to
 * the route-aware default (defensive — storage is user-editable).
 */

export type PlayerDockMode = "bottom" | "side" | "hidden";

const STORAGE_KEY = "mq-player-dock";
/** Last VISIBLE dock mode ("bottom"/"side" — never "hidden"). The restore
 *  chip returns here, so hiding is always reversible to where the user
 *  actually was, not a hardcoded "bottom". */
const LAST_DOCK_KEY = "mq-player-last-dock";
export const PLAYER_DOCK_MODES: readonly PlayerDockMode[] = ["bottom", "side", "hidden"] as const;

/** Views where the auto-default prefers the side capsule on desktop. */
export const SIDE_DEFAULT_VIEWS: readonly string[] = ["messenger"] as const;

type Listener = (mode: PlayerDockMode) => void;

let cachedChoice: PlayerDockMode | null | undefined;
const listeners = new Set<Listener>();

// ── Route context (set by AppShell; only affects users with no choice) ─────
let routeView = "";
let routeDesktop = false;

// ── Route context subscription (v16) ──────────────────────────────────────
// The restore chip (and any dock-aware chrome) needs the CURRENT route even
// when the user has an explicit dock choice — the mode listeners above are
// NOT notified in that case (a stored choice wins, by design). Route
// listeners are a separate channel: always notified, always current.
const routeListeners = new Set<(view: string) => void>();

export function getPlayerRouteView(): string {
  return routeView;
}

export function subscribePlayerRouteView(listener: (view: string) => void): () => void {
  routeListeners.add(listener);
  listener(routeView);
  return () => {
    routeListeners.delete(listener);
  };
}

function readStorage(): PlayerDockMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "bottom" || raw === "side" || raw === "hidden") return raw;
    return null;
  } catch {
    // Private mode / storage disabled — keep the default.
    return null;
  }
}

function readChoice(): PlayerDockMode | null {
  if (cachedChoice === undefined) {
    cachedChoice = readStorage();
  }
  return cachedChoice;
}

/** The route-aware auto default (only used when the user has no choice). */
function autoDock(): PlayerDockMode {
  if (routeDesktop && SIDE_DEFAULT_VIEWS.includes(routeView)) return "side";
  return "bottom";
}

/**
 * Current dock mode. Resolves to the user's stored choice when present;
 * otherwise the route-aware default ("side" on chat routes at ≥1024px,
 * "bottom" everywhere else; "bottom" before hydration / on the server).
 */
export function getPlayerDock(): PlayerDockMode {
  return readChoice() ?? autoDock();
}

/** Whether the user has made an explicit, persisted dock choice. */
export function hasUserDockChoice(): boolean {
  return readChoice() !== null;
}

function readLastDock(): PlayerDockMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_DOCK_KEY);
    if (raw === "bottom" || raw === "side") return raw;
    return null;
  } catch {
    return null;
  }
}

export function setPlayerDock(mode: PlayerDockMode): void {
  const next: PlayerDockMode =
    mode === "bottom" || mode === "side" || mode === "hidden" ? mode : "bottom";
  const prev = getPlayerDock();
  cachedChoice = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
    // Remember the last VISIBLE mode — the restore chip's return target.
    if (next === "bottom" || next === "side") {
      window.localStorage.setItem(LAST_DOCK_KEY, next);
    }
  } catch {
    // Storage may be unavailable — the in-memory value still applies.
  }
  if (next === prev) return;
  listeners.forEach((l) => l(next));
}

/**
 * Restore from the hidden dock — the chip's single action. Returns the
 * player to the last VISIBLE mode ("side" if the user hid the side capsule,
 * "bottom" if the capsule); with no history (first-ever hide came from the
 * auto route default) falls back to the route-aware default (side on chat
 * routes at desktop, bottom everywhere else).
 */
export function restorePlayerDock(): void {
  setPlayerDock(readLastDock() ?? autoDock());
}

/**
 * Route context update from AppShell (current view + desktop viewport).
 * Recomputes the auto default and notifies subscribers when the effective
 * mode changes for users who have NOT made an explicit choice yet.
 */
export function setDockRouteContext(view: string, desktop: boolean): void {
  routeView = view;
  routeDesktop = desktop;
  // Route listeners always sync (separate channel from the mode listeners:
  // a stored dock choice wins for the MODE, but the restore chip still
  // needs to know which route it is hovering over).
  routeListeners.forEach((l) => l(view));
  if (hasUserDockChoice()) return;
  // Re-notify with the recomputed effective mode (no-op when unchanged
  // from each listener's perspective — subscribers re-read getPlayerDock).
  const mode = autoDock();
  listeners.forEach((l) => l(mode));
}

export function subscribePlayerDock(listener: Listener): () => void {
  listeners.add(listener);
  // Emit the current value immediately so late subscribers sync.
  listener(getPlayerDock());
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook — clears the cache so a fresh read happens. */
export function resetPlayerDockForTest(): void {
  cachedChoice = undefined;
  listeners.clear();
  routeListeners.clear();
  routeView = "";
  routeDesktop = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LAST_DOCK_KEY);
  } catch {}
}
