import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit: 10 login attempts per minute per IP
    const { success, remaining, resetIn } = rateLimit({
      ip,
      limit: 10,
      window: 60,
      key: "login",
    });

    if (!success) {
      return NextResponse.json(
        { error: "Слишком много попыток входа. Попробуйте позже.", retryAfter: resetIn },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(resetIn),
          },
        }
      );
    }

    // Check maintenance mode
    try {
      const maintenanceFlag = await db.featureFlag.findUnique({
        where: { key: "maintenance_mode" },
      });
      if (maintenanceFlag?.enabled) {
        return NextResponse.json(
          { error: "Проводятся технические работы. Вход временно недоступен." },
          { status: 503 }
        );
      }
    } catch {
      // Don't block login if DB is down for maintenance check
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 401 }
      );
    }

    if (!user.confirmed) {
      return NextResponse.json(
        { error: "Подтвердите вашу почту перед входом" },
        { status: 403 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Неверный пароль" },
        { status: 401 }
      );
    }

    // Issue JWT session token in httpOnly cookie
    const token = await signToken({ userId: user.id, username: user.username, email: user.email, role: user.role });

    const response = NextResponse.json({
      message: "Вход выполнен успешно",
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar || null,
      theme: user.theme,
      accent: user.accent,
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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Ошибка при входе" },
      { status: 500 }
    );
  }
}
