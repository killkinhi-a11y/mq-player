import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage, isTelegramConfigured, getBotInfo, getWebhookInfo } from "@/lib/telegram";

/**
 * GET /api/telegram/diagnose
 *
 * Full diagnostic: checks env vars, bot connection, DB connection,
 * TelegramAuthCode table, and user count.
 */
export async function GET(req: NextRequest) {
  const results: Record<string, any> = {};

  // 1. Environment variables
  results.env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? `set (${process.env.TELEGRAM_BOT_TOKEN.slice(0, 8)}...)` : "NOT SET",
    TELEGRAM_BOT_NAME: process.env.TELEGRAM_BOT_NAME || "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL ? `set (${process.env.DATABASE_URL.slice(0, 20)}...)` : "NOT SET",
  };

  results.configured = isTelegramConfigured();

  // 2. Bot info
  try {
    results.botInfo = await getBotInfo();
  } catch (e: any) {
    results.botInfo = { error: e.message };
  }

  // 3. Webhook info
  try {
    results.webhookInfo = await getWebhookInfo();
  } catch (e: any) {
    results.webhookInfo = { error: e.message };
  }

  // 4. Database — check if TelegramAuthCode table exists
  try {
    const count = await db.telegramAuthCode.count();
    results.db = {
      ok: true,
      telegramAuthCodes: count,
      tableExists: true,
    };
  } catch (e: any) {
    results.db = {
      ok: false,
      error: e.message,
      fix: "Миграция не применена! Запусти локально: cd mq-player && npx prisma db push",
    };
  }

  // 5. Users count
  try {
    const userCount = await db.user.count();
    results.users = { count: userCount };
  } catch (e: any) {
    results.users = { error: e.message };
  }

  return NextResponse.json(results);
}

/**
 * POST /api/telegram/diagnose
 *
 * Send a test message to a chat to verify the bot can send messages.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { chatId } = body;

    if (!chatId || !isTelegramConfigured()) {
      return NextResponse.json({
        error: "Укажи chatId и убедись что бот настроен",
        configured: isTelegramConfigured(),
      }, { status: 400 });
    }

    const msgResult = await sendTelegramMessage(
      chatId,
      "🧪 Тестовое сообщение из MQ Player — бот работает!"
    );

    return NextResponse.json({
      ok: msgResult.ok,
      description: msgResult.description,
      chatId,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
