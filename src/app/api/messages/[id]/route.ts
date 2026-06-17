import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { id } = await ctx.params;
    const { content } = await req.json();
    if (!content) return NextResponse.json({ error: "Поля обязательны" }, { status: 400 });

    const message = await database.findMessageById(id);
    if (!message || message.senderId !== userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (message.deleted) return NextResponse.json({ error: "Сообщение удалено" }, { status: 400 });

    await database.updateMessage(id, {
      content,
      edited: true,
      editedAt: new Date().toISOString(),
    });

    const updated = await database.findMessageById(id);
    return NextResponse.json({ message: updated });
  } catch (error) {
    console.error("Edit message error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

async function deleteHandler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { id } = await ctx.params;

    const message = await database.findMessageById(id);
    if (!message || message.senderId !== userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    await database.updateMessage(id, {
      deleted: true,
      content: "[Удалено]",
      encrypted: false,
      messageType: "system",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete message error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const PATCH = withRateLimit(RATE_LIMITS.write, withAuth(patchHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));
