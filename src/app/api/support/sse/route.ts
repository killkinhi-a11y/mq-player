import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { getSession } from "@/lib/get-session";

/**
 * SSE endpoint for support chat — streams new messages to the user.
 * GET /api/support/sse?sessionId=xxx
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    const userId = session.userId;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    // Resolve the support session
    let supportSessionId: string | null = null;
    let supportSessionUserId: string | null = null;

    if (isTurso()) {
      const t = getTursoClient();
      let result;
      if (sessionId) {
        result = await t.execute({ sql: "SELECT sessionId, userId FROM SupportChatSession WHERE sessionId = ?", args: [sessionId] });
      } else if (userId) {
        result = await t.execute({ sql: "SELECT sessionId, userId FROM SupportChatSession WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1", args: [userId] });
      }
      if (result && result.rows.length > 0) {
        const row = result.rows[0] as Record<string, unknown>;
        supportSessionId = String(row.sessionId ?? "");
        supportSessionUserId = row.userId != null ? String(row.userId) : null;
      }
    } else {
      const { db } = await import("@/lib/db");
      let supportSession;
      if (sessionId) {
        supportSession = await db.supportChatSession.findUnique({ where: { sessionId } });
      } else if (userId) {
        supportSession = await db.supportChatSession.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
      }
      if (supportSession) {
        supportSessionId = supportSession.sessionId;
        supportSessionUserId = supportSession.userId;
      }
    }

    if (!supportSessionId) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // IDOR check
    if (supportSessionUserId && supportSessionUserId !== userId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    // Get the last known message ID to start polling from
    let lastKnownId = "";
    if (isTurso()) {
      const t = getTursoClient();
      const lastResult = await t.execute({
        sql: "SELECT id FROM SupportChatMessage WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1",
        args: [supportSessionId],
      });
      if (lastResult.rows.length > 0) {
        lastKnownId = String((lastResult.rows[0] as Record<string, unknown>).id ?? "");
      }
    } else {
      const { db } = await import("@/lib/db");
      const lastMessages = await db.supportChatMessage.findMany({
        where: { sessionId: supportSessionId },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      lastKnownId = lastMessages[0]?.id || "";
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionId: supportSessionId })}\n\n`));

        let polling = true;
        let currentId = lastKnownId;

        const poll = async () => {
          while (polling) {
            try {
              if (isTurso()) {
                const t = getTursoClient();
                // Check session still open
                const sessionResult = await t.execute({
                  sql: "SELECT status FROM SupportChatSession WHERE sessionId = ?",
                  args: [supportSessionId!],
                });
                if (sessionResult.rows.length === 0 || String((sessionResult.rows[0] as Record<string, unknown>).status ?? "open") === "closed") {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "closed" })}\n\n`));
                  polling = false;
                  break;
                }
                // Fetch new messages (Turso doesn't support Prisma's id: { gt: ... }
                // — we use a date-based cursor instead, but for simplicity we fetch
                // all messages and filter client-side by currentId).
                // Better approach: store lastKnownCreatedAt and use WHERE createdAt > ?
                const newMsgsResult = await t.execute({
                  sql: "SELECT id, role, content, createdAt FROM SupportChatMessage WHERE sessionId = ? ORDER BY createdAt ASC",
                  args: [supportSessionId!],
                });
                const allMsgs = newMsgsResult.rows.map((r) => {
                  const row = r as Record<string, unknown>;
                  return {
                    id: String(row.id ?? ""),
                    role: String(row.role ?? "user"),
                    content: String(row.content ?? ""),
                    createdAt: String(row.createdAt ?? ""),
                  };
                });
                // Find messages after currentId
                const startIdx = currentId ? allMsgs.findIndex((m) => m.id === currentId) + 1 : 0;
                const newMessages = startIdx >= 0 ? allMsgs.slice(startIdx) : [];
                if (newMessages.length > 0) {
                  for (const msg of newMessages) {
                    const payload = {
                      type: "new_message",
                      message: {
                        id: msg.id, role: msg.role, content: msg.content, createdAt: msg.createdAt,
                      },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                  }
                  currentId = newMessages[newMessages.length - 1].id;
                }
              } else {
                const { db } = await import("@/lib/db");
                const freshSession = await db.supportChatSession.findUnique({ where: { sessionId: supportSessionId! } });
                if (!freshSession || freshSession.status === "closed") {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "closed" })}\n\n`));
                  polling = false;
                  break;
                }
                const newMessages = await db.supportChatMessage.findMany({
                  where: { sessionId: supportSessionId!, id: { gt: currentId } },
                  orderBy: { createdAt: "asc" },
                });
                if (newMessages.length > 0) {
                  for (const msg of newMessages) {
                    const payload = {
                      type: "new_message",
                      message: {
                        id: msg.id, role: msg.role, content: msg.content,
                        createdAt: msg.createdAt.toISOString(),
                      },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                  }
                  currentId = newMessages[newMessages.length - 1].id;
                }
              }

              controller.enqueue(encoder.encode(`: keepalive\n\n`));
            } catch {
              try {
                controller.enqueue(encoder.encode(`event: error\ndata: {"type":"error"}\n\n`));
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
