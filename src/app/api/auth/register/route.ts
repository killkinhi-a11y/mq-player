import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Все поля обязательны" },
        { status: 400 }
      );
    }

    // Username: only allow alphanumeric, underscore, hyphen, Russian letters; 2-20 chars
    const usernameRegex = /^[a-zA-Z0-9а-яА-Я_-]{2,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: "Имя пользователя может содержать только буквы (в т.ч. русские), цифры, _ и -. От 2 до 20 символов" },
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
    try {
      await sendVerificationEmail(email, code);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }

    return NextResponse.json(
      {
        message: "Регистрация успешна! Добро пожаловать в MQ Player.",
        userId: user.id,
        email: user.email,
        emailSent: true,
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
