"use client";

/**
 * Player Dock Mode — user-selectable placement of the desktop player.
 *
 * The floating bottom capsule overlaps tall views (Messenger). Instead of
 * forcing one behavior, the user picks one of three modes; the choice is
 * persisted in localStorage and shared live across components via a
 * subscribe/get store (same pattern as settings toggles):
 *
 *   "bottom" — the classic floating capsule at the bottom (default)
 *   "side"   — compact vertical capsule docked to the right edge
 *   "hidden" — no player chrome except a small restore chip
 *
 * Desktop-only by design: PlayerBar already returns null on mobile
 * (MobileDock combines player + nav there), so the mode has no effect
 * below the lg breakpoint.
 *
 * Storage: localStorage "mq-player-dock". Invalid values fall back to
 * "bottom" (defensive — storage is user-editable).
 */

export type PlayerDockMode = "bottom" | "side" | "hidden";

const STORAGE_KEY = "mq-player-dock";
export const PLAYER_DOCK_MODES: readonly PlayerDockMode[] = ["bottom", "side", "hidden"] as const;

type Listener = (mode: PlayerDockMode) => void;

let cached: PlayerDockMode | null = null;
const listeners = new Set<Listener>();

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

/** Current dock mode ("bottom" before hydration / when storage fails). */
export function getPlayerDock(): PlayerDockMode {
  if (cached === null) {
    cached = readStorage() ?? "bottom";
  }
  return cached;
}

export function setPlayerDock(mode: PlayerDockMode): void {
  const next: PlayerDockMode =
    mode === "bottom" || mode === "side" || mode === "hidden" ? mode : "bottom";
  if (next === cached) return;
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage may be unavailable — the in-memory value still applies.
  }
  listeners.forEach((l) => l(next));
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
  cached = null;
  listeners.clear();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
