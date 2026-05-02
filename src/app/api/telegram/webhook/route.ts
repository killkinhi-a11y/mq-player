import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage, verifyTelegramWebhook } from "@/lib/telegram";
import crypto from "crypto";

/**
 * Telegram Webhook endpoint.
 *
 * Receives messages from the Telegram bot. When a user sends /start or any message,
 * the bot generates a 6-digit verification code, stores it, and sends it back.
 * The user then enters this code on the MQ Player website to authenticate.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify the request is from Telegram (if signature is provided)
    const signature = req.headers.get("x-telegram-bot-api-secret-token");
    // In production, you can also set a secret token in setWebhook and verify it here

    const body = await req.json();

    // Basic structure validation
    if (!body.message) {
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    const chatId = message.chat?.id;
    const from = message.from;

    if (!chatId || !from) {
      return NextResponse.json({ ok: true });
    }

    // Handle /start command
    const text = message.text || "";
    if (text.startsWith("/start")) {
      const welcomeMessage = `🎵 <b>Добро пожаловать в MQ Player!</b>\n\n` +
        `Я отправлю вам код подтверждения для входа.\n` +
        `Введите <b>любое сообщение</b> (или отправьте /code), и я пришлю вам 6-значный код.\n\n` +
        `Затем введите этот код на сайте MQ Player для авторизации.`;

      await sendTelegramMessage(chatId, welcomeMessage, { parseMode: "HTML" });
      return NextResponse.json({ ok: true });
    }

    // Handle /code command explicitly
    if (text.startsWith("/code") || !text.startsWith("/")) {
      // Generate 6-digit code
      const code = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete any existing unused codes for this chat
      await db.telegramAuthCode.deleteMany({
        where: {
          chatId: String(chatId),
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      // Store the new code
      await db.telegramAuthCode.create({
        data: {
          chatId: String(chatId),
          telegramUserId: BigInt(from.id),
          telegramUsername: from.username || null,
          code,
          expiresAt,
        },
      });

      // Send the code back to the user
      const codeMessage = `🔐 <b>Код подтверждения MQ Player:</b>\n\n` +
        `<code>${code}</code>\n\n` +
        `⏱ Код действителен 10 минут.\n` +
        `Введите его на сайте MQ Player для входа или регистрации.`;

      await sendTelegramMessage(chatId, codeMessage, { parseMode: "HTML" });
      return NextResponse.json({ ok: true });
    }

    // Ignore other commands
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[TELEGRAM WEBHOOK] Error:", error);
    // Always return 200 to Telegram to prevent retries
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
