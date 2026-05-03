import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage, handleCallbackQuery, setSiteOrigin } from "@/lib/telegram-bot";

/**
 * Telegram Webhook endpoint.
 *
 * Handles both messages and callback_query (inline keyboard presses).
 * Delegates to telegram-bot.ts for all command/state logic.
 *
 * Uses Node.js runtime (Prisma requires it).
 * To reduce cold starts, Vercel keeps the function warm after first invocation.
 */
export async function POST(req: NextRequest) {
  try {
    // Set site origin from the incoming request so the bot can build correct URLs
    const origin = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    if (origin) {
      setSiteOrigin(`${protocol}://${origin}`);
    }

    const body = await req.json();

    // Handle callback query (inline keyboard button press)
    if (body.callback_query) {
      // Fire and forget — always respond 200 to Telegram
      handleCallbackQuery(body).catch((err) =>
        console.error("[TELEGRAM WEBHOOK] callback_query error:", err)
      );
      return NextResponse.json({ ok: true });
    }

    // Handle message
    if (body.message) {
      // Fire and forget — always respond 200 to Telegram
      handleTelegramMessage(body).catch((err) =>
        console.error("[TELEGRAM WEBHOOK] message error:", err)
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
    timestamp: new Date().toISOString(),
  });
}
