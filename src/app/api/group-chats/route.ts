import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

// GET /api/group-chats — list all group chats for a user
async function getHandler(req: NextRequest) {
  try {
    const session = await getSession();
    // Allow demo mode - check for demo user header
    const demoUserId = req.headers.get('x-demo-user-id');

    if (!session && !demoUserId) {
      return NextResponse.json(
        { error: "Необходима авторизация" },
        { status: 401 }
      );
    }

    const userId = session?.userId || demoUserId || '';

    // For demo users, return mock group chats so the UI is functional
    if (demoUserId) {
      const demoGroupChats = [
        {
          id: "demo-group-music",
          name: "Музыкальный чилл",
          description: "Обсуждаем любимые треки и делимся находками",
          avatar: "",
          createdBy: demoUserId,
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          updatedAt: new Date().toISOString(),
          memberCount: 5,
          lastMessage: {
            id: "demo-msg-1",
            content: "Кто-нибудь слушал новый альбом? 🔥",
            messageType: "text",
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            sender: { id: "demo-bot-1", username: "Меломан", avatar: "" },
          },
        },
        {
          id: "demo-group-hits",
          name: "Хиты 2024",
          description: "Собираем лучшие треки года",
          avatar: "",
          createdBy: demoUserId,
          createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
          updatedAt: new Date(Date.now() - 7200000).toISOString(),
          memberCount: 12,
          lastMessage: {
            id: "demo-msg-2",
            content: "Добавил новый плейлист, зацените!",
            messageType: "text",
            createdAt: new Date(Date.now() - 7200000).toISOString(),
            sender: { id: "demo-bot-2", username: "DJ_Vibe", avatar: "" },
          },
        },
        {
          id: "demo-group-lofi",
          name: "Lo-Fi & Chill",
          description: "Расслабляющая музыка для учёбы и работы",
          avatar: "",
          createdBy: "demo-bot-3",
          createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
          memberCount: 8,
          lastMessage: {
            id: "demo-msg-3",
            content: "Идеальный трек для дождливого вечера 🌧️",
            messageType: "text",
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            sender: { id: "demo-bot-3", username: "ChillMaster", avatar: "" },
          },
        },
      ];
      return NextResponse.json({ groupChats: demoGroupChats });
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
async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    // Allow demo mode - check for demo user header
    const demoUserId = req.headers.get('x-demo-user-id');
    const demoUserName = req.headers.get('x-demo-user-name') || 'Демо';

    if (!session && !demoUserId) {
      return NextResponse.json(
        { error: "Необходима авторизация" },
        { status: 401 }
      );
    }

    const userId = session?.userId || demoUserId || '';
    const userName = session?.username || demoUserName;
    const { name, description, memberIds }: { name: string; description?: string; memberIds?: string[] } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "Название обязательно" },
        { status: 400 }
      );
    }

    // Verify the creator exists (skip for demo users)
    if (!demoUserId) {
      const creator = await db.user.findUnique({ where: { id: userId } });
      if (!creator) {
        return NextResponse.json(
          { error: "Пользователь не найден" },
          { status: 404 }
        );
      }
    }

    // Verify that all provided memberIds exist
    if (memberIds && memberIds.length > 0) {
      if (memberIds.length > 50) {
        return NextResponse.json(
          { error: "Максимум 50 участников в группе" },
          { status: 400 }
        );
      }
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
      (id: string) => id !== userId
    );

    // For demo users, return a mock response (no DB persistence)
    if (demoUserId) {
      const mockGroupChat = {
        id: `demo-group-${Date.now()}`,
        name,
        description: description || "",
        avatar: "",
        createdBy: userId,
        createdAt: new Date().toISOString(),
        members: [
          { id: `demo-member-${Date.now()}`, userId, role: "admin", joinedAt: new Date().toISOString(), user: { id: userId, username: demoUserName, avatar: "" } },
          ...filteredMemberIds.map((id: string, idx: number) => ({
            id: `demo-member-${Date.now()}-${idx}`,
            userId: id,
            role: "member" as const,
            joinedAt: new Date().toISOString(),
            user: { id, username: id, avatar: "" },
          })),
        ],
      };
      return NextResponse.json({ groupChat: mockGroupChat }, { status: 201 });
    }

    // Create group chat with creator as admin
    const groupChat = await db.groupChat.create({
      data: {
        name,
        description: description || "",
        avatar: "",
        createdBy: userId,
        members: {
          createMany: {
            data: [
              { userId: userId, role: "admin" },
              ...filteredMemberIds.map((id: string) => ({
                userId: id,
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
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
