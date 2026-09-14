import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/oauth";
import { isTelegramConfigured, getBotName } from "@/lib/telegram";
import { isEmailConfigured } from "@/lib/email";

/**
 * GET /api/auth/providers — auth availability probe for the login screen.
 *
 * Tells the frontend which login methods are actually configured WITHOUT
 * exposing any secrets: only booleans + the public bot username (which the
 * official Telegram Login Widget requires client-side anyway) + the PUBLIC
 * Google OAuth web client id (required by Android Credential Manager's
 * GetGoogleIdOption; it is public by design — the client SECRET stays
 * server-side and is only used in the code exchange).
 */
export async function GET() {
  try {
    const telegramBot = isTelegramConfigured();
    const botName = getBotName();

    return NextResponse.json({
      google: isGoogleConfigured(),
      // Android native login (Credential Manager) needs the server client id;
      // web clients ignore this field.
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
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
        googleClientId: null,
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
