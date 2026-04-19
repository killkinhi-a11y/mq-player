import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email обязателен" }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== email) return NextResponse.json({ error: "Неверные данные" }, { status: 403 });

    // Delete all related data in a transaction to prevent partial deletion
    await db.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } });
      await tx.friend.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
      await tx.storyLike.deleteMany({ where: { userId } });
      await tx.storyComment.deleteMany({ where: { userId } });
      await tx.story.deleteMany({ where: { userId } });
      await tx.playlistLike.deleteMany({ where: { userId } });
      await tx.playlist.deleteMany({ where: { userId } });
      await tx.userSync.deleteMany({ where: { userId } });
      await tx.groupChatMember.deleteMany({ where: { userId } });
      await tx.groupMessage.deleteMany({ where: { senderId: userId } });

      // Get group chats created by user and delete them
      const createdGroups = await tx.groupChat.findMany({ where: { createdBy: userId }, select: { id: true } });
      for (const g of createdGroups) {
        await tx.groupChatMember.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupMessage.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupChat.delete({ where: { id: g.id } });
      }

      await tx.verificationCode.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, handler);
