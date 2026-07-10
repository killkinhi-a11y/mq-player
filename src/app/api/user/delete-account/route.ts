import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

/**
 * DELETE /api/user/delete-account
 * 
 * Two modes:
 * 1. { confirm: true } — delete without password (for settings UI)
 * 2. { email, password } — delete with password verification (legacy)
 * 
 * Both require authenticated session (withAuth).
 */
async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const body = await req.json().catch(() => ({}));

    // Mode 1: confirm without password (user already authenticated via JWT)
    if (body.confirm === true) {
      await database.deleteUserCascade(userId);
      return NextResponse.json({ success: true });
    }

    // Mode 2: legacy — requires email + password
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "email и пароль обязательны" }, { status: 400 });
    }

    const user = await database.findUserById(userId);
    if (!user || user.email !== email) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 403 });
    }

    const bcrypt = await import("bcryptjs");
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    await database.deleteUserCascade(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(handler));
