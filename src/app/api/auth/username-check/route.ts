import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
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

    // Username rules: only alphanumeric, underscore, hyphen
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ available: false, error: "Только буквы, цифры, _ и -" });
    }

    // Reserved names
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(username.toLowerCase())) {
      return NextResponse.json({ available: false, error: "Это имя зарезервировано" });
    }

    // Check uniqueness
    const where: Record<string, unknown> = { username };
    if (excludeId) {
      where.id = { not: excludeId };
    }

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
