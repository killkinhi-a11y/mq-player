import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import bcrypt from "bcryptjs";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { email, password } = await req.json();
    if (!email) return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    if (!password) return NextResponse.json({ error: "Пароль обязателен для удаления аккаунта" }, { status: 400 });

    const user = await database.findUserById(userId);
    if (!user || user.email !== email) return NextResponse.json({ error: "Неверные данные" }, { status: 403 });

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    // Cascade-delete all related data via the shared adapter method
    await database.deleteUserCascade(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(handler));
