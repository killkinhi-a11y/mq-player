import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail, isEmailConfigured } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit: 3 registrations per minute per IP
    const { success, resetIn } = rateLimit({
      ip,
      limit: 3,
      window: 60,
      key: "register",
    });

    if (!success) {
      return NextResponse.json(
        { error: "Слишком много попыток регистрации. Попробуйте позже.", retryAfter: resetIn },
        { status: 429, headers: { "X-RateLimit-Reset": String(resetIn) } }
      );
    }

    // Check maintenance mode
    try {
      const maintenanceFlag = await db.featureFlag.findUnique({
        where: { key: "maintenance_mode" },
      });
      if (maintenanceFlag?.enabled) {
        return NextResponse.json(
          { error: "Проводятся технические работы. Регистрация временно недоступна." },
          { status: 503 }
        );
      }
    } catch {
      // Don't block registration if maintenance check fails
    }

    const { username, email, password } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Все поля обязательны" },
        { status: 400 }
      );
    }

    // Username: only allow alphanumeric, underscore, hyphen; 2-20 chars
    const usernameRegex = /^[a-zA-Z0-9_-]{2,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: "Имя пользователя может содержать только буквы, цифры, _ и -. От 2 до 20 символов" },
        { status: 400 }
      );
    }

    // Reserved names
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(username.toLowerCase())) {
      return NextResponse.json(
        { error: "Это имя зарезервировано" },
        { status: 400 }
      );
    }

    if (username.length < 2) {
      return NextResponse.json(
        { error: "Имя пользователя должно быть не менее 2 символов" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
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

    // Check username uniqueness
    const existingUsername = await db.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json(
        { error: "Пользователь с таким именем уже занят" },
        { status: 409 }
      );
    }

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с такой почтой уже существует" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        confirmed: false,
      },
    });

    // Generate verification code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.verificationCode.create({
      data: {
        email,
        code,
        userId: user.id,
        expiresAt,
      },
    });

    // Send verification email
    let emailSent = false;
    const emailConfigured = isEmailConfigured();
    try {
      const result = await sendVerificationEmail(email, code);
      emailSent = !(result as any).mock;
    } catch (emailError: any) {
      console.error("Failed to send verification email:", emailError?.message || emailError);
    }

    return NextResponse.json(
      {
        message: "Регистрация успешна! Добро пожаловать в MQ Player.",
        userId: user.id,
        email: user.email,
        emailSent,
        emailConfigured,
        // In dev mode without email configured, include the code so dev can test
        ...(process.env.NODE_ENV === 'development' && !emailConfigured ? { devCode: code } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Ошибка при регистрации" },
      { status: 500 }
    );
  }
}
