/**
 * POST /api/yandex/auth/poll — poll the pending Device Flow session.
 *
 * Responses (NO tokens ever leave this route):
 *   { status: "pending" }                              — user hasn't confirmed yet
 *   { status: "expired" }                              — code expired, restart
 *   { status: "ok", account: {login, displayName} }    — connected; tokens
 *                                                        encrypted at rest
 *   401 no_yandex_account / yandex_unauthorized etc.   — structured errors
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { adapterDevicePoll, adapterAccount } from "@/lib/yandex/adapter";
import { encryptSecret, tryDecryptSecret } from "@/lib/yandex/token-crypto";
import { getActiveAuthSession, finishAuthSession, upsertAccount } from "@/lib/yandex/store";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function postHandler(
  _req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    const session = await getActiveAuthSession(ctx.userId);
    if (!session) {
      return NextResponse.json({ status: "expired" });
    }
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      await finishAuthSession(session.id);
      return NextResponse.json({ status: "expired" });
    }
    const deviceCode = tryDecryptSecret(session.deviceCodeEnc);
    if (!deviceCode) {
      await finishAuthSession(session.id);
      return NextResponse.json({ status: "expired" });
    }

    const poll = await adapterDevicePoll(deviceCode);
    if (poll.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }

    // Authorized — fetch account info, then persist ENCRYPTED tokens.
    const account = await adapterAccount(poll.accessToken).catch(() => null);
    const expiresAt = new Date(Date.now() + (poll.expiresIn || 31536000) * 1000).toISOString();
    await upsertAccount(ctx.userId, {
      yandexUid: account?.uid != null ? String(account.uid) : null,
      login: account?.login ?? null,
      displayName: account?.displayName ?? account?.login ?? null,
      accessTokenEnc: encryptSecret(poll.accessToken),
      refreshTokenEnc: poll.refreshToken ? encryptSecret(poll.refreshToken) : null,
      expiresAt,
    });
    await finishAuthSession(session.id);

    return NextResponse.json({
      status: "ok",
      account: {
        login: account?.login ?? null,
        displayName: account?.displayName ?? account?.login ?? null,
      },
    });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.auth, withAuth(postHandler));
