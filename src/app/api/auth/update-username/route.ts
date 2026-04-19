import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(req: NextRequest) {
  try {
    const { userId, username } = await req.json();

    if (!userId || !username) {
      return NextResponse.json({ error: "Не указаны данные" }, { status: 400 });
    }

    if (username.length < 2) {
      return NextResponse.json({ error: "Имя должно быть не менее 2 символов" }, { status: 400 });
    }

    if (username.length > 20) {
      return NextResponse.json({ error: "Максимум 20 символов" }, { status: 400 });
    }

    // Username rules: only alphanumeric, underscore, hyphen
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ error: "Только буквы, цифры, _ и -" }, { status: 400 });
    }

    // Reserved names
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(username.toLowerCase())) {
      return NextResponse.json({ error: "Это имя зарезервировано" }, { status: 400 });
    }

    // Check uniqueness (exclude current user)
    const existing = await db.user.findFirst({
      where: {
        username,
        id: { not: userId },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Это имя уже занято" }, { status: 409 });
    }

    // Update username
    await db.user.update({
      where: { id: userId },
      data: { username },
    });

    return NextResponse.json({ message: "Имя обновлено", username });
  } catch (error) {
    console.error("Username update error:", error);
    return NextResponse.json({ error: "Ошибка обновления имени" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.auth, handler);
