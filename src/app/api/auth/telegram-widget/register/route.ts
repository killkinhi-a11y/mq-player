import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { setSessionCookie } from "@/lib/auth";
import { ensureOwnerAdminRole } from "@/lib/admin-grant";
import { verifyPendingIdentity, generateRandomPassword } from "@/lib/oauth";
import bcrypt from "bcryptjs";
import { validateContentType } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/auth/telegram-widget/register  { token, username, password? }
 *
 * Completes Telegram Login Widget registration. The Telegram identity lives
 * inside the server-signed pending-identity token (verified here) — the
 * client can choose a username but can never forge who it is on Telegram.
 *
 * - username free          → create account (auto-verified, auto-login)
 * - username taken, no TG  → password required → verify → LINK identity to
 *                            that account (same linking rule as bot flow)
 * - username taken + TG    → 409, already linked to another Telegram
 */
async function handler(req: NextRequest) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { token, username, password } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Недействительная сессия авторизации. Повторите вход через Telegram." }, { status: 400 });
    }

    // Verify the pending identity — Telegram data comes from here, not the client
    const pending = await verifyPendingIdentity(token);
    if (!pending) {
      return NextResponse.json({ error: "Время авторизации истекло. Повторите вход через Telegram." }, { status: 400 });
    }

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Введите имя пользователя" }, { status: 400 });
    }

    // Same validation rules as register / telegram-verify
    const cleanUsername = username.trim().replace(/^@/, "");
    const usernameRegex = /^[a-zA-Z0-9_-]{2,20}$/;
    if (!usernameRegex.test(cleanUsername)) {
      return NextResponse.json(
        { error: "Имя может содержать только буквы, цифры, _ и - (2-20 символов)" },
        { status: 400 }
      );
    }
    const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
    if (reserved.includes(cleanUsername.toLowerCase())) {
      return NextResponse.json({ error: "Это имя зарезервировано" }, { status: 400 });
    }

    const providerUserId = pending.providerUserId;

    // Guard: this Telegram identity must not already be linked
    const existingIdentity = await database.findAuthIdentity("telegram", providerUserId);
    const legacyLinked = await database.findUserByTelegramChatId(providerUserId);
    if (existingIdentity || legacyLinked) {
      return NextResponse.json(
        { error: "Этот Telegram уже привязан к аккаунту. Войдите через Telegram." },
        { status: 409 }
      );
    }

    const existingUsername = await database.findUserByUsername(cleanUsername);

    if (existingUsername) {
      // Account exists under this name — offer secure linking with password
      if (existingUsername.telegramChatId) {
        return NextResponse.json(
          { error: "Пользователь с таким именем уже привязан к другому Telegram" },
          { status: 409 }
        );
      }
      if (existingUsername.blocked) {
        return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
      }

      if (!password) {
        const emailParts = existingUsername.email.split("@");
        const maskedEmail =
          emailParts.length === 2
            ? `${emailParts[0][0]}${"*".repeat(Math.max(emailParts[0].length - 1, 1))}@${emailParts[1]}`
            : "****";
        return NextResponse.json({
          needsPassword: true,
          maskedEmail,
          username: existingUsername.username,
        });
      }

      const passwordValid = await bcrypt.compare(String(password), existingUsername.password);
      if (!passwordValid) {
        return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
      }

      // Link Telegram identity to the existing account
      await database.updateUser(existingUsername.id, {
        telegramChatId: providerUserId,
        telegramUsername: pending.username ?? null,
        confirmed: true,
        ...(existingUsername.avatar ? {} : { avatar: pending.photoUrl || "" }),
      });
      await database.createAuthIdentity({
        userId: existingUsername.id,
        provider: "telegram",
        providerUserId,
        providerEmail: null,
        providerUsername: pending.username ?? null,
      });

      const updated = await database.findUserById(existingUsername.id);
      const role = await ensureOwnerAdminRole(updated!);
      const response = NextResponse.json({
        message: "Telegram привязан к аккаунту!",
        userId: updated!.id,
        username: updated!.username,
        role,
        avatar: updated!.avatar || null,
        telegramUsername: updated!.telegramUsername || pending.username || null,
        linked: true,
      });
      return setSessionCookie(response, {
        userId: updated!.id,
        username: updated!.username,
        email: updated!.email,
        role,
      });
    }

    // Create a brand-new account (verified via Telegram)
    const placeholderEmail = `tg_${providerUserId}@mqplayer.telegram`;
    const hashedPassword = await bcrypt.hash(generateRandomPassword(), 10);

    const user = await database.createUser({
      username: cleanUsername,
      email: placeholderEmail,
      password: hashedPassword,
      confirmed: true,
      telegramChatId: providerUserId,
      telegramUsername: pending.username ?? null,
      avatar: pending.photoUrl || "",
    });

    await database.createAuthIdentity({
      userId: user.id,
      provider: "telegram",
      providerUserId,
      providerEmail: null,
      providerUsername: pending.username ?? null,
    });

    const role = await ensureOwnerAdminRole(user);
    const response = NextResponse.json({
      message: "Аккаунт создан!",
      userId: user.id,
      username: user.username,
      role,
      avatar: user.avatar || null,
      telegramUsername: user.telegramUsername || pending.username || null,
      isNewUser: true,
    });
    return setSessionCookie(response, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role,
    });
  } catch (error) {
    console.error("Telegram widget register error:", error);
    return NextResponse.json({ error: "Ошибка при создании аккаунта" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.auth, handler);
