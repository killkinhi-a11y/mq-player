import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Некорректный адрес электронной почты" },
        { status: 400 }
      );
    }

    // Check user exists
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Пользователь с такой почтой не найден" },
        { status: 404 }
      );
    }

    // Rate limiting: no more than 1 code per minute per email
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCode = await db.verificationCode.findFirst({
      where: {
        email,
        createdAt: { gt: oneMinuteAgo },
      },
    });

    if (recentCode) {
      return NextResponse.json(
        { error: "Слишком частые запросы. Попробуйте через 60 секунд." },
        { status: 429 }
      );
    }

    // Generate crypto-secure 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    // Delete old unused codes for this email
    await db.verificationCode.deleteMany({
      where: { email, used: false },
    });

    // Save new code with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.verificationCode.create({
      data: {
        email,
        code,
        userId: user.id,
        expiresAt,
      },
    });

    // Send email
    await sendVerificationEmail(email, code);

    return NextResponse.json({
      message: "Код отправлен на email",
    });
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке кода" },
      { status: 500 }
    );
  }
}
