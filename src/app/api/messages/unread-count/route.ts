import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { isTurso, getTursoClient } from "@/lib/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/unread-count
 * Returns the latest incoming message for new-message detection.
 * Does NOT count total unread — that's managed client-side via unreadCounts.
 */
async function handler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    if (isTurso()) {
      const t = getTursoClient();
      // Latest incoming non-system message + sender info
      const result = await t.execute({
        sql: `SELECT m.id, m.content, m.senderId, m.messageType, m.createdAt,
                 s.username as s_username, s.avatar as s_avatar
              FROM Message m
              JOIN User s ON m.senderId = s.id
              WHERE m.receiverId = ? AND m.senderId != ? AND m.deleted = 0 AND m.messageType != 'system'
              ORDER BY m.createdAt DESC LIMIT 1`,
        args: [userId, userId],
      });
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return NextResponse.json({ latestMessage: null });
      return NextResponse.json({
        latestMessage: {
          id: String(row.id ?? ""),
          content: String(row.content ?? ""),
          senderId: String(row.senderId ?? ""),
          senderUsername: String(row.s_username ?? ""),
          senderAvatar: String(row.s_avatar ?? ""),
          messageType: String(row.messageType ?? "text"),
          createdAt: String(row.createdAt ?? ""),
        },
      });
    }

    const { db } = await import("@/lib/db");
    const latestMsg = await db.message.findFirst({
      where: {
        receiverId: userId,
        senderId: { not: userId },
        deleted: false,
        messageType: { not: "system" },
      },
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });

    return NextResponse.json({
      latestMessage: latestMsg ? {
        id: latestMsg.id,
        content: latestMsg.content,
        senderId: latestMsg.senderId,
        senderUsername: latestMsg.sender.username,
        senderAvatar: latestMsg.sender.avatar,
        messageType: latestMsg.messageType,
        createdAt: latestMsg.createdAt.toISOString(),
      } : null,
    });
  } catch (error) {
    console.error("Unread count error:", error);
    return NextResponse.json({ latestMessage: null });
  }
}
export const GET = withAuth(handler);
