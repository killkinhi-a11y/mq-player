import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    if (userId === id) {
      return NextResponse.json({ error: "Нельзя удалить свой аккаунт" }, { status: 400 });
    }

    const targetUser = await db.user.findUnique({
      where: { id },
      select: { username: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    await db.user.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        adminId: userId,
        action: "delete_user",
        targetId: id,
        details: JSON.stringify({ username: targetUser.username, email: targetUser.email }),
      },
    });

    return NextResponse.json({ message: "Пользователь удалён" });
  } catch (error) {
    console.error("Admin user delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления пользователя" }, { status: 500 });
  }
}
