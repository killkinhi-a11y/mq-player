import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

/**
 * GET /api/telegram/webapp-debug
 *
 * Diagnostic endpoint — returns bot config for debugging Mini App auth.
 * No sensitive data is exposed.
 */
export async function GET(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const hasToken = !!botToken;
  const botName = process.env.TELEGRAM_BOT_NAME || null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("host") || "";

  // Check if TELEGRAM_BOT_TOKEN looks valid (not empty, has colon)
  const tokenValid = hasToken && botToken.includes(":");

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    config: {
      hasBotToken: hasToken,
      tokenValid,
      botName,
      appUrl,
      allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
    },
    testInfo: {
      message: "POST to /api/telegram/webapp-debug with { initData } to validate without creating session",
    },
  });
}

/**
 * POST /api/telegram/webapp-debug
 *
 * Validates initData WITHOUT creating a session — just returns what's
 * wrong. Useful for debugging auth failures from the Mini App.
 */
export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    if (!initData) {
      return NextResponse.json({ ok: false, error: "initData required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN not set on server",
        step: "config",
      });
    }

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      return NextResponse.json({
        ok: false,
        error: "Missing hash in initData",
        step: "parse",
        receivedKeys: Array.from(params.keys()),
      });
    }

    params.delete("hash");
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const hashMatch = computedHash === hash;

    const authDate = parseInt(params.get("auth_date") || "0", 10);
    const ageSec = authDate ? Math.floor(Date.now() / 1000 - authDate) : -1;
    const fresh = ageSec >= 0 && ageSec < 3600;

    const userJson = params.get("user");
    let user: any = null;
    try { if (userJson) user = JSON.parse(userJson); } catch {}

    return NextResponse.json({
      ok: hashMatch && fresh,
      step: hashMatch ? (fresh ? "ok" : "expired") : "hash_mismatch",
      details: {
        hashMatch,
        authDate,
        ageSeconds: ageSec,
        fresh,
        user: user ? {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
        } : null,
        dataCheckStringLength: dataCheckString.length,
        receivedKeys: keys,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || "Unknown error",
      step: "exception",
    }, { status: 500 });
  }
}
