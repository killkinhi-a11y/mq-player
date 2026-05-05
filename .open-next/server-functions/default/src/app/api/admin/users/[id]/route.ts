import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function handler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { id } = await ctx!.params;

    const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    if (userId === id) {
      return NextResponse.json({ error: "Нельзя удалить свой аккаунт" }, { status: 400 });
    }

    const targetUser = await db.user.findUnique({
      where: { id },
      select: { username: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Delete all related data in a transaction (same pattern as self-delete)
    await db.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
      await tx.friend.deleteMany({ where: { OR: [{ requesterId: id }, { addresseeId: id }] } });
      await tx.storyLike.deleteMany({ where: { userId: id } });
      await tx.storyComment.deleteMany({ where: { userId: id } });
      await tx.story.deleteMany({ where: { userId: id } });
      await tx.playlistLike.deleteMany({ where: { userId: id } });
      await tx.playlist.deleteMany({ where: { userId: id } });
      await tx.userSync.deleteMany({ where: { userId: id } });
      await tx.groupChatMember.deleteMany({ where: { userId: id } });
      await tx.groupMessage.deleteMany({ where: { senderId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.listenSession.deleteMany({ where: { OR: [{ hostId: id }, { guestId: id }] } });

      // Get group chats created by this user and delete them
      const createdGroups = await tx.groupChat.findMany({ where: { createdBy: id }, select: { id: true } });
      for (const g of createdGroups) {
        await tx.groupChatMember.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupMessage.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupChat.delete({ where: { id: g.id } });
      }

      await tx.verificationCode.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    await db.auditLog.create({
      data: {
        adminId: userId,
        action: "delete_user",
        targetId: id,
        details: JSON.stringify({ username: targetUser.username, email: targetUser.email }),
      },
    });

    return NextResponse.json({ message: "Пользователь удалён" });
  } catch (error) {
    console.error("Admin user delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления пользователя" }, { status: 500 });
  }
}
export const DELETE = withRateLimit(RATE_LIMITS.admin, handler);
