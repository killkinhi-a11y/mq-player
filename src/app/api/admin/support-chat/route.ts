import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionsFlag = searchParams.get("sessions");
    const sessionId = searchParams.get("sessionId");

    if (sessionsFlag === "true") {
      const sessions = await db.supportChatSession.findMany({
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ sessions });
    }

    if (sessionId) {
      const messages = await db.supportChatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ messages });
    }

    return NextResponse.json({ error: "Укажите sessions=true или sessionId" }, { status: 400 });
  } catch (error) {
    console.error("Admin support chat error:", error);
    return NextResponse.json({ error: "Ошибка загрузки чата поддержки" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, role, content } = body;

    if (!sessionId || !role || !content) {
      return NextResponse.json({ error: "sessionId, role и content обязательны" }, { status: 400 });
    }

    // Check session exists
    const session = await db.supportChatSession.findUnique({ where: { sessionId } });
    if (!session) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // Create message
    const message = await db.supportChatMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    // Update session
    await db.supportChatSession.update({
      where: { sessionId },
      data: {
        lastMessage: content.length > 100 ? content.substring(0, 100) + "..." : content,
        messageCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Admin support chat message error:", error);
    return NextResponse.json({ error: "Ошибка отправки сообщения" }, { status: 500 });
  }
}
