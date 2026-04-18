import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email и код обязательны" },
        { status: 400 }
      );
    }

    // Find unused, non-expired code matching email + code
    const verificationCode = await db.verificationCode.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!verificationCode) {
      return NextResponse.json(
        { error: "Неверный код или срок действия истёк" },
        { status: 400 }
      );
    }

    // Mark code as used
    await db.verificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true },
    });

    // Find user and confirm
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Update user.confirmed = true
    await db.user.update({
      where: { id: user.id },
      data: { confirmed: true },
    });

    return NextResponse.json({
      message: "Email успешно подтверждён",
      userId: user.id,
      username: user.username,
    });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json(
      { error: "Ошибка при проверке кода" },
      { status: 500 }
    );
  }
}
