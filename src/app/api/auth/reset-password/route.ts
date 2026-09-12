import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateContentType } from "@/lib/withAuth";

/**
 * POST /api/auth/reset-password  { email, code, newPassword }
 *
 * Completes the password-reset flow started by /api/auth/send-code:
 *   1. rate-limited per IP (brute force on the 6-digit code)
 *   2. the code must be a valid, unused, unexpired VerificationCode row
 *   3. password policy matches registration (6-128 chars)
 *   4. new password stored ONLY as a bcrypt hash
 *   5. the code is burned (single use)
 *
 * No session is issued here on purpose: the user proves email control with
 * the code, then logs in through the normal (rate-limited) email+password
 * route. This also avoids session fixation after a reset.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit: 5 reset attempts per minute per IP
    const { success, resetIn } = rateLimit({ ip, limit: 5, window: 60, key: "reset-password" });
    if (!success) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже.", retryAfter: resetIn },
        { status: 429, headers: { "X-RateLimit-Reset": String(resetIn) } }
      );
    }

    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const raw = await req.json();
    let { email, code, newPassword } = raw;

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { error: "Email, код и новый пароль обязательны" },
        { status: 400 }
      );
    }

    email = String(email).trim().toLowerCase();
    code = String(code).trim();
    newPassword = String(newPassword);

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Введите 6-значный код" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      );
    }
    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: "Пароль слишком длинный (макс. 128 символов)" },
        { status: 400 }
      );
    }

    // Find the unused, non-expired code (same lookup as verify-code)
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

    const user = await database.findUserByEmail(email);
    if (!user) {
      // Enumeration-safe: same generic error as an invalid code
      return NextResponse.json(
        { error: "Неверный код или срок действия истёк" },
        { status: 400 }
      );
    }

    if (user.blocked) {
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
    }

    // Burn the code BEFORE writing the password (single-use guarantee)
    await database.markVerificationCodeUsed(verificationCode.id);

    // Store only the hash — the plaintext never touches the DB
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await database.updateUser(user.id, { password: hashedPassword });

    return NextResponse.json({
      message: "Пароль изменён. Войдите с новым паролем.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Ошибка при сбросе пароля" }, { status: 500 });
  }
}
