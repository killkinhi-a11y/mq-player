import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
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

    // ── Turso path ──
    if (isTurso()) {
      const t = getTursoClient();
      // Step 1: get all group chats this user is a member of, with member count
      const membershipsResult = await t.execute({
        sql: `SELECT gc.*,
                 (SELECT COUNT(*) FROM GroupChatMember WHERE groupChatId = gc.id) as memberCount
              FROM GroupChat gc
              JOIN GroupChatMember m ON m.groupChatId = gc.id
              WHERE m.userId = ?
              ORDER BY gc.updatedAt DESC`,
        args: [userId],
      });
      const groupChats = [];
      for (const r of membershipsResult.rows) {
        const row = r as Record<string, unknown>;
        const chatId = String(row.id ?? "");
        // Fetch last non-deleted message + sender info
        const lastMsgResult = await t.execute({
          sql: `SELECT gm.id, gm.content, gm.messageType, gm.createdAt,
                   u.id as u_id, u.username as u_username, u.avatar as u_avatar
                FROM GroupMessage gm
                JOIN User u ON gm.senderId = u.id
                WHERE gm.groupChatId = ? AND gm.deleted = 0
                ORDER BY gm.createdAt DESC LIMIT 1`,
          args: [chatId],
        });
        const lastMsgRow = lastMsgResult.rows[0] as Record<string, unknown> | undefined;
        groupChats.push({
          id: chatId,
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          avatar: String(row.avatar ?? ""),
          createdBy: String(row.createdBy ?? ""),
          createdAt: String(row.createdAt ?? ""),
          updatedAt: String(row.updatedAt ?? ""),
          memberCount: Number(row.memberCount ?? 0),
          lastMessage: lastMsgRow ? {
            id: String(lastMsgRow.id ?? ""),
            content: String(lastMsgRow.content ?? ""),
            messageType: String(lastMsgRow.messageType ?? "text"),
            createdAt: String(lastMsgRow.createdAt ?? ""),
            sender: {
              id: String(lastMsgRow.u_id ?? ""),
              username: String(lastMsgRow.u_username ?? ""),
              avatar: String(lastMsgRow.u_avatar ?? ""),
            },
          } : null,
        });
      }
      return NextResponse.json({ groupChats });
    }

    // ── Prisma path ──
    const { db } = await import("@/lib/db");
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
              include: { sender: { select: { id: true, username: true, avatar: true } } },
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
    const demoUserId = req.headers.get('x-demo-user-id');
    const demoUserName = req.headers.get('x-demo-user-name') || 'Демо';

    if (!session && !demoUserId) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    const userId = session?.userId || demoUserId || '';
    const { name, description, memberIds }: { name: string; description?: string; memberIds?: string[] } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }

    // Verify creator exists (skip for demo users)
    if (!demoUserId) {
      const creator = await database.findUserById(userId);
      if (!creator) {
        return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      }
    }

    // Verify that all provided memberIds exist
    if (memberIds && memberIds.length > 0) {
      if (memberIds.length > 50) {
        return NextResponse.json({ error: "Максимум 50 участников в группе" }, { status: 400 });
      }
      const uniqueIds = [...new Set(memberIds)];
      // For each id, check existence via findUserById (cheap on Turso via indexed PK)
      const checks = await Promise.all(uniqueIds.map((id) => database.findUserById(id)));
      const invalidIds = uniqueIds.filter((_id, idx) => !checks[idx]);
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: "Некоторые пользователи не найдены" }, { status: 400 });
      }
    }

    const filteredMemberIds = (memberIds || []).filter((id: string) => id !== userId);

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

    // ── Create group chat ──
    if (isTurso()) {
      const t = getTursoClient();
      const chatId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      const stmts = [
        t.execute({
          sql: "INSERT INTO GroupChat (id, name, description, avatar, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?, ?)",
          args: [chatId, name, description || "", userId, now, now],
        }),
        // Creator as admin
        t.execute({
          sql: "INSERT INTO GroupChatMember (id, groupChatId, userId, role, joinedAt) VALUES (?, ?, ?, 'admin', ?)",
          args: [`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, chatId, userId, now],
        }),
        // Other members
        ...filteredMemberIds.map((id: string) =>
          t.execute({
            sql: "INSERT INTO GroupChatMember (id, groupChatId, userId, role, joinedAt) VALUES (?, ?, ?, 'member', ?)",
            args: [`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, chatId, id, now],
          })
        ),
      ];
      await t.batch(stmts);

      // Build response — fetch all members with user info
      const membersResult = await t.execute({
        sql: `SELECT m.*, u.id as u_id, u.username as u_username, u.avatar as u_avatar
              FROM GroupChatMember m
              JOIN User u ON m.userId = u.id
              WHERE m.groupChatId = ?`,
        args: [chatId],
      });
      const members = membersResult.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          userId: String(row.userId ?? ""),
          role: String(row.role ?? "member"),
          joinedAt: String(row.joinedAt ?? ""),
          user: { id: String(row.u_id ?? ""), username: String(row.u_username ?? ""), avatar: String(row.u_avatar ?? "") },
        };
      });
      return NextResponse.json({
        groupChat: {
          id: chatId, name, description: description || "", avatar: "",
          createdBy: userId, createdAt: now, members,
        },
      }, { status: 201 });
    }

    // Prisma path
    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.create({
      data: {
        name,
        description: description || "",
        avatar: "",
        createdBy: userId,
        members: {
          createMany: {
            data: [
              { userId, role: "admin" },
              ...filteredMemberIds.map((id: string) => ({ userId: id, role: "member" as const })),
            ],
          },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatar: true } } } },
      },
    });
    return NextResponse.json(
      {
        groupChat: {
          id: groupChat.id, name: groupChat.name, description: groupChat.description,
          avatar: groupChat.avatar, createdBy: groupChat.createdBy, createdAt: groupChat.createdAt,
          members: groupChat.members.map((m) => ({
            id: m.id, userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create group chat error:", error);
    return NextResponse.json({ error: "Ошибка при создании группового чата" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
