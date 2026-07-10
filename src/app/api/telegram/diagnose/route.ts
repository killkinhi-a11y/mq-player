import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database, ensureTursoSchema, tursoQuery } from "@/lib/database";
import { sendTelegramMessage, isTelegramConfigured, getBotInfo, getWebhookInfo } from "@/lib/telegram";

/**
 * GET /api/telegram/diagnose
 *
 * Full diagnostic: checks env vars, bot connection, DB connection,
 * TelegramAuthCode table, and user count.
 */
export async function GET(_req: NextRequest) {
  const results: Record<string, any> = {};

  // 1. Environment variables
  results.env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? `set (${process.env.TELEGRAM_BOT_TOKEN.slice(0, 8)}...)` : "NOT SET",
    TELEGRAM_BOT_NAME: process.env.TELEGRAM_BOT_NAME || "NOT SET",
    DATABASE_URL: process.env.DATABASE_URL ? `set (${process.env.DATABASE_URL.slice(0, 20)}...)` : "NOT SET",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? `set (${process.env.TURSO_DATABASE_URL.slice(0, 20)}...)` : "NOT SET",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? "set" : "NOT SET",
  };

  results.configured = isTelegramConfigured();
  results.usingTurso = isTurso();

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

  // 3.5. Ensure schema exists (auto-init)
  if (isTurso()) {
    try {
      await ensureTursoSchema();
      results.schemaInit = "ok";
    } catch (e: any) {
      results.schemaInit = { error: e.message };
    }
  }

  // 4. Database — check if TelegramAuthCode table exists
  try {
    let count: number;
    if (isTurso()) {
      const result = await tursoQuery(async () => {
        const t = getTursoClient();
        return await t.execute("SELECT COUNT(*) as c FROM TelegramAuthCode");
      });
      count = Number(result.rows[0]?.c ?? 0);
    } else {
      const { db } = await import("@/lib/db");
      count = await db.telegramAuthCode.count();
    }
    results.db = {
      ok: true,
      telegramAuthCodes: count,
      tableExists: true,
      backend: isTurso() ? "turso" : "prisma",
    };
  } catch (e: any) {
    results.db = {
      ok: false,
      error: e.message,
      backend: isTurso() ? "turso" : "prisma",
    };
  }

  // 5. Users count
  try {
    const userCount = await database.countUsers();
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
      "🧪 Тестовое сообщение из mq — бот работает!"
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
