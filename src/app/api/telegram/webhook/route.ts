import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleTelegramMessage, handleCallbackQuery, setSiteOrigin } from "@/lib/telegram-bot";

/**
 * Telegram Webhook endpoint.
 *
 * Security: Validates the X-Telegram-Bot-Api-Secret-Token header
 * to prevent forged webhook requests.
 *
 * Callback queries (button presses) are handled SYNCHRONOUSLY before responding,
 * because Telegram requires the callback to be acknowledged (answerCallbackQuery)
 * within a short window.
 *
 * Regular messages still use `after()` to avoid Telegram timeout on slow operations
 * (search, import, etc.).
 */

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  try {
    // Security: Validate Telegram webhook secret token
    if (WEBHOOK_SECRET) {
      const secret = req.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== WEBHOOK_SECRET) {
        console.warn("[TELEGRAM WEBHOOK] Invalid secret token — rejecting request");
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Set site origin from the incoming request so the bot can build correct URLs
    const origin = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    if (origin) {
      setSiteOrigin(`${protocol}://${origin}`);
    }

    const body = await req.json();

    // Handle callback query (inline keyboard button press) — SYNCHRONOUS
    if (body.callback_query) {
      await handleCallbackQuery(body).catch((err) =>
        console.error("[TELEGRAM WEBHOOK] callback_query error:", err)
      );
      return NextResponse.json({ ok: true });
    }

    // Handle message — use after() for heavy operations
    if (body.message) {
      after(() =>
        handleTelegramMessage(body).catch((err) =>
          console.error("[TELEGRAM WEBHOOK] message error:", err)
        )
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TELEGRAM WEBHOOK] Error:", error);
    return NextResponse.json({ ok: true });
  }
}

// Allow GET for webhook verification (some setups need this)
export async function GET() {
  return NextResponse.json({
    status: "webhook_active",
  });
}
