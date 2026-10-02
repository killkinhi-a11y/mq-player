/**
 * GET    /api/yandex/account — connection status (login/display only, no tokens).
 * DELETE /api/yandex/account — disconnect: wipes the stored encrypted tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getAccount, deleteAccount } from "@/lib/yandex/store";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function getHandler(
  _req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    const account = await getAccount(ctx.userId);
    if (!account) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({
      connected: true,
      account: {
        login: account.login,
        displayName: account.displayName,
        expiresAt: account.expiresAt,
      },
    });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

async function deleteHandler(
  _req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    await deleteAccount(ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));
