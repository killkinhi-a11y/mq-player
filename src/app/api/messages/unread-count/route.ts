import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/unread-count
 * Returns the latest incoming message for new-message detection.
 * Does NOT count total unread — that's managed client-side via unreadCounts.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ latestMessage: null });
    }
    const userId = session.userId;

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
