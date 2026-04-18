import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// One-time endpoint to promote a user to admin by email.
// Should be removed after use.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const updated = await db.user.update({
      where: { email },
      data: { role: "admin" },
      select: { id: true, username: true, email: true, role: true },
    });

    return NextResponse.json({
      message: `Пользователь ${updated.username} (${updated.email}) теперь админ`,
      user: updated,
    });
  } catch (error) {
    console.error("Init admin error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
