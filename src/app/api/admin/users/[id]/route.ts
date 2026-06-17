import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth } from "@/lib/withAuth";

async function handler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { id } = await ctx.params;

    if (userId === id) {
      return NextResponse.json({ error: "Нельзя удалить свой аккаунт" }, { status: 400 });
    }

    const targetUser = await database.findUserById(id);

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Cascade-delete all related data + the user
    await database.deleteUserCascade(id);

    await database.createAuditLog({
      adminId: userId,
      action: "delete_user",
      targetId: id,
      details: JSON.stringify({ username: targetUser.username, email: targetUser.email }),
    });

    return NextResponse.json({ message: "Пользователь удалён" });
  } catch (error) {
    console.error("Admin user delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления пользователя" }, { status: 500 });
  }
}
export const DELETE = withRateLimit(RATE_LIMITS.admin, withAdminAuth(handler));
