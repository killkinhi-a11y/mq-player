import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { setSessionCookie } from "@/lib/auth";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";
import { verifyTelegramLoginHash } from "@/lib/telegram";
import { signPendingIdentity, getRequestOrigin } from "@/lib/oauth";

/**
 * GET /api/auth/telegram-widget/callback
 *
 * The official Telegram Login Widget redirects the browser here with the
 * authorization data as query params (id, first_name, last_name, username,
 * photo_url, auth_date, hash). The payload crossed the browser, so NOTHING
 * is trusted until the hash verifies server-side against our bot token
 * (official Telegram algorithm — see lib/telegram.ts).
 *
 * Account resolution:
 *   a. AuthIdentity(telegram, id) exists       → login (profile refresh)
 *   b. legacy User.telegramChatId == id        → login + backfill identity
 *   c. new Telegram user                       → short-lived server-signed
 *      pending-identity token → username selection screen (the token, not
 *      client data, is the source of truth for the provider identity)
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/play?authError=${code}`, origin));

  try {
    // Collect the widget params (only known fields, string values)
    const params: Record<string, string> = {};
    for (const key of ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]) {
      const value = req.nextUrl.searchParams.get(key);
      if (value !== null && value !== "") params[key] = value;
    }

    const payload = verifyTelegramLoginHash(params);
    if (!payload) return fail("telegram_hash_invalid");

    const providerUserId = String(payload.id);

    // Maintenance gate
    try {
      const maintenanceFlag = await database.findFeatureFlagByKey("maintenance_mode");
      if (maintenanceFlag?.enabled) return fail("maintenance");
    } catch {
      // Flag read failed — don't block auth
    }

    // a. Linked via AuthIdentity
    const identity = await database.findAuthIdentity("telegram", providerUserId);
    if (identity) {
      const user = await database.findUserById(identity.userId);
      if (!user) return fail("account_missing");
      if (user.blocked) return fail("blocked");

      // Keep handle + avatar fresh (only fill avatar, never overwrite custom)
      const updates: Record<string, unknown> = {};
      if (payload.username && payload.username !== user.telegramUsername) {
        updates.telegramUsername = payload.username;
      }
      if (!user.avatar && payload.photo_url) updates.avatar = payload.photo_url;
      if (Object.keys(updates).length > 0) await database.updateUser(user.id, updates);

      const role = await ensureOwnerAdminRole(user);
      const response = NextResponse.redirect(
        new URL("/play?auth=success&provider=telegram", origin)
      );
      return setSessionCookie(response, {
        userId: user.id,
        username: user.username,
        email: user.email,
        role,
      });
    }

    // b. Legacy bot-flow account (User.telegramChatId) — same Telegram user id
    const legacyUser = await database.findUserByTelegramChatId(providerUserId);
    if (legacyUser) {
      if (legacyUser.blocked) return fail("blocked");

      // Backfill the identity row so future logins hit path (a)
      await database.createAuthIdentity({
        userId: legacyUser.id,
        provider: "telegram",
        providerUserId,
        providerEmail: null,
        providerUsername: payload.username ?? null,
      }).catch(() => {});

      const updates: Record<string, unknown> = {};
      if (payload.username && payload.username !== legacyUser.telegramUsername) {
        updates.telegramUsername = payload.username;
      }
      if (!legacyUser.avatar && payload.photo_url) updates.avatar = payload.photo_url;
      if (Object.keys(updates).length > 0) await database.updateUser(legacyUser.id, updates);

      const role = await ensureOwnerAdminRole(legacyUser);
      const response = NextResponse.redirect(
        new URL("/play?auth=success&provider=telegram", origin)
      );
      return setSessionCookie(response, {
        userId: legacyUser.id,
        username: legacyUser.username,
        email: legacyUser.email,
        role,
      });
    }

    // c. New user → server-signed pending identity → username selection
    const token = await signPendingIdentity({
      kind: "telegram-widget",
      providerUserId,
      username: payload.username ?? null,
      firstName: payload.first_name ?? null,
      lastName: payload.last_name ?? null,
      photoUrl: payload.photo_url ?? null,
    });

    return NextResponse.redirect(
      new URL(`/play?authStep=telegram-widget-register&token=${encodeURIComponent(token)}`, origin)
    );
  } catch (error) {
    console.error("Telegram widget callback error:", error);
    return fail("telegram_failed");
  }
}
