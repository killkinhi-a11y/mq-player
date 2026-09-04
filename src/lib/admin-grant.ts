import { database } from "@/lib/database";

/**
 * Server-side owner bootstrap (Task: @liluzipyzi — главный админ).
 *
 * How the role system works here:
 * - The DB `User.role` column is the single source of truth ("user" | "admin").
 * - `/admin/*` pages re-check the DB role on every request (admin/layout.tsx).
 * - Admin APIs re-check via withAdminAuth (JWT role claim, issued at login).
 * - The frontend store mirrors `userRole` from /api/auth/me and login responses.
 *
 * This module closes the bootstrap gap: without a pre-existing admin nobody
 * could ever be promoted (PATCH /api/admin/users requires an admin). It runs
 * SERVER-SIDE ONLY, writes the role to the DATABASE (persistent across
 * logout/login, refresh, devices) and never demotes anyone — admins granted
 * through the admin panel keep their role even if they leave this list.
 *
 * Override via env: ADMIN_USERNAMES="liluzipyzi,other-owner"
 */
/**
 * Owner list, resolved per-call (env can change in tests / runtime).
 * Override via env: ADMIN_USERNAMES="liluzipyzi,other-owner"
 */
function ownerUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "liluzipyzi")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return ownerUsernames().includes(username.toLowerCase());
}

/**
 * Grants "admin" in the DB to the project owner if not already admin.
 * Returns the effective role after the check.
 */
export async function ensureOwnerAdminRole(user: {
  id: string;
  username?: string | null;
  role?: string | null;
}): Promise<string> {
  const currentRole = user.role || "user";
  if (currentRole === "admin") return "admin";
  if (!user.id || !isOwnerUsername(user.username)) return currentRole;

  try {
    await database.updateUser(user.id, { role: "admin" });
    return "admin";
  } catch (error) {
    console.error("[admin-grant] DB promotion failed:", error);
    // Fail safe: keep the previous role; /admin layout will still deny.
    return currentRole;
  }
}
