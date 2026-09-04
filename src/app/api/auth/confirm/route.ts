import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";

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

    const user = await database.findUserByEmail(email);
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

    const verificationCode = await database.findVerificationCode({
      email,
      code,
      used: false,
      expiresAfter: new Date(),
    });

    if (!verificationCode) {
      return NextResponse.json(
        { error: "Неверный код или срок действия истёк" },
        { status: 400 }
      );
    }

    if (user.blocked) {
      return NextResponse.json(
        { error: "Аккаунт заблокирован" },
        { status: 403 }
      );
    }

    // Mark code as used AND confirm user
    await database.markVerificationCodeUsed(verificationCode.id);
    await database.updateUser(user.id, { confirmed: true });

    // Issue JWT session token — auto-login after confirmation
    // Owner bootstrap before issuing the JWT + fix: role claim was missing here
    const role = await ensureOwnerAdminRole(user);

    const token = await signToken({ userId: user.id, username: user.username, role });

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
