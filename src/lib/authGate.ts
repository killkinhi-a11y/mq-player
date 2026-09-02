/**
 * authGate — central gate for protected-route polling (Phase 2C).
 *
 * PROBLEM (root cause of the 401 polling storm):
 *   Demo mode sets `isAuthenticated: true` + `userId: "demo-user-id"` in the
 *   store. Every polling hook gated only on `isAuthenticated` / `userId`
 *   (friends listening, live sessions, rec updates, unread messages,
 *   notifications, periodic sync, listening-status updates) therefore
 *   treated the DEMO session as a real one and kept hitting protected API
 *   routes. Each request returned 401 (demo has no session cookie), and the
 *   hooks swallowed the failure and retried on the next tick forever:
 *   401 → retry → 401 → retry … (~650 wasted requests measured in 2.5 min
 *   of anonymous/demo mode on production).
 *
 * BEHAVIOR implemented here (per Phase 2C spec):
 *   AUTHENTICATED (real session)  → polling allowed
 *   DEMO / UNAUTHENTICATED        → protected polling disabled
 *   401                           → controlled recovery (one /api/auth/me
 *                                   probe), then polling is suspended until
 *                                   the next auth generation change (login).
 *
 * The gate is intentionally tiny and dependency-free so every hook can
 * import it without pulling React or the store (safe for tests too).
 */

const DEMO_USER_ID = "demo-user-id";

let suspended = false;
let suspensionReason: string | null = null;

/** True when the given userId is the local demo account. */
export function isDemoUser(userId?: string | null): boolean {
  return userId === DEMO_USER_ID;
}

/**
 * True when polling protected routes is currently allowed:
 * real authenticated session AND polling not suspended after a 401.
 */
export function canPollProtected(
  userId?: string | null,
  isAuthenticated?: boolean,
): boolean {
  if (!userId || !isAuthenticated) return false;
  if (isDemoUser(userId)) return false;
  return !suspended;
}

/** Suspend all protected polling (idempotent — first reason wins). */
export function suspendPolling(reason: string): void {
  if (!suspended) suspensionReason = reason;
  suspended = true;
}

export function isPollingSuspended(): boolean {
  return suspended;
}

export function getPollingSuspensionReason(): string | null {
  return suspensionReason;
}

/** Called on login/logout — a fresh auth generation gets fresh polling. */
export function resetPollingSuspension(): void {
  suspended = false;
  suspensionReason = null;
}

/**
 * Controlled recovery for a 401 from a protected route.
 *
 * One single-flight probe to /api/auth/me decides the outcome:
 *   - probe OK    → the 401 was transient → polling resumes immediately;
 *   - probe fails → the session is truly expired → polling stays suspended
 *                   until the user logs in again (auth generation change).
 * Never retried in a loop: `probeInFlight` guarantees at most one probe at
 * a time and `suspended` guarantees no further requests after a failed one.
 */
let probeInFlight = false;

export async function controlled401Recovery(source: string): Promise<void> {
  suspendPolling(`401 from ${source}`);
  if (probeInFlight) return;
  if (typeof window === "undefined") return;
  probeInFlight = true;
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (res.ok) {
      // Session is alive — the 401 was transient (e.g. edge blip).
      resetPollingSuspension();
    }
    // else: keep suspended — no retry loop, next requests only after login.
  } catch {
    // Network error — keep suspended; visibility/login will re-gate.
  } finally {
    probeInFlight = false;
  }
}
