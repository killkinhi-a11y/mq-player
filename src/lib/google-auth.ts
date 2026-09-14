import { database } from "@/lib/database";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";
import bcrypt from "bcryptjs";
import type { GoogleIdentity } from "@/lib/oauth";
import { deriveUniqueUsername, generateRandomPassword } from "@/lib/oauth";

/**
 * Google login — shared account resolution (browser callback AND native app).
 *
 * This is the SINGLE place a verified Google identity becomes an app session,
 * extracted verbatim from /api/auth/google/callback so the native Android
 * entry point (Credential Manager id_token) resolves accounts through the
 * exact same chain as the web OAuth code flow:
 *
 * Account resolution (no duplicates, ever):
 *   a. AuthIdentity(google, sub) exists → login that user
 *   b. verified email matches an existing user  → link identity + login
 *   c. nobody matches                          → auto-create account
 *
 * The caller decides the transport (browser redirect vs JSON) — verification
 * (JWKS) happens BEFORE this runs, in verifyGoogleIdToken.
 */

export interface GoogleLoginSuccess {
  ok: true;
  /** Exact payload setSessionCookie signs into the `session` JWT. */
  sessionPayload: { userId: string; username: string; email: string; role: string };
  /** Avatar for instant client-side display (refreshed from /api/auth/me). */
  avatar: string | null;
  /** 4b: existing email account was linked to this Google identity. */
  linked: boolean;
  /** 4c: a new account was created. */
  created: boolean;
}

export interface GoogleLoginFailure {
  ok: false;
  code: "maintenance" | "account_missing" | "blocked" | "google_failed";
}

export type GoogleLoginResult = GoogleLoginSuccess | GoogleLoginFailure;

export async function resolveGoogleLogin(
  identity: GoogleIdentity
): Promise<GoogleLoginResult> {
  // Maintenance mode gate (same as email login)
  try {
    const maintenanceFlag = await database.findFeatureFlagByKey("maintenance_mode");
    if (maintenanceFlag?.enabled) return { ok: false, code: "maintenance" };
  } catch {
    // DB check failed — don't block auth on a flaky flag read
  }

  // 4a. Existing linked identity → login
  const linkedIdentity = await database.findAuthIdentity("google", identity.sub);
  if (linkedIdentity) {
    const user = await database.findUserById(linkedIdentity.userId);
    if (!user) return { ok: false, code: "account_missing" };
    if (user.blocked) return { ok: false, code: "blocked" };

    // Refresh provider email/avatar on the identity row (profile upkeep)
    await database.createAuthIdentity({
      userId: user.id,
      provider: "google",
      providerUserId: identity.sub,
      providerEmail: identity.email,
      providerUsername: null,
    }).catch(() => {});

    const role = await ensureOwnerAdminRole(user);
    return {
      ok: true,
      sessionPayload: { userId: user.id, username: user.username, email: user.email, role },
      avatar: user.avatar || null,
      linked: false,
      created: false,
    };
  }

  // 4b. Verified email matches an existing account → secure auto-link
  if (identity.email && identity.emailVerified) {
    const existing = await database.findUserByEmail(identity.email);
    if (existing) {
      if (existing.blocked) return { ok: false, code: "blocked" };

      // Link Google identity to the existing account (no duplicate user)
      await database.createAuthIdentity({
        userId: existing.id,
        provider: "google",
        providerUserId: identity.sub,
        providerEmail: identity.email,
        providerUsername: null,
      });

      // Google has verified this email → confirm the account
      const updates: Record<string, unknown> = {};
      if (!existing.confirmed) updates.confirmed = true;
      if (!existing.avatar && identity.picture) updates.avatar = identity.picture;
      if (Object.keys(updates).length > 0) {
        await database.updateUser(existing.id, updates);
      }

      const role = await ensureOwnerAdminRole(existing);
      return {
        ok: true,
        sessionPayload: { userId: existing.id, username: existing.username, email: existing.email, role },
        avatar: existing.avatar || null,
        linked: true,
        created: false,
      };
    }
    // Email exists in Google but is NOT verified there — never link by
    // unverified email; refuse rather than risk a takeover.
    // (Practically never happens with consumer Google accounts.)
  }

  // 4c. No matching account → auto-create
  const email = identity.email && identity.emailVerified
    ? identity.email
    : `google_${identity.sub}@mqplayer.google`;

  const username = await deriveUniqueUsername(
    identity.email?.split("@")[0] || identity.name,
    async (candidate) => !!(await database.findUserByUsername(candidate))
  );

  const hashedPassword = await bcrypt.hash(generateRandomPassword(), 10);

  const user = await database.createUser({
    username,
    email,
    password: hashedPassword,
    confirmed: true, // email verified by Google
    avatar: identity.picture || "",
  });

  await database.createAuthIdentity({
    userId: user.id,
    provider: "google",
    providerUserId: identity.sub,
    providerEmail: identity.email,
    providerUsername: null,
  });

  const role = await ensureOwnerAdminRole(user);
  return {
    ok: true,
    sessionPayload: { userId: user.id, username: user.username, email: user.email, role },
    avatar: user.avatar || null,
    linked: false,
    created: true,
  };
}
