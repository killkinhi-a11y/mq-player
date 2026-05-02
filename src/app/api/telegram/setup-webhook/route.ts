import { NextRequest, NextResponse } from "next/server";
import { setWebhook, getBotInfo, isTelegramConfigured } from "@/lib/telegram";

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
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN не задан в переменных окружения" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    // Use provided webhook URL or construct from the request
    const webhookUrl =
      body.webhookUrl ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}/api/telegram/webhook`;

    // Set the webhook
    const success = await setWebhook(webhookUrl);

    // Get bot info for diagnostics
    const botInfo = await getBotInfo();

    return NextResponse.json({
      ok: success,
      webhookUrl,
      botInfo,
    });
  } catch (error: any) {
    console.error("[TELEGRAM SETUP] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Ошибка настройки webhook" },
      { status: 500 }
    );
  }
}
