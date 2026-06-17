import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username") || "";
    const excludeId = searchParams.get("excludeId") || "";

    if (!username || username.length < 2) {
      return NextResponse.json({ available: false, error: "Имя должно быть не менее 2 символов" });
    }
    if (username.length > 20) {
      return NextResponse.json({ available: false, error: "Максимум 20 символов" });
    }
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ available: false, error: "Только буквы, цифры, _ и -" });
    }
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(username.toLowerCase())) {
      return NextResponse.json({ available: false, error: "Это имя зарезервировано" });
    }

    // Check uniqueness
    if (isTurso()) {
      const t = getTursoClient();
      const result = excludeId
        ? await t.execute({
            sql: "SELECT id FROM User WHERE username = ? AND id != ? LIMIT 1",
            args: [username, excludeId],
          })
        : await t.execute({
            sql: "SELECT id FROM User WHERE username = ? LIMIT 1",
            args: [username],
          });
      if (result.rows.length > 0) {
        return NextResponse.json({ available: false, error: "Это имя уже занято" });
      }
      return NextResponse.json({ available: true });
    }

    const { db } = await import("@/lib/db");
    const where: Record<string, unknown> = { username };
    if (excludeId) where.id = { not: excludeId };
    const existing = await db.user.findFirst({ where });
    if (existing) {
      return NextResponse.json({ available: false, error: "Это имя уже занято" });
    }
    return NextResponse.json({ available: true });
  } catch (error) {
    console.error("Username check error:", error);
    return NextResponse.json({ available: false, error: "Ошибка проверки" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.auth, handler);
