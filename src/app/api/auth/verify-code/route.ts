import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";

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

    // Find user (before marking code used) — so we can do both atomically
    const user = await database.findUserByEmail(email);

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

    // Mark code as used AND confirm user
    await database.markVerificationCodeUsed(verificationCode.id);
    await database.updateUser(user.id, { confirmed: true });

    // Owner bootstrap before issuing the JWT (role is embedded in the token)
    const role = await ensureOwnerAdminRole(user);

    // Issue JWT session token — auto-login after confirmation
    const token = await signToken({ userId: user.id, username: user.username, role });

    const response = NextResponse.json({
      message: "Email успешно подтверждён",
      userId: user.id,
      username: user.username,
      role,
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
