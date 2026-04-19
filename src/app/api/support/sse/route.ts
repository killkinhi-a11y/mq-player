import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

/**
 * SSE endpoint for support chat — streams new messages to the user.
 * GET /api/support/sse?sessionId=xxx
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    let supportSession;
    if (sessionId) {
      supportSession = await db.supportChatSession.findUnique({ where: { sessionId } });
    } else if (userId) {
      supportSession = await db.supportChatSession.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!supportSession) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    const lastMessages = await db.supportChatMessage.findMany({
      where: { sessionId: supportSession.sessionId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const lastKnownId = lastMessages[0]?.id || "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionId: supportSession!.sessionId })}\n\n`));

        let polling = true;
        let currentId = lastKnownId;

        const poll = async () => {
          while (polling) {
            try {
              const freshSession = await db.supportChatSession.findUnique({
                where: { sessionId: supportSession!.sessionId },
              });
              if (!freshSession || freshSession.status === "closed") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "closed" })}\n\n`));
                polling = false;
                break;
              }

              const newMessages = await db.supportChatMessage.findMany({
                where: {
                  sessionId: supportSession!.sessionId,
                  id: { gt: currentId },
                },
                orderBy: { createdAt: "asc" },
              });

              if (newMessages.length > 0) {
                for (const msg of newMessages) {
                  const payload = {
                    type: "new_message",
                    message: {
                      id: msg.id,
                      role: msg.role,
                      content: msg.content,
                      createdAt: msg.createdAt.toISOString(),
                    },
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                }
                currentId = newMessages[newMessages.length - 1].id;
              }

              controller.enqueue(encoder.encode(`: keepalive\n\n`));
            } catch {
              try {
                controller.enqueue(encoder.encode(`event: error\ndata: {\"type\":\"error\"}\n\n`));
              } catch {}
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
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
    console.error("Support SSE error:", error);
    return NextResponse.json({ error: "Ошибка SSE" }, { status: 500 });
  }
}
