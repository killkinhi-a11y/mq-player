import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

// Demo group messages — mock data for demo mode
const DEMO_GROUP_MESSAGES: Record<string, Array<{
  id: string; content: string; messageType: string; replyToId: string | null;
  edited: boolean; editedAt: null; voiceUrl: null; voiceDuration: null;
  createdAt: string; sender: { id: string; username: string; avatar: string };
}>> = {
  "demo-group-music": [
    { id: "dgm-1", content: "Привет всем! 🎵", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 7200000).toISOString(), sender: { id: "demo-bot-1", username: "Меломан", avatar: "" } },
    { id: "dgm-2", content: "Кто-нибудь слушал новый альбом? 🔥", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 3600000).toISOString(), sender: { id: "demo-bot-1", username: "Меломан", avatar: "" } },
    { id: "dgm-3", content: "Да, трек номер 3 просто огонь!", messageType: "text", replyToId: "dgm-2", edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 1800000).toISOString(), sender: { id: "demo-bot-2", username: "DJ_Vibe", avatar: "" } },
    { id: "dgm-4", content: "Согласен, тоже зашёл", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 900000).toISOString(), sender: { id: "demo-bot-3", username: "ChillMaster", avatar: "" } },
  ],
  "demo-group-hits": [
    { id: "dgh-1", content: "Добавил новый плейлист, зацените!", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 7200000).toISOString(), sender: { id: "demo-bot-2", username: "DJ_Vibe", avatar: "" } },
    { id: "dgh-2", content: "Крутой подбор! Как раз искал что-то подобное", messageType: "text", replyToId: "dgh-1", edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 3600000).toISOString(), sender: { id: "demo-bot-1", username: "Меломан", avatar: "" } },
  ],
  "demo-group-lofi": [
    { id: "dgl-1", content: "Идеальный трек для дождливого вечера 🌧️", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 86400000).toISOString(), sender: { id: "demo-bot-3", username: "ChillMaster", avatar: "" } },
    { id: "dgl-2", content: "Lo-fi и кофе — лучшая комбинация ☕", messageType: "text", replyToId: null, edited: false, editedAt: null, voiceUrl: null, voiceDuration: null, createdAt: new Date(Date.now() - 43200000).toISOString(), sender: { id: "demo-bot-1", username: "Меломан", avatar: "" } },
  ],
};

async function isMemberTurso(t: ReturnType<typeof getTursoClient>, chatId: string, userId: string): Promise<boolean> {
  const result = await t.execute({
    sql: "SELECT id FROM GroupChatMember WHERE groupChatId = ? AND userId = ?",
    args: [chatId, userId],
  });
  return result.rows.length > 0;
}

// GET /api/group-chats/[id]/messages?cursor=xxx&limit=50 — paginated messages
async function getHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    const demoUserId = req.headers.get('x-demo-user-id');

    if (!session && !demoUserId) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    // Demo mode
    if (demoUserId && !session) {
      const { id } = await ctx!.params;
      const msgs = DEMO_GROUP_MESSAGES[id] || [];
      return NextResponse.json({ messages: msgs, nextCursor: null });
    }

    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

    const userId = session.userId;
    const { id } = await ctx!.params;
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

    if (isTurso()) {
      const t = getTursoClient();

      // Verify chat exists + user is member
      const chatResult = await t.execute({ sql: "SELECT id FROM GroupChat WHERE id = ?", args: [id] });
      if (chatResult.rows.length === 0) {
        return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      }
      const isMember = await isMemberTurso(t, id, userId);
      if (!isMember) {
        return NextResponse.json({ error: "У вас нет доступа к этому чату" }, { status: 403 });
      }

      // Cursor-based pagination
      let sql = `SELECT m.*, u.id as u_id, u.username as u_username, u.avatar as u_avatar
                 FROM GroupMessage m
                 JOIN User u ON m.senderId = u.id
                 WHERE m.groupChatId = ? AND m.deleted = 0`;
      const args: (string | number)[] = [id];
      if (cursor) {
        try {
          const cursorDate = new Date(atob(cursor)).toISOString();
          sql += " AND m.createdAt < ?";
          args.push(cursorDate);
        } catch {
          // invalid cursor — ignore
        }
      }
      sql += " ORDER BY m.createdAt DESC LIMIT ?";
      args.push(limit);

      const result = await t.execute({ sql, args });
      const messages = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          content: String(row.content ?? ""),
          messageType: String(row.messageType ?? "text"),
          replyToId: row.replyToId != null ? String(row.replyToId) : null,
          edited: row.edited === 1 || row.edited === true,
          editedAt: row.editedAt != null ? String(row.editedAt) : null,
          voiceUrl: row.voiceUrl != null ? String(row.voiceUrl) : null,
          voiceDuration: row.voiceDuration != null ? Number(row.voiceDuration) : null,
          createdAt: String(row.createdAt ?? ""),
          sender: {
            id: String(row.u_id ?? ""),
            username: String(row.u_username ?? ""),
            avatar: String(row.u_avatar ?? ""),
          },
        };
      });

      // Next cursor
      let nextCursor: string | null = null;
      if (messages.length === limit) {
        const lastMessage = messages[messages.length - 1];
        nextCursor = btoa(lastMessage.createdAt);
      }

      // Reverse for chronological order
      const reversedMessages = [...messages].reverse();
      return NextResponse.json({ messages: reversedMessages, nextCursor });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });
    if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
    const isMember = groupChat.members.some((m) => m.userId === userId);
    if (!isMember) return NextResponse.json({ error: "У вас нет доступа к этому чату" }, { status: 403 });

    const where: Record<string, unknown> = { groupChatId: id, deleted: false };
    if (cursor) {
      try {
        const cursorDate = new Date(atob(cursor));
        where.createdAt = { lt: cursorDate };
      } catch {}
    }

    const messages = await db.groupMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });

    let nextCursor: string | null = null;
    if (messages.length === limit) {
      nextCursor = btoa(messages[messages.length - 1].createdAt.toISOString());
    }
    const reversedMessages = [...messages].reverse();
    return NextResponse.json({
      messages: reversedMessages.map((m) => ({
        id: m.id, content: m.content, messageType: m.messageType, replyToId: m.replyToId,
        edited: m.edited, editedAt: m.editedAt, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
        createdAt: m.createdAt, sender: m.sender,
      })),
      nextCursor,
    });
  } catch (error) {
    console.error("Get group messages error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке сообщений" }, { status: 500 });
  }
}

// POST /api/group-chats/[id]/messages — send a message
async function postHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    const demoUserId = req.headers.get('x-demo-user-id');
    const demoUserName = req.headers.get('x-demo-user-name') || 'Демо';

    if (!session && !demoUserId) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    // Demo mode
    if (demoUserId && !session) {
      const { content, messageType } = await req.json();
      if (!content) return NextResponse.json({ error: "content обязателен" }, { status: 400 });
      const { id } = await ctx!.params;
      if (DEMO_GROUP_MESSAGES[id]) {
        DEMO_GROUP_MESSAGES[id].push({
          id: `demo-msg-${Date.now()}`,
          content, messageType: messageType || "text",
          replyToId: null, edited: false, editedAt: null,
          voiceUrl: null, voiceDuration: null,
          createdAt: new Date().toISOString(),
          sender: { id: demoUserId, username: demoUserName, avatar: "" },
        });
      }
      return NextResponse.json({
        message: {
          id: `demo-msg-${Date.now()}`, content,
          messageType: messageType || "text", replyToId: null,
          edited: false, editedAt: null, voiceUrl: null, voiceDuration: null,
          createdAt: new Date().toISOString(),
          sender: { id: demoUserId, username: demoUserName, avatar: "" },
        },
      }, { status: 201 });
    }

    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

    const userId = session.userId;
    const { id } = await ctx!.params;
    const { content, messageType, replyToId, voiceUrl, voiceDuration } = await req.json();

    if (!content) return NextResponse.json({ error: "content обязателен" }, { status: 400 });
    if (content.length > 10_000) {
      return NextResponse.json({ error: "Сообщение слишком длинное (макс. 10 000 символов)" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();

      // Verify chat exists + sender is member
      const chatResult = await t.execute({ sql: "SELECT id FROM GroupChat WHERE id = ?", args: [id] });
      if (chatResult.rows.length === 0) {
        return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      }
      const isMember = await isMemberTurso(t, id, userId);
      if (!isMember) {
        return NextResponse.json({ error: "Только участники могут отправлять сообщения" }, { status: 403 });
      }

      // If replying, verify the replied message exists in this chat
      if (replyToId) {
        const replyResult = await t.execute({
          sql: "SELECT id FROM GroupMessage WHERE id = ? AND groupChatId = ?",
          args: [replyToId, id],
        });
        if (replyResult.rows.length === 0) {
          return NextResponse.json({ error: "Сообщение, на которое вы отвечаете, не найдено" }, { status: 404 });
        }
      }

      // Insert message
      const msgId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: `INSERT INTO GroupMessage (id, groupChatId, senderId, content, messageType, replyToId, edited, editedAt, deleted, voiceUrl, voiceDuration, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?)`,
        args: [msgId, id, userId, content, messageType || "text", replyToId || null, voiceUrl || null, voiceDuration || null, now],
      });

      // Fetch sender info for response
      const senderResult = await t.execute({
        sql: "SELECT id, username, avatar FROM User WHERE id = ?",
        args: [userId],
      });
      const senderRow = senderResult.rows[0] as Record<string, unknown> | undefined;
      const sender = senderRow ? {
        id: String(senderRow.id ?? ""),
        username: String(senderRow.username ?? ""),
        avatar: String(senderRow.avatar ?? ""),
      } : { id: userId, username: "Unknown", avatar: "" };

      return NextResponse.json({
        message: {
          id: msgId, content,
          messageType: messageType || "text", replyToId: replyToId || null,
          edited: false, editedAt: null,
          voiceUrl: voiceUrl || null, voiceDuration: voiceDuration || null,
          createdAt: now, sender,
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });
    if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
    const isMember = groupChat.members.some((m) => m.userId === userId);
    if (!isMember) return NextResponse.json({ error: "Только участники могут отправлять сообщения" }, { status: 403 });

    if (replyToId) {
      const repliedMessage = await db.groupMessage.findFirst({ where: { id: replyToId, groupChatId: id } });
      if (!repliedMessage) {
        return NextResponse.json({ error: "Сообщение, на которое вы отвечаете, не найдено" }, { status: 404 });
      }
    }

    const message = await db.groupMessage.create({
      data: {
        groupChatId: id, senderId: userId, content,
        messageType: messageType || "text", replyToId: replyToId || null,
        voiceUrl: voiceUrl || null, voiceDuration: voiceDuration || null,
      },
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });

    return NextResponse.json({
      message: {
        id: message.id, content: message.content,
        messageType: message.messageType, replyToId: message.replyToId,
        edited: message.edited, editedAt: message.editedAt,
        voiceUrl: message.voiceUrl, voiceDuration: message.voiceDuration,
        createdAt: message.createdAt, sender: message.sender,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Send group message error:", error);
    return NextResponse.json({ error: "Ошибка при отправке сообщения" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
