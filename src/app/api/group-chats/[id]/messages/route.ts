import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

// GET /api/group-chats/[id]/messages?cursor=xxx&limit=50 — paginated messages
async function getHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Необходима авторизация" },
        { status: 401 }
      );
    }
    const userId = session.userId;
    const { id } = await ctx!.params;
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

    // Verify the group chat exists and user is a member
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    const isMember = groupChat.members.some((m) => m.userId === userId);
    if (!isMember) {
      return NextResponse.json(
        { error: "У вас нет доступа к этому чату" },
        { status: 403 }
      );
    }

    // Build where clause with cursor-based pagination
    const where: Record<string, unknown> = {
      groupChatId: id,
      deleted: false,
    };

    if (cursor) {
      // Decode cursor: it's a base64-encoded ISO date string
      try {
        const cursorDate = new Date(atob(cursor));
        where.createdAt = { lt: cursorDate };
      } catch {
        // If cursor is invalid, ignore it
      }
    }

    const messages = await db.groupMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Determine next cursor
    let nextCursor: string | null = null;
    if (messages.length === limit) {
      const lastMessage = messages[messages.length - 1];
      nextCursor = btoa(lastMessage.createdAt.toISOString());
    }

    // Reverse so messages are in chronological order
    const reversedMessages = [...messages].reverse();

    return NextResponse.json({
      messages: reversedMessages.map((m) => ({
        id: m.id,
        content: m.content,
        messageType: m.messageType,
        replyToId: m.replyToId,
        edited: m.edited,
        editedAt: m.editedAt,
        voiceUrl: m.voiceUrl,
        voiceDuration: m.voiceDuration,
        createdAt: m.createdAt,
        sender: m.sender,
      })),
      nextCursor,
    });
  } catch (error) {
    console.error("Get group messages error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке сообщений" },
      { status: 500 }
    );
  }
}

// POST /api/group-chats/[id]/messages — send a message
async function postHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Необходима авторизация" },
        { status: 401 }
      );
    }
    const userId = session.userId;
    const { id } = await ctx!.params;
    const {
      content,
      messageType,
      replyToId,
      voiceUrl,
      voiceDuration,
      id: messageId,
    } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "content обязателен" },
        { status: 400 }
      );
    }

    // Verify group chat exists
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    // Verify sender is a member
    const isMember = groupChat.members.some((m) => m.userId === userId);
    if (!isMember) {
      return NextResponse.json(
        { error: "Только участники могут отправлять сообщения" },
        { status: 403 }
      );
    }

    // If replying, verify the replied message exists in this chat
    if (replyToId) {
      const repliedMessage = await db.groupMessage.findFirst({
        where: { id: replyToId, groupChatId: id },
      });
      if (!repliedMessage) {
        return NextResponse.json(
          { error: "Сообщение, на которое вы отвечаете, не найдено" },
          { status: 404 }
        );
      }
    }

    const message = await db.groupMessage.create({
      data: {
        id: messageId || undefined,
        groupChatId: id,
        senderId: userId,
        content,
        messageType: messageType || "text",
        replyToId: replyToId || null,
        voiceUrl: voiceUrl || null,
        voiceDuration: voiceDuration || null,
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    return NextResponse.json(
      {
        message: {
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          replyToId: message.replyToId,
          edited: message.edited,
          editedAt: message.editedAt,
          voiceUrl: message.voiceUrl,
          voiceDuration: message.voiceDuration,
          createdAt: message.createdAt,
          sender: message.sender,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Send group message error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке сообщения" },
      { status: 500 }
    );
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
