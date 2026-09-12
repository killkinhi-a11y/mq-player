import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/oauth";
import { isTelegramConfigured, getBotName } from "@/lib/telegram";
import { isEmailConfigured } from "@/lib/email";

/**
 * GET /api/auth/providers — auth availability probe for the login screen.
 *
 * Tells the frontend which login methods are actually configured WITHOUT
 * exposing any secrets: only booleans + the public bot username (which the
 * official Telegram Login Widget requires client-side anyway).
 */
export async function GET() {
  try {
    const telegramBot = isTelegramConfigured();
    const botName = getBotName();

    return NextResponse.json({
      google: isGoogleConfigured(),
      // Widget needs BOTH the bot token (server-side hash verification)
      // and the bot username (rendered into the widget)
      telegramWidget: telegramBot && !!botName,
      telegramBot, // bot-code fallback flow
      telegramBotName: botName || null,
      email: true, // email+password login always available
      emailDelivery: isEmailConfigured(), // whether codes/emails actually send
    });
  } catch {
    return NextResponse.json(
      {
        google: false,
        telegramWidget: false,
        telegramBot: false,
        telegramBotName: null,
        email: true,
        emailDelivery: false,
      },
      { status: 200 }
    );
  }
}
