import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

async function handler(req: NextRequest) {
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

    // Find user first (before marking code used) — so we can do both atomically
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    if (user.blocked) {
      return NextResponse.json(
        { error: "Аккаунт заблокирован" },
        { status: 403 }
      );
    }

    // Mark code as used AND confirm user atomically in a transaction
    await db.$transaction([
      db.verificationCode.update({
        where: { id: verificationCode.id },
        data: { used: true },
      }),
      db.user.update({
        where: { id: user.id },
        data: { confirmed: true },
      }),
    ]);

    // Issue JWT session token — auto-login after confirmation
    const token = await signToken({ userId: user.id, username: user.username, role: user.role });

    const response = NextResponse.json({
      message: "Email успешно подтверждён",
      userId: user.id,
      username: user.username,
      role: user.role,
      avatar: user.avatar || null,
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
    console.error("Verify code error:", error);
    return NextResponse.json(
      { error: "Ошибка при проверке кода" },
      { status: 500 }
    );
  }
}
export const POST = withRateLimit(RATE_LIMITS.auth, handler);
