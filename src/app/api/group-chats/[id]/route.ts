import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/group-chats/[id] — group chat details with members and last 50 messages
async function getHandler(
  _req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { id } = await ctx!.params;

    if (isTurso()) {
      const t = getTursoClient();

      // Step 1: fetch group chat + verify membership
      const chatResult = await t.execute({
        sql: `SELECT gc.*, c.id as c_id, c.username as c_username, c.avatar as c_avatar
              FROM GroupChat gc
              JOIN User c ON gc.createdBy = c.id
              WHERE gc.id = ?`,
        args: [id],
      });
      if (chatResult.rows.length === 0) {
        return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      }
      const chatRow = chatResult.rows[0] as Record<string, unknown>;

      // Step 2: verify membership
      const memberResult = await t.execute({
        sql: "SELECT id FROM GroupChatMember WHERE groupChatId = ? AND userId = ?",
        args: [id, userId],
      });
      if (memberResult.rows.length === 0) {
        return NextResponse.json({ error: "У вас нет доступа к этому чату" }, { status: 403 });
      }

      // Step 3: fetch all members with user info
      const membersResult = await t.execute({
        sql: `SELECT m.*, u.id as u_id, u.username as u_username, u.avatar as u_avatar
              FROM GroupChatMember m
              JOIN User u ON m.userId = u.id
              WHERE m.groupChatId = ?
              ORDER BY m.joinedAt ASC`,
        args: [id],
      });
      const members = membersResult.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          userId: String(row.userId ?? ""),
          role: String(row.role ?? "member"),
          joinedAt: String(row.joinedAt ?? ""),
          user: {
            id: String(row.u_id ?? ""),
            username: String(row.u_username ?? ""),
            avatar: String(row.u_avatar ?? ""),
          },
        };
      });

      // Step 4: fetch last 50 non-deleted messages (newest first via DESC)
      const messagesResult = await t.execute({
        sql: `SELECT m.*, u.id as u_id, u.username as u_username, u.avatar as u_avatar
              FROM GroupMessage m
              JOIN User u ON m.senderId = u.id
              WHERE m.groupChatId = ? AND m.deleted = 0
              ORDER BY m.createdAt DESC
              LIMIT 50`,
        args: [id],
      });
      // Reverse for chronological order
      const messages = messagesResult.rows.reverse().map((r) => {
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

      return NextResponse.json({
        groupChat: {
          id: String(chatRow.id ?? ""),
          name: String(chatRow.name ?? ""),
          description: String(chatRow.description ?? ""),
          avatar: String(chatRow.avatar ?? ""),
          createdBy: String(chatRow.createdBy ?? ""),
          createdAt: String(chatRow.createdAt ?? ""),
          updatedAt: String(chatRow.updatedAt ?? ""),
          creator: {
            id: String(chatRow.c_id ?? ""),
            username: String(chatRow.c_username ?? ""),
            avatar: String(chatRow.c_avatar ?? ""),
          },
          memberCount: members.length,
          members,
          messages,
        },
      });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatar: true } } } },
        messages: {
          where: { deleted: false },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { sender: { select: { id: true, username: true, avatar: true } } },
        },
        creator: { select: { id: true, username: true, avatar: true } },
      },
    });
    if (!groupChat) {
      return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
    }
    const isMember = groupChat.members.some((m) => m.userId === userId);
    if (!isMember) {
      return NextResponse.json({ error: "У вас нет доступа к этому чату" }, { status: 403 });
    }
    const messages = [...groupChat.messages].reverse();
    return NextResponse.json({
      groupChat: {
        id: groupChat.id, name: groupChat.name, description: groupChat.description,
        avatar: groupChat.avatar, createdBy: groupChat.createdBy,
        createdAt: groupChat.createdAt, updatedAt: groupChat.updatedAt,
        creator: groupChat.creator,
        memberCount: groupChat.members.length,
        members: groupChat.members.map((m) => ({
          id: m.id, userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user,
        })),
        messages: messages.map((m) => ({
          id: m.id, content: m.content, messageType: m.messageType, replyToId: m.replyToId,
          edited: m.edited, editedAt: m.editedAt, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
          createdAt: m.createdAt, sender: m.sender,
        })),
      },
    });
  } catch (error) {
    console.error("Get group chat details error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке данных чата" }, { status: 500 });
  }
}

// PATCH /api/group-chats/[id] — update group chat (admin only)
async function patchHandler(
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
    const { name, description, avatar } = await req.json();

    // Verify admin membership
    let isAdmin = false;
    if (isTurso()) {
      const t = getTursoClient();
      const memberResult = await t.execute({
        sql: "SELECT role FROM GroupChatMember WHERE groupChatId = ? AND userId = ?",
        args: [id, userId],
      });
      if (memberResult.rows.length === 0) {
        return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });
      }
      isAdmin = String((memberResult.rows[0] as Record<string, unknown>).role ?? "member") === "admin";
    } else {
      const { db } = await import("@/lib/db");
      const groupChat = await db.groupChat.findUnique({ where: { id }, include: { members: true } });
      if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      const membership = groupChat.members.find((m) => m.userId === userId);
      if (!membership) return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });
      isAdmin = membership.role === "admin";
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Только администраторы могут изменять чат" }, { status: 403 });
    }

    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const sets: string[] = [];
      const args: (string | number)[] = [];
      if (name !== undefined) { sets.push("name = ?"); args.push(name); }
      if (description !== undefined) { sets.push("description = ?"); args.push(description); }
      if (avatar !== undefined) { sets.push("avatar = ?"); args.push(avatar); }
      sets.push("updatedAt = ?");
      args.push(new Date().toISOString());
      args.push(id);
      await t.execute({ sql: `UPDATE GroupChat SET ${sets.join(", ")} WHERE id = ?`, args });

      // Fetch updated row for response
      const r = await t.execute({ sql: "SELECT * FROM GroupChat WHERE id = ?", args: [id] });
      const row = r.rows[0] as Record<string, unknown>;
      return NextResponse.json({
        groupChat: {
          id: String(row.id ?? ""), name: String(row.name ?? ""),
          description: String(row.description ?? ""), avatar: String(row.avatar ?? ""),
          createdBy: String(row.createdBy ?? ""),
          createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
        },
      });
    }

    const { db } = await import("@/lib/db");
    const updated = await db.groupChat.update({ where: { id }, data: updateData });
    return NextResponse.json({
      groupChat: {
        id: updated.id, name: updated.name, description: updated.description,
        avatar: updated.avatar, createdBy: updated.createdBy,
        createdAt: updated.createdAt, updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update group chat error:", error);
    return NextResponse.json({ error: "Ошибка при обновлении чата" }, { status: 500 });
  }
}

// DELETE /api/group-chats/[id] — delete group chat (creator only)
async function deleteHandler(
  _req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    const userId = session.userId;
    const { id } = await ctx!.params;

    if (isTurso()) {
      const t = getTursoClient();
      const chatResult = await t.execute({ sql: "SELECT createdBy FROM GroupChat WHERE id = ?", args: [id] });
      if (chatResult.rows.length === 0) {
        return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      }
      const createdBy = String((chatResult.rows[0] as Record<string, unknown>).createdBy ?? "");
      if (createdBy !== userId) {
        return NextResponse.json({ error: "Только создатель может удалить чат" }, { status: 403 });
      }
      // Cascade-delete members + messages + chat
      await t.batch([
        { sql: "DELETE FROM GroupChatMember WHERE groupChatId = ?", args: [id] },
        { sql: "DELETE FROM GroupMessage WHERE groupChatId = ?", args: [id] },
        { sql: "DELETE FROM GroupChat WHERE id = ?", args: [id] },
      ]);
      return NextResponse.json({ message: "Чат успешно удалён" });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({ where: { id } });
    if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
    if (groupChat.createdBy !== userId) {
      return NextResponse.json({ error: "Только создатель может удалить чат" }, { status: 403 });
    }
    await db.groupChat.delete({ where: { id } });
    return NextResponse.json({ message: "Чат успешно удалён" });
  } catch (error) {
    console.error("Delete group chat error:", error);
    return NextResponse.json({ error: "Ошибка при удалении чата" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const PATCH = withRateLimit(RATE_LIMITS.write, patchHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);
