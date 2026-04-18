import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * SSE endpoint for messenger — streams new DMs for a user.
 * GET /api/messages/sse?userId=xxx
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    }

    const latestMessages = await db.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    });
    const lastKnownId = latestMessages[0]?.id || "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ type: "connected" })}\n\n`));

        let polling = true;
        let currentId = lastKnownId;

        const poll = async () => {
          while (polling) {
            try {
              const newMessages = await db.message.findMany({
                where: {
                  AND: [
                    {
                      OR: [
                        { senderId: userId },
                        { receiverId: userId },
                      ],
                    },
                    { id: { gt: currentId } },
                  ],
                },
                orderBy: { createdAt: "asc" },
                include: {
                  sender: { select: { id: true, username: true, avatar: true } },
                  receiver: { select: { id: true, username: true, avatar: true } },
                },
              });

              if (newMessages.length > 0) {
                for (const msg of newMessages) {
                  const payload = {
                    type: "new_message",
                    message: {
                      id: msg.id,
                      content: msg.content,
                      senderId: msg.senderId,
                      receiverId: msg.receiverId,
                      encrypted: msg.encrypted ?? true,
                      messageType: msg.messageType,
                      replyToId: msg.replyToId,
                      edited: msg.edited,
                      voiceUrl: msg.voiceUrl,
                      voiceDuration: msg.voiceDuration,
                      createdAt: msg.createdAt.toISOString(),
                      senderUsername: msg.sender?.username,
                      senderAvatar: msg.sender?.avatar,
                      receiverUsername: msg.receiver?.username,
                    },
                  };
                  controller.enqueue(encoder.encode(`event: new_message\ndata: ${JSON.stringify(payload)}\n\n`));
                }
                currentId = newMessages[newMessages.length - 1].id;
              }

              controller.enqueue(encoder.encode(`: keepalive\n\n`));
            } catch {
              // Continue on error
            }

            await new Promise(resolve => setTimeout(resolve, 2500));
          }
          controller.close();
        };

        poll();

        req.signal.addEventListener("abort", () => {
          polling = false;
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Messages SSE error:", error);
    return NextResponse.json({ error: "Ошибка SSE" }, { status: 500 });
  }
}
