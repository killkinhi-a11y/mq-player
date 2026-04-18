import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    if (user.confirmed) {
      return NextResponse.json(
        { message: "Почта уже подтверждена" },
        { status: 200 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { confirmed: true },
    });

    return NextResponse.json({
      message: "Почта успешно подтверждена!",
      userId: user.id,
      username: user.username,
    });
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json(
      { error: "Ошибка при подтверждении" },
      { status: 500 }
    );
  }
}
