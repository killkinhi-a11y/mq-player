import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function getMemberRoleTurso(t: ReturnType<typeof getTursoClient>, chatId: string, userId: string): Promise<"admin" | "member" | null> {
  const result = await t.execute({
    sql: "SELECT role FROM GroupChatMember WHERE groupChatId = ? AND userId = ?",
    args: [chatId, userId],
  });
  if (result.rows.length === 0) return null;
  const role = String((result.rows[0] as Record<string, unknown>).role ?? "member");
  return role === "admin" ? "admin" : "member";
}

async function getChatCreatorTurso(t: ReturnType<typeof getTursoClient>, chatId: string): Promise<string | null> {
  const result = await t.execute({ sql: "SELECT createdBy FROM GroupChat WHERE id = ?", args: [chatId] });
  if (result.rows.length === 0) return null;
  return String((result.rows[0] as Record<string, unknown>).createdBy ?? "");
}

// POST /api/group-chats/[id]/members — add member (admin only)
async function postHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    const userId = session.userId;
    const { id } = await ctx!.params;
    const { userId: targetUserId } = await req.json();

    if (!targetUserId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    if (isTurso()) {
      const t = getTursoClient();

      // Verify adder is admin
      const adderRole = await getMemberRoleTurso(t, id, userId);
      if (!adderRole) return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });
      if (adderRole !== "admin") return NextResponse.json({ error: "Только администраторы могут добавлять участников" }, { status: 403 });

      // Verify target user exists
      const targetUser = await database.findUserById(targetUserId);
      if (!targetUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

      // Check if already a member
      const existingMember = await getMemberRoleTurso(t, id, targetUserId);
      if (existingMember !== null) {
        return NextResponse.json({ error: "Пользователь уже является участником чата" }, { status: 409 });
      }

      // Add the member
      const memberId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: "INSERT INTO GroupChatMember (id, groupChatId, userId, role, joinedAt) VALUES (?, ?, ?, 'member', ?)",
        args: [memberId, id, targetUserId, now],
      });

      return NextResponse.json({
        member: {
          id: memberId, userId: targetUserId, role: "member", joinedAt: now,
          user: { id: targetUser.id, username: targetUser.username, avatar: targetUser.avatar },
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({ where: { id }, include: { members: true } });
    if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });

    const adderMembership = groupChat.members.find((m) => m.userId === userId);
    if (!adderMembership) return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });
    if (adderMembership.role !== "admin") return NextResponse.json({ error: "Только администраторы могут добавлять участников" }, { status: 403 });

    const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const existingMember = groupChat.members.find((m) => m.userId === targetUserId);
    if (existingMember) return NextResponse.json({ error: "Пользователь уже является участником чата" }, { status: 409 });

    const member = await db.groupChatMember.create({
      data: { groupChatId: id, userId: targetUserId, role: "member" },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    return NextResponse.json({
      member: {
        id: member.id, userId: member.userId, role: member.role,
        joinedAt: member.joinedAt, user: member.user,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Add group member error:", error);
    return NextResponse.json({ error: "Ошибка при добавлении участника" }, { status: 500 });
  }
}

// DELETE /api/group-chats/[id]/members?userId=xxx — remove member
async function deleteHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    const userId = session.userId;
    const { id } = await ctx!.params;
    const targetUserId = req.nextUrl.searchParams.get("userId");
    if (!targetUserId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    if (isTurso()) {
      const t = getTursoClient();

      // Verify remover is a member
      const removerRole = await getMemberRoleTurso(t, id, userId);
      if (!removerRole) return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });

      const isSelfRemoval = targetUserId === userId;
      const isAdmin = removerRole === "admin";
      if (!isSelfRemoval && !isAdmin) {
        return NextResponse.json({ error: "Вы можете удалить только себя из чата" }, { status: 403 });
      }

      // Verify target is a member
      const targetRole = await getMemberRoleTurso(t, id, targetUserId);
      if (targetRole === null) {
        return NextResponse.json({ error: "Пользователь не является участником чата" }, { status: 404 });
      }

      // Don't allow removing the creator (unless self-removal)
      const creator = await getChatCreatorTurso(t, id);
      if (!creator) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });
      if (creator === targetUserId && !isSelfRemoval) {
        return NextResponse.json({ error: "Невозможно удалить создателя чата" }, { status: 403 });
      }

      // Remove the member
      await t.execute({
        sql: "DELETE FROM GroupChatMember WHERE groupChatId = ? AND userId = ?",
        args: [id, targetUserId],
      });

      return NextResponse.json({ message: "Участник удалён из чата" });
    }

    const { db } = await import("@/lib/db");
    const groupChat = await db.groupChat.findUnique({ where: { id }, include: { members: true } });
    if (!groupChat) return NextResponse.json({ error: "Групповой чат не найден" }, { status: 404 });

    const removerMembership = groupChat.members.find((m) => m.userId === userId);
    if (!removerMembership) return NextResponse.json({ error: "Вы не являетесь участником этого чата" }, { status: 403 });

    const isSelfRemoval = targetUserId === userId;
    const isAdmin = removerMembership.role === "admin";
    if (!isSelfRemoval && !isAdmin) {
      return NextResponse.json({ error: "Вы можете удалить только себя из чата" }, { status: 403 });
    }

    const targetMembership = groupChat.members.find((m) => m.userId === targetUserId);
    if (!targetMembership) return NextResponse.json({ error: "Пользователь не является участником чата" }, { status: 404 });

    if (groupChat.createdBy === targetUserId && !isSelfRemoval) {
      return NextResponse.json({ error: "Невозможно удалить создателя чата" }, { status: 403 });
    }

    await db.groupChatMember.delete({ where: { id: targetMembership.id } });
    return NextResponse.json({ message: "Участник удалён из чата" });
  } catch (error) {
    console.error("Remove group member error:", error);
    return NextResponse.json({ error: "Ошибка при удалении участника" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);
