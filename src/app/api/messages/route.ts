import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 60, window: 60, key: "messages-get" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const senderId = req.nextUrl.searchParams.get("senderId");
    const receiverId = req.nextUrl.searchParams.get("receiverId");
    const sinceParam = req.nextUrl.searchParams.get("since");

    if (!senderId || !receiverId) {
      return NextResponse.json(
        { error: "senderId и receiverId обязательны" },
        { status: 400 }
      );
    }

    // Build where clause — support "since" timestamp for incremental polling
    const where: Record<string, unknown> = {
      OR: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    };

    // If "since" is provided, only fetch messages created after that time
    if (sinceParam) {
      try {
        const sinceDate = new Date(sinceParam);
        if (!isNaN(sinceDate.getTime())) {
          where.createdAt = { gt: sinceDate };
        }
      } catch { /* ignore invalid since param */ }
    }

    const messages = await db.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        receiver: { select: { id: true, username: true, avatar: true } },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке сообщений" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 30, window: 60, key: "messages-post" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const { content, senderId, receiverId, encrypted, id, messageType, replyToId, voiceUrl, voiceDuration } = await req.json();

    if (!senderId || !receiverId) {
      return NextResponse.json(
        { error: "Все поля обязательны" },
        { status: 400 }
      );
    }

    const message = await db.message.create({
      data: {
        id: id || undefined,
        content: content || "",
        senderId,
        receiverId,
        encrypted: encrypted !== false,
        messageType: messageType || "text",
        replyToId: replyToId || null,
        voiceUrl: voiceUrl || null,
        voiceDuration: voiceDuration || null,
      },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке сообщения" },
      { status: 500 }
    );
  }
}
