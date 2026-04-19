import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

// Legacy confirm endpoint — now requires a verification code
// Kept for backward compatibility but now verifies via code
async function handler(req: NextRequest) {
  try {
    const { email, code } = await req.json();

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
      return NextResponse.json({
        message: "Почта уже подтверждена",
        userId: user.id,
        username: user.username,
      });
    }

    // Code is required — no code = no confirmation
    if (!code) {
      return NextResponse.json(
        { error: "Код подтверждения обязателен" },
        { status: 400 }
      );
    }

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

    await db.verificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true },
    });

    await db.user.update({
      where: { id: user.id },
      data: { confirmed: true },
    });

    // Issue JWT session token — auto-login after confirmation
    const token = await signToken({ userId: user.id, username: user.username });

    const response = NextResponse.json({
      message: "Почта успешно подтверждена!",
      userId: user.id,
      username: user.username,
    });

    response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
      httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
      secure: SESSION_COOKIE_OPTIONS.secure,
      sameSite: SESSION_COOKIE_OPTIONS.sameSite,
      maxAge: SESSION_COOKIE_OPTIONS.maxAge,
      path: SESSION_COOKIE_OPTIONS.path,
    });

    return response;
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json(
      { error: "Ошибка при подтверждении" },
      { status: 500 }
    );
  }
}
export const POST = withRateLimit(RATE_LIMITS.auth, handler);
