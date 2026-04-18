import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { content, senderId } = await req.json();
    if (!content || !senderId) return NextResponse.json({ error: "Поля обязательны" }, { status: 400 });

    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.senderId !== senderId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { senderId } = await req.json();
    if (!senderId) return NextResponse.json({ error: "senderId обязателен" }, { status: 400 });

    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.senderId !== senderId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

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
