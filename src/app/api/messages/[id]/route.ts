import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function patchHandler(req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const { id } = await ctx!.params;
    const { content } = await req.json();
    if (!content) return NextResponse.json({ error: "Поля обязательны" }, { status: 400 });

    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.senderId !== userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (message.deleted) return NextResponse.json({ error: "Сообщение удалено" }, { status: 400 });

    const updated = await db.message.update({
      where: { id },
      data: { content, edited: true, editedAt: new Date() },
      include: { sender: { select: { id: true, username: true } } },
    });
    return NextResponse.json({ message: updated });
  } catch (error) {
    console.error("Edit message error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const { id } = await ctx!.params;

    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.senderId !== userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const deleted = await db.message.update({
      where: { id },
      data: { deleted: true, content: "[Удалено]", encrypted: false, messageType: "system" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete message error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const PATCH = withRateLimit(RATE_LIMITS.write, patchHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);
