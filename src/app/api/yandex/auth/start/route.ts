/**
 * POST /api/yandex/auth/start — begin Yandex OAuth Device Flow.
 *
 * Returns ONLY the screen data (user_code + verification URL). The
 * device_code — which can be exchanged for a token — is stored server-side
 * encrypted (AES-256-GCM) and never sent to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { adapterDeviceStart } from "@/lib/yandex/adapter";
import { encryptSecret } from "@/lib/yandex/token-crypto";
import { startAuthSession } from "@/lib/yandex/store";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function postHandler(
  _req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    const started = await adapterDeviceStart("MQ Player — импорт плейлистов");
    const expiresAt = new Date(Date.now() + started.expiresIn * 1000).toISOString();
    await startAuthSession(ctx.userId, {
      deviceCodeEnc: encryptSecret(started.deviceCode),
      userCode: started.userCode,
      verificationUrl: started.verificationUrl,
      expiresAt,
    });
    return NextResponse.json({
      userCode: started.userCode,
      verificationUrl: started.verificationUrl,
      expiresIn: started.expiresIn,
      interval: started.interval,
    });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
