import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(req: NextRequest) {
  try {
    const { userId, email } = await req.json();
    if (!userId || !email) return NextResponse.json({ error: "userId и email обязательны" }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== email) return NextResponse.json({ error: "Неверные данные" }, { status: 403 });

    // Delete all related data
    await db.message.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } });
    await db.friend.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    await db.storyLike.deleteMany({ where: { userId } });
    await db.storyComment.deleteMany({ where: { userId } });
    await db.story.deleteMany({ where: { userId } });
    await db.playlistLike.deleteMany({ where: { userId } });
    await db.playlist.deleteMany({ where: { userId } });
    await db.userSync.deleteMany({ where: { userId } });
    await db.groupChatMember.deleteMany({ where: { userId } });
    await db.groupMessage.deleteMany({ where: { senderId: userId } });

    // Get group chats created by user and delete them
    const createdGroups = await db.groupChat.findMany({ where: { createdBy: userId }, select: { id: true } });
    for (const g of createdGroups) {
      await db.groupChatMember.deleteMany({ where: { groupChatId: g.id } });
      await db.groupMessage.deleteMany({ where: { groupChatId: g.id } });
      await db.groupChat.delete({ where: { id: g.id } });
    }

    await db.verificationCode.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, handler);
