import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    const receiverId = req.nextUrl.searchParams.get("receiverId");
    const sinceParam = req.nextUrl.searchParams.get("since");

    if (!receiverId) {
      return NextResponse.json(
        { error: "receiverId обязателен" },
        { status: 400 }
      );
    }

    // Build where clause — support "since" timestamp for incremental polling
    const where: Record<string, unknown> = {
      OR: [
        { senderId: userId, receiverId },
        { senderId: receiverId, receiverId: userId },
      ],
      deleted: false,
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
      take: 200,
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

async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId: senderId } = ctx;

    const { content, receiverId, encrypted, messageType, replyToId, voiceUrl, voiceDuration } = await req.json();

    if (!receiverId) {
      return NextResponse.json(
        { error: "receiverId обязателен" },
        { status: 400 }
      );
    }

    const message = await db.message.create({
      data: {
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

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
