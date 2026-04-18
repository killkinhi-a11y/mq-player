import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/group-chats/[id]?userId=xxx — group chat details with members and last 50 messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId");

    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
        messages: {
          where: { deleted: false },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
          },
        },
        creator: { select: { id: true, username: true, avatar: true } },
      },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    // Check if the requesting user is a member
    if (userId) {
      const isMember = groupChat.members.some((m) => m.userId === userId);
      if (!isMember) {
        return NextResponse.json(
          { error: "У вас нет доступа к этому чату" },
          { status: 403 }
        );
      }
    }

    // Messages are returned newest first; reverse for chronological order
    const messages = [...groupChat.messages].reverse();

    return NextResponse.json({
      groupChat: {
        id: groupChat.id,
        name: groupChat.name,
        description: groupChat.description,
        avatar: groupChat.avatar,
        createdBy: groupChat.createdBy,
        createdAt: groupChat.createdAt,
        updatedAt: groupChat.updatedAt,
        creator: groupChat.creator,
        memberCount: groupChat.members.length,
        members: groupChat.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          messageType: m.messageType,
          replyToId: m.replyToId,
          edited: m.edited,
          editedAt: m.editedAt,
          voiceUrl: m.voiceUrl,
          voiceDuration: m.voiceDuration,
          createdAt: m.createdAt,
          sender: m.sender,
        })),
      },
    });
  } catch (error) {
    console.error("Get group chat details error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке данных чата" },
      { status: 500 }
    );
  }
}

// PATCH /api/group-chats/[id] — update group chat (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId, name, description, avatar } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId обязателен" },
        { status: 400 }
      );
    }

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

    // Check if the user is an admin member
    const membership = groupChat.members.find((m) => m.userId === userId);
    if (!membership) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого чата" },
        { status: 403 }
      );
    }

    if (membership.role !== "admin") {
      return NextResponse.json(
        { error: "Только администраторы могут изменять чат" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Нет данных для обновления" },
        { status: 400 }
      );
    }

    const updated = await db.groupChat.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      groupChat: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        avatar: updated.avatar,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update group chat error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении чата" },
      { status: 500 }
    );
  }
}

// DELETE /api/group-chats/[id]?userId=xxx — delete group chat (creator only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId обязателен" },
        { status: 400 }
      );
    }

    const groupChat = await db.groupChat.findUnique({
      where: { id },
    });

    if (!groupChat) {
      return NextResponse.json(
        { error: "Групповой чат не найден" },
        { status: 404 }
      );
    }

    if (groupChat.createdBy !== userId) {
      return NextResponse.json(
        { error: "Только создатель может удалить чат" },
        { status: 403 }
      );
    }

    await db.groupChat.delete({ where: { id } });

    return NextResponse.json({ message: "Чат успешно удалён" });
  } catch (error) {
    console.error("Delete group chat error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении чата" },
      { status: 500 }
    );
  }
}
