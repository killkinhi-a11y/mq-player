import { database } from "@/lib/database";

/**
 * Server-side owner bootstrap (Task: @sss — главный админ).
 *
 * How the role system works here:
 * - The DB `User.role` column is the single source of truth ("user" | "admin").
 * - `/admin/*` pages re-check the DB role on every request (admin/layout.tsx).
 * - Admin APIs re-check with withAdminAuth (JWT role claim + fresh DB role).
 * - The frontend store mirrors `userRole` from /api/auth/me and login responses.
 *
 * This module closes the bootstrap gap: without a pre-existing admin nobody
 * could ever be promoted (PATCH /api/admin/users requires an admin). It runs
 * SERVER-SIDE ONLY, writes the role to the DATABASE (persistent across
 * logout/login, refresh, devices) and never touches regular admins.
 *
 * Owner transfer semantics (2026-09):
 * - CURRENT owner (@sss) is auto-promoted on login/`/me` if not admin yet.
 * - FORMER owners (the previous main admin) are DEMOTED back to "user" on
 *   their next login/`/me` — their stale JWT stops working for admin APIs
 *   immediately because withAdminAuth re-checks the DB role per request.
 * - Admins granted through the admin panel (not in either list) are never
 *   touched by this module.
 *
 * Override via env:
 *   ADMIN_USERNAMES="sss,other-owner"         — current owners
 *   FORMER_ADMIN_USERNAMES="a,b"              — append to the demotion list
 */

/** Previous main admins — fully removed from owner/admin status. */
const FORMER_OWNER_USERNAMES_DEFAULT = ["liluzipyzi"];

/** Usernames that must NEVER be re-granted admin via this module. */
const BLOCKED_USERNAMES: string[] = ["liluzipyzi"];

/**
 * Owner list, resolved per-call (env can change in tests / runtime).
 */
function ownerUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "sss")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Former owners to demote: the built-in list plus env additions.
 * A username that appears in BOTH current and former lists is treated as
 * current (env wins) and excluded from demotion.
 */
function formerOwnerUsernames(): string[] {
  const fromEnv = (process.env.FORMER_ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const current = new Set(ownerUsernames());
  return [...new Set([...FORMER_OWNER_USERNAMES_DEFAULT, ...fromEnv])].filter(
    (u) => !current.has(u)
  );
}

export function isOwnerUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const u = username.toLowerCase();
  if (BLOCKED_USERNAMES.includes(u)) return false;
  return ownerUsernames().includes(u);
}

export function isFormerOwnerUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return formerOwnerUsernames().includes(username.toLowerCase());
}

/**
 * Reconcile the DB role of a user with the owner configuration:
 * - current owner  + role != admin → promote to "admin" (DB write)
 * - former owner   + role == admin → demote to "user"   (DB write)
 * - everyone else                → no writes, role unchanged
 * Returns the effective role AFTER reconciliation.
 */
export async function ensureOwnerAdminRole(user: {
  id: string;
  username?: string | null;
  role?: string | null;
}): Promise<string> {
  const currentRole = user.role || "user";
  if (!user.id) return currentRole;

  // 1) Current owner: grant admin (idempotent).
  if (currentRole !== "admin" && isOwnerUsername(user.username)) {
    try {
      await database.updateUser(user.id, { role: "admin" });
      return "admin";
    } catch (error) {
      console.error("[admin-grant] DB promotion failed:", error);
      // Fail safe: keep the previous role; /admin layout will still deny.
      return currentRole;
    }
  }

  // 2) Former owner: strip admin (the old main admin must lose rights).
  if (currentRole === "admin" && isFormerOwnerUsername(user.username)) {
    try {
      await database.updateUser(user.id, { role: "user" });
      console.info(
        `[admin-grant] former owner "${user.username}" demoted to "user" (owner transferred)`
      );
      return "user";
    } catch (error) {
      console.error("[admin-grant] DB demotion failed:", error);
      // Fail safe for security: report the DEMOTED role so callers/JWT/UI
      // stop treating this user as admin even if the DB write failed; the
      // next successful write will persist it.
      return "user";
    }
  }

  // 3) Regular user / panel-granted admin: untouched.
  return currentRole;
}
