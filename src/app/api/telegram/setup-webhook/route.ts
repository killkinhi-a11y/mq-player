import { NextRequest, NextResponse } from "next/server";
import { setWebhook, getBotInfo, getWebhookInfo, isTelegramConfigured } from "@/lib/telegram";

/**
 * POST /api/telegram/setup-webhook
 *
 * Sets up the Telegram webhook so the bot can receive messages.
 * Call this once after deploying with TELEGRAM_BOT_TOKEN set.
 * Also returns bot info for diagnostics.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isTelegramConfigured()) {
      return NextResponse.json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN не задан",
        configured: false,
      }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));

    // Always use HTTPS — Telegram requires it
    const host = body.webhookUrl
      ? new URL(body.webhookUrl).host
      : req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const webhookUrl = body.webhookUrl || `https://${host}/api/telegram/webhook`;

    // Set the webhook
    const success = await setWebhook(webhookUrl);

    // Get bot info for diagnostics
    const botInfo = await getBotInfo();

    // Verify webhook was set correctly
    const webhookInfo = await getWebhookInfo();

    return NextResponse.json({
      ok: success,
      configured: true,
      webhookUrl,
      botInfo,
      webhookInfo,
    });
  } catch (error: any) {
    console.error("[TELEGRAM SETUP] Error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Ошибка настройки webhook" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/setup-webhook
 *
 * Diagnostic endpoint — returns bot info, webhook status, env vars presence.
 */
export async function GET(req: NextRequest) {
  try {
    const configured = isTelegramConfigured();
    const botInfo = configured ? await getBotInfo() : null;
    const webhookInfo = configured ? await getWebhookInfo() : null;

    return NextResponse.json({
      configured,
      botInfo,
      webhookInfo,
      domain: req.headers.get("x-forwarded-host") || req.headers.get("host") || "unknown",
    });
  } catch (error: any) {
    return NextResponse.json(
      { configured: false, error: error?.message },
      { status: 500 }
    );
  }
}
