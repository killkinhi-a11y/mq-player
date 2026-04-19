import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/unread-count
 * Returns total unread message count and the latest unread message for notifications.
 * Uses "unreadCounts" approach: counts messages AFTER the last message the user saw.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ count: 0, latestMessage: null });
    }
    const userId = session.userId;

    // Count messages received where user is the receiver, not deleted, not system,
    // and sent after a reasonable window (last 7 days) to avoid counting ancient msgs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get latest incoming message (not from self, not deleted, not system)
    const latestMsg = await db.message.findFirst({
      where: {
        receiverId: userId,
        senderId: { not: userId },
        deleted: false,
        messageType: { not: "system" },
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Count all unread messages across all contacts (last 7 days, received)
    const count = await db.message.count({
      where: {
        receiverId: userId,
        senderId: { not: userId },
        deleted: false,
        messageType: { not: "system" },
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Also get per-contact unread counts for badge display
    const recentMessages = await db.message.groupBy({
      by: ["senderId"],
      where: {
        receiverId: userId,
        senderId: { not: userId },
        deleted: false,
        messageType: { not: "system" },
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { id: true },
    });

    const perContact: Record<string, number> = {};
    for (const row of recentMessages) {
      perContact[row.senderId] = row._count.id;
    }

    return NextResponse.json({
      count,
      perContact,
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
    return NextResponse.json({ count: 0, latestMessage: null, perContact: {} });
  }
}
