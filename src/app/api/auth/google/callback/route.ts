import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { setSessionCookie } from "@/lib/auth";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";
import bcrypt from "bcryptjs";
import {
  verifyOAuthState,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  deriveUniqueUsername,
  generateRandomPassword,
  getRequestOrigin,
  OAUTH_STATE_COOKIE,
} from "@/lib/oauth";

/**
 * GET /api/auth/google/callback — finish the Google OAuth flow.
 *
 * Full server-side verification chain:
 *   1. state (cookie) === state (query)           — CSRF
 *   2. code → tokens exchange with Google         — server-to-server
 *   3. id_token signature/issuer/audience via JWKS — identity validation
 *
 * Account resolution (no duplicates, ever):
 *   a. AuthIdentity(google, sub) exists → login that user
 *   b. verified email matches an existing user  → link identity + login
 *   c. nobody matches                          → auto-create account
 *
 * Access tokens are NOT stored — only the id_token is used, once, here.
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/play?authError=${code}`, origin));

  try {
    // 1. CSRF state check
    const queryState = req.nextUrl.searchParams.get("state");
    const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!verifyOAuthState(cookieState, queryState)) {
      return fail("invalid_state");
    }
    // Clear the state cookie — single use
    // (One-time state: after this comparison the cookie is worthless, and it
    // expires in 10 minutes regardless. Success paths below return fresh
    // responses; we clear the cookie on them via a helper.)
    const clearState = (res: NextResponse) => {
      res.cookies.delete(OAUTH_STATE_COOKIE);
      return res;
    };

    // User cancelled at the Google consent screen
    if (req.nextUrl.searchParams.get("error") === "access_denied") {
      return fail("google_cancelled");
    }

    // 2. Exchange the code
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return fail("missing_code");

    const tokens = await exchangeGoogleCode(origin, code);
    if (!tokens) return fail("google_exchange_failed");

    // 3. Verify the id_token cryptographically
    const identity = await verifyGoogleIdToken(tokens.id_token);
    if (!identity || !identity.sub) return fail("google_token_invalid");

    // Maintenance mode gate (same as email login)
    try {
      const maintenanceFlag = await database.findFeatureFlagByKey("maintenance_mode");
      if (maintenanceFlag?.enabled) return fail("maintenance");
    } catch {
      // DB check failed — don't block auth on a flaky flag read
    }

    // 4a. Existing linked identity → login
    const linkedIdentity = await database.findAuthIdentity("google", identity.sub);
    if (linkedIdentity) {
      const user = await database.findUserById(linkedIdentity.userId);
      if (!user) return fail("account_missing");
      if (user.blocked) return fail("blocked");

      // Refresh provider email/avatar on the identity row (profile upkeep)
      await database.createAuthIdentity({
        userId: user.id,
        provider: "google",
        providerUserId: identity.sub,
        providerEmail: identity.email,
        providerUsername: null,
      }).catch(() => {});

      const role = await ensureOwnerAdminRole(user);
      const response = NextResponse.redirect(new URL("/play?auth=success&provider=google", origin));
      return clearState(await setSessionCookie(response, {
        userId: user.id,
        username: user.username,
        email: user.email,
        role,
      }));
    }

    // 4b. Verified email matches an existing account → secure auto-link
    if (identity.email && identity.emailVerified) {
      const existing = await database.findUserByEmail(identity.email);
      if (existing) {
        if (existing.blocked) return fail("blocked");

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
        const response = NextResponse.redirect(
          new URL("/play?auth=success&provider=google&linked=1", origin)
        );
        return clearState(await setSessionCookie(response, {
          userId: existing.id,
          username: existing.username,
          email: existing.email,
          role,
        }));
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
    const response = NextResponse.redirect(
      new URL("/play?auth=success&provider=google&created=1", origin)
    );
    return clearState(await setSessionCookie(response, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role,
    }));
  } catch (error) {
    console.error("Google callback error:", error);
    return fail("google_failed");
  }
}
