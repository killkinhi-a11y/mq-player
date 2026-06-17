import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
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

    const messages = await database.findMessages({
      userId,
      receiverId,
      since: sinceParam || undefined,
      deleted: false,
      limit: 200,
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

    const message = await database.createMessage({
      content: content || "",
      senderId,
      receiverId,
      encrypted: encrypted !== false,
      messageType: messageType || "text",
      replyToId: replyToId || null,
      voiceUrl: voiceUrl || null,
      voiceDuration: voiceDuration || null,
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
