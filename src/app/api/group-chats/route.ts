import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/group-chats?userId=xxx — list all group chats for a user
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId обязателен" },
        { status: 400 }
      );
    }

    // Get all memberships for the user
    const memberships = await db.groupChatMember.findMany({
      where: { userId },
      include: {
        groupChat: {
          include: {
            members: { select: { id: true } },
            messages: {
              where: { deleted: false },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                sender: { select: { id: true, username: true, avatar: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const groupChats = memberships.map((m) => {
      const chat = m.groupChat;
      const lastMessage = chat.messages[0] || null;

      return {
        id: chat.id,
        name: chat.name,
        description: chat.description,
        avatar: chat.avatar,
        createdBy: chat.createdBy,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        memberCount: chat.members.length,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              messageType: lastMessage.messageType,
              createdAt: lastMessage.createdAt,
              sender: {
                id: lastMessage.sender.id,
                username: lastMessage.sender.username,
                avatar: lastMessage.sender.avatar,
              },
            }
          : null,
      };
    });

    return NextResponse.json({ groupChats });
  } catch (error) {
    console.error("Get group chats error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке групповых чатов" },
      { status: 500 }
    );
  }
}

// POST /api/group-chats — create a new group chat
export async function POST(req: NextRequest) {
  try {
    const { name, description, createdBy, memberIds } = await req.json();

    if (!name || !createdBy) {
      return NextResponse.json(
        { error: "Название и createdBy обязательны" },
        { status: 400 }
      );
    }

    // Verify the creator exists
    const creator = await db.user.findUnique({ where: { id: createdBy } });
    if (!creator) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Verify that all provided memberIds exist
    if (memberIds && memberIds.length > 0) {
      const uniqueIds = [...new Set(memberIds)];
      const existingUsers = await db.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingUsers.map((u) => u.id));
      const invalidIds = uniqueIds.filter((id: string) => !existingIdSet.has(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: "Некоторые пользователи не найдены" },
          { status: 400 }
        );
      }
    }

    // Remove creator from memberIds if present to avoid duplicates
    const filteredMemberIds = (memberIds || []).filter(
      (id: string) => id !== createdBy
    );

    // Create group chat with creator as admin
    const groupChat = await db.groupChat.create({
      data: {
        name,
        description: description || "",
        avatar: "",
        createdBy,
        members: {
          createMany: {
            data: [
              { userId: createdBy, role: "admin" },
              ...filteredMemberIds.map((userId: string) => ({
                userId,
                role: "member" as const,
              })),
            ],
          },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        groupChat: {
          id: groupChat.id,
          name: groupChat.name,
          description: groupChat.description,
          avatar: groupChat.avatar,
          createdBy: groupChat.createdBy,
          createdAt: groupChat.createdAt,
          members: groupChat.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            user: m.user,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create group chat error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании группового чата" },
      { status: 500 }
    );
  }
}
