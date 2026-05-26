import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/unread-count
 * Returns the latest incoming message for new-message detection.
 * Does NOT count total unread — that's managed client-side via unreadCounts.
 */
async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    // Get latest incoming message (not from self, not deleted, not system)
    const latestMsg = await db.message.findFirst({
      where: {
        receiverId: userId,
        senderId: { not: userId },
        deleted: false,
        messageType: { not: "system" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
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
