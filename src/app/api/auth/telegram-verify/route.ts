import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/auth/telegram-verify
 *
 * Verifies a 6-digit code that was sent via Telegram.
 * - If a user with the telegramChatId exists → logs them in
 * - If no user exists → returns isNewUser: true so the frontend can ask for a username
 * - If username is provided → creates a new account
 */
async function handler(req: NextRequest) {
  try {
    const { code, username, password } = await req.json();

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: "Введите 6-значный код" },
        { status: 400 }
      );
    }

    // Find the unused, non-expired code
    const telegramCode = await db.telegramAuthCode.findFirst({
      where: {
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!telegramCode) {
      return NextResponse.json(
        { error: "Неверный код или срок действия истёк" },
        { status: 400 }
      );
    }

    // Check if a user with this telegramChatId already exists
    const existingUser = await db.user.findUnique({
      where: { telegramChatId: telegramCode.chatId },
    });

    // If username is provided → this is a registration for a new user
    if (username) {
      // Don't allow registration if user already exists with this telegram
      if (existingUser) {
        return NextResponse.json(
          { error: "Аккаунт с этим Telegram уже существует" },
          { status: 409 }
        );
      }

      // Validate username
      const usernameRegex = /^[a-zA-Z0-9_-]{2,20}$/;
      if (!usernameRegex.test(username)) {
        return NextResponse.json(
          { error: "Имя может содержать только буквы, цифры, _ и - (2-20 символов)" },
          { status: 400 }
        );
      }

      const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
      if (reserved.includes(username.toLowerCase())) {
        return NextResponse.json(
          { error: "Это имя зарезервировано" },
          { status: 400 }
        );
      }

      // Check if username already exists
      const existingUsername = await db.user.findUnique({ where: { username } });

      // If username exists AND has no telegramChatId → need password to link
      if (existingUsername) {
        if (existingUsername.telegramChatId) {
          return NextResponse.json(
            { error: "Пользователь с таким именем уже привязан к другому Telegram" },
            { status: 409 }
          );
        }

        // If no password provided → ask for it
        if (!password) {
          // Mask the email for display
          const emailParts = existingUsername.email.split("@");
          const maskedEmail = emailParts.length === 2
            ? `${emailParts[0][0]}${"*".repeat(Math.max(emailParts[0].length - 1, 1))}@${emailParts[1]}`
            : "****";

          return NextResponse.json({
            needsPassword: true,
            maskedEmail,
            username: existingUsername.username,
          });
        }

        // Verify password
        const passwordValid = await bcrypt.compare(password, existingUsername.password);
        if (!passwordValid) {
          return NextResponse.json(
            { error: "Неверный пароль" },
            { status: 401 }
          );
        }

        // Link Telegram to existing email-based account
        const user = await db.$transaction(async (tx) => {
          await tx.telegramAuthCode.update({
            where: { id: telegramCode.id },
            data: { used: true },
          });

          return tx.user.update({
            where: { id: existingUsername.id },
            data: {
              telegramChatId: telegramCode.chatId,
              telegramUsername: telegramCode.telegramUsername,
              confirmed: true,
            },
          });
        });

        // Issue JWT — auto-login
        const token = await signToken({
          userId: user.id,
          username: user.username,
          role: user.role,
        });

        const response = NextResponse.json({
          message: "Telegram привязан к аккаунту!",
          userId: user.id,
          username: user.username,
          role: user.role,
          avatar: user.avatar || null,
          isNewUser: false,
          linked: true,
        });

        response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
          httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
          secure: SESSION_COOKIE_OPTIONS.secure,
          sameSite: SESSION_COOKIE_OPTIONS.sameSite,
          maxAge: SESSION_COOKIE_OPTIONS.maxAge,
          path: SESSION_COOKIE_OPTIONS.path,
        });

        return response;
      }

      // No existing user with this username → create new account
      // Create placeholder email (Telegram users don't need real email)
      const placeholderEmail = `tg_${telegramCode.chatId}@mqplayer.telegram`;

      // Generate a random password (user won't use it, but DB requires it)
      const randomPassword = crypto.randomUUID().replace(/-/g, "");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Mark code as used AND create user in a transaction
      const user = await db.$transaction(async (tx) => {
        await tx.telegramAuthCode.update({
          where: { id: telegramCode.id },
          data: { used: true },
        });

        return tx.user.create({
          data: {
            username,
            email: placeholderEmail,
            password: hashedPassword,
            confirmed: true, // Already verified via Telegram
            telegramChatId: telegramCode.chatId,
            telegramUsername: telegramCode.telegramUsername,
          },
        });
      });

      // Issue JWT — auto-login
      const token = await signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      const response = NextResponse.json({
        message: "Аккаунт создан!",
        userId: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null,
        isNewUser: true,
      });

      response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        maxAge: SESSION_COOKIE_OPTIONS.maxAge,
        path: SESSION_COOKIE_OPTIONS.path,
      });

      return response;
    }

    // No username provided → check if this is login (existing user) or registration (new user)
    if (existingUser) {
      // Existing user → log them in
      if (existingUser.blocked) {
        return NextResponse.json(
          { error: "Аккаунт заблокирован" },
          { status: 403 }
        );
      }

      // Mark code as used
      await db.telegramAuthCode.update({
        where: { id: telegramCode.id },
        data: { used: true },
      });

      // Update telegramUsername if changed
      if (telegramCode.telegramUsername && telegramCode.telegramUsername !== existingUser.telegramUsername) {
        await db.user.update({
          where: { id: existingUser.id },
          data: { telegramUsername: telegramCode.telegramUsername },
        });
      }

      // Issue JWT
      const token = await signToken({
        userId: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
      });

      const response = NextResponse.json({
        message: "Вход выполнен!",
        userId: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
        avatar: existingUser.avatar || null,
        isNewUser: false,
      });

      response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        maxAge: SESSION_COOKIE_OPTIONS.maxAge,
        path: SESSION_COOKIE_OPTIONS.path,
      });

      return response;
    }

    // No existing user → tell frontend this is a new user that needs registration
    return NextResponse.json({
      isNewUser: true,
      message: "Новый пользователь — нужно создать аккаунт",
      telegramUsername: telegramCode.telegramUsername,
      // Don't mark code as used yet — wait for the registration request with username
    });

  } catch (error) {
    console.error("Telegram verify error:", error);
    return NextResponse.json(
      { error: "Ошибка при проверке кода" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(RATE_LIMITS.auth, handler);
