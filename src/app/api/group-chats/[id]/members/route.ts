import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// POST /api/group-chats/[id]/members — add member (admin only)
async function postHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const { id } = await ctx!.params;
    const { userId, addedBy } = await req.json();

    if (!userId || !addedBy) {
      return NextResponse.json(
        { error: "userId и addedBy обязательны" },
        { status: 400 }
      );
    }

    // Verify group chat exists
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    // Verify the adder is an admin
    const adderMembership = groupChat.members.find((m) => m.userId === addedBy);
    if (!adderMembership) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого чата" },
        { status: 403 }
      );
    }

    if (adderMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Только администраторы могут добавлять участников" },
        { status: 403 }
      );
    }

    // Verify the target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Check if already a member
    const existingMember = groupChat.members.find((m) => m.userId === userId);
    if (existingMember) {
      return NextResponse.json(
        { error: "Пользователь уже является участником чата" },
        { status: 409 }
      );
    }

    // Add the member
    const member = await db.groupChatMember.create({
      data: {
        groupChatId: id,
        userId,
        role: "member",
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });

    return NextResponse.json(
      {
        member: {
          id: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
          user: member.user,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Add group member error:", error);
    return NextResponse.json(
      { error: "Ошибка при добавлении участника" },
      { status: 500 }
    );
  }
}

// DELETE /api/group-chats/[id]/members?userId=xxx&removedBy=xxx — remove member
async function deleteHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const { id } = await ctx!.params;
    const userId = req.nextUrl.searchParams.get("userId");
    const removedBy = req.nextUrl.searchParams.get("removedBy");

    if (!userId || !removedBy) {
      return NextResponse.json(
        { error: "userId и removedBy обязательны" },
        { status: 400 }
      );
    }

    // Verify group chat exists
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    // Verify the remover is a member
    const removerMembership = groupChat.members.find((m) => m.userId === removedBy);
    if (!removerMembership) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого чата" },
        { status: 403 }
      );
    }

    // A user can remove themselves, or an admin can remove others
    const isSelfRemoval = userId === removedBy;
    const isAdmin = removerMembership.role === "admin";

    if (!isSelfRemoval && !isAdmin) {
      return NextResponse.json(
        { error: "Вы можете удалить только себя из чата" },
        { status: 403 }
      );
    }

    // Verify the target is actually a member
    const targetMembership = groupChat.members.find((m) => m.userId === userId);
    if (!targetMembership) {
      return NextResponse.json(
        { error: "Пользователь не является участником чата" },
        { status: 404 }
      );
    }

    // Don't allow removing the creator unless it's self-removal (and even then warn)
    if (groupChat.createdBy === userId && !isSelfRemoval) {
      return NextResponse.json(
        { error: "Невозможно удалить создателя чата" },
        { status: 403 }
      );
    }

    // Remove the member
    await db.groupChatMember.delete({
      where: { id: targetMembership.id },
    });

    return NextResponse.json({ message: "Участник удалён из чата" });
  } catch (error) {
    console.error("Remove group member error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении участника" },
      { status: 500 }
    );
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);
