import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, confirmed: true, blocked: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      confirmed: user.confirmed,
      blocked: user.blocked,
    });
  } catch (error) {
    console.error("Admin auth check error:", error);
    return NextResponse.json({ error: "Ошибка проверки прав" }, { status: 500 });
  }
}
