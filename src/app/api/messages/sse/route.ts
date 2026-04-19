import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { getTypingIndicatorsForUser, cleanupTypingMap } from "@/app/api/messages/typing/route";

/**
 * SSE endpoint for messenger — streams new DMs for a user.
 * GET /api/messages/sse?since=ISO_TIMESTAMP
 *
 * Uses "since" timestamp cursor instead of CUID comparison.
 * On Vercel serverless, the connection lasts up to maxDuration (60s).
 * Client should reconnect automatically via EventSource.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 20, window: 60, key: "sse" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;

    const { searchParams } = new URL(req.url);

    // Use timestamp cursor — sent by client on reconnect
    const sinceParam = searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 5000);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send connected event with current time so client can track cursor
        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: ${JSON.stringify({ type: "connected", serverTime: new Date().toISOString() })}\n\n`
          )
        );

        let active = true;
        let lastChecked = since;
        const emittedTypingKeys = new Set<string>();

        const poll = async () => {
          while (active) {
            try {
              // ── Check typing indicators ──
              cleanupTypingMap();
              const typingEntries = getTypingIndicatorsForUser(userId);
              for (const entry of typingEntries) {
                const typingKey = `${entry.userId}→${entry.contactId}`;
                if (!emittedTypingKeys.has(typingKey)) {
                  emittedTypingKeys.add(typingKey);
                  controller.enqueue(
                    encoder.encode(
                      `event: typing\ndata: ${JSON.stringify({ type: "typing", userId: entry.userId, contactId: entry.contactId })}\n\n`
                    )
                  );
                }
              }
              // Remove emitted keys that are no longer active
              const activeTypingKeys = new Set(typingEntries.map((e) => `${e.userId}→${e.contactId}`));
              for (const key of emittedTypingKeys) {
                if (!activeTypingKeys.has(key)) {
                  emittedTypingKeys.delete(key);
                }
              }

              // ── Check new messages ──
              const newMessages = await db.message.findMany({
                where: {
                  AND: [
                    {
                      OR: [
                        { senderId: userId },
                        { receiverId: userId },
                      ],
                    },
                    { createdAt: { gt: lastChecked } },
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
                  controller.enqueue(
                    encoder.encode(`event: new_message\ndata: ${JSON.stringify(payload)}\n\n`)
                  );
                }
                // Update cursor to latest message time + 1ms to avoid re-sending
                lastChecked = new Date(
                  newMessages[newMessages.length - 1].createdAt.getTime() + 1
                );
              }

              // Send keepalive comment (ignored by EventSource)
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch {
              // Continue on DB error
            }

            // Poll every 2 seconds
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          controller.close();
        };

        poll();

        req.signal.addEventListener("abort", () => {
          active = false;
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, no-transform, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Messages SSE error:", error);
    return NextResponse.json({ error: "Ошибка SSE" }, { status: 500 });
  }
}
