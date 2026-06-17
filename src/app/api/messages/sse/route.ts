import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";
import { getActiveTypingForUser } from "@/app/api/messages/typing/route";

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

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 20, window: 60, key: "sse" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const { userId } = ctx;

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

        const poll = async () => {
          while (active) {
            try {
              // ── Check typing indicators from DB ──
              // Emit ALL active typing entries every poll cycle.
              // The client-side setTypingUser() overwrites the timestamp each time,
              // and TypingBubble auto-hides after 4s, so re-emission is necessary
              // to keep the indicator alive while the user is still typing.
              const typingEntries = await getActiveTypingForUser(userId);
              for (const entry of typingEntries) {
                controller.enqueue(
                  encoder.encode(
                    `event: typing\ndata: ${JSON.stringify({ type: "typing", userId: entry.userId, contactId: entry.contactId })}\n\n`
                  )
                );
              }

              // ── Check new messages ──
              let newMessages: Array<{
                id: string; content: string; senderId: string; receiverId: string;
                encrypted: boolean; messageType: string; replyToId: string | null;
                edited: boolean; voiceUrl: string | null; voiceDuration: number | null;
                createdAt: string;
                sender?: { username: string; avatar: string };
                receiver?: { username: string };
              }>;
              if (isTurso()) {
                const t = getTursoClient();
                const result = await t.execute({
                  sql: `SELECT m.*,
                         s.username as s_username, s.avatar as s_avatar,
                         r.username as r_username
                        FROM Message m
                        JOIN User s ON m.senderId = s.id
                        JOIN User r ON m.receiverId = r.id
                        WHERE (m.senderId = ? OR m.receiverId = ?)
                          AND m.createdAt > ?
                          AND m.deleted = 0
                        ORDER BY m.createdAt ASC
                        LIMIT 100`,
                  args: [userId, userId, lastChecked.toISOString()],
                });
                newMessages = result.rows.map((row) => {
                  const r = row as Record<string, unknown>;
                  return {
                    id: String(r.id ?? ""),
                    content: String(r.content ?? ""),
                    senderId: String(r.senderId ?? ""),
                    receiverId: String(r.receiverId ?? ""),
                    encrypted: r.encrypted === 1 || r.encrypted === true,
                    messageType: String(r.messageType ?? "text"),
                    replyToId: r.replyToId != null ? String(r.replyToId) : null,
                    edited: r.edited === 1 || r.edited === true,
                    voiceUrl: r.voiceUrl != null ? String(r.voiceUrl) : null,
                    voiceDuration: r.voiceDuration != null ? Number(r.voiceDuration) : null,
                    createdAt: String(r.createdAt ?? ""),
                    sender: { username: String(r.s_username ?? ""), avatar: String(r.s_avatar ?? "") },
                    receiver: { username: String(r.r_username ?? "") },
                  };
                });
              } else {
                const { db } = await import("@/lib/db");
                const rows = await db.message.findMany({
                  where: {
                    AND: [
                      { OR: [{ senderId: userId }, { receiverId: userId }] },
                      { createdAt: { gt: lastChecked } },
                      { deleted: false },
                    ],
                  },
                  orderBy: { createdAt: "asc" },
                  take: 100,
                  include: {
                    sender: { select: { id: true, username: true, avatar: true } },
                    receiver: { select: { id: true, username: true, avatar: true } },
                  },
                });
                newMessages = rows.map((msg) => ({
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
                  sender: { username: msg.sender?.username ?? "", avatar: msg.sender?.avatar ?? "" },
                  receiver: { username: msg.receiver?.username ?? "" },
                }));
              }

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
                      createdAt: msg.createdAt,
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
                lastChecked = new Date(new Date(newMessages[newMessages.length - 1].createdAt).getTime() + 1);
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
export const GET = withAuth(handler);
