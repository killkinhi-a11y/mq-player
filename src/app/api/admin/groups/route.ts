import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth, validateContentType } from "@/lib/withAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/groups — list group chats with owner + member count
async function getHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));
    const search = (searchParams.get("search") || "").trim().slice(0, 100);

    if (isTurso()) {
      const t = getTursoClient();
      const searchClause = search ? "WHERE gc.name LIKE ?" : "";
      const args: (string | number)[] = search ? [`%${search}%`] : [];

      const totalR = await t.execute({
        sql: `SELECT COUNT(*) as c FROM GroupChat ${searchClause}`,
        args,
      });
      const rowsR = await t.execute({
        sql: `SELECT gc.id, gc.name, gc.description, gc.avatar, gc.createdAt, gc.updatedAt,
                 gc.createdBy,
                 ou.username as owner_username,
                 (SELECT COUNT(*) FROM GroupChatMember m WHERE m.groupChatId = gc.id) as memberCount,
                 (SELECT COUNT(*) FROM GroupMessage gm WHERE gm.groupChatId = gc.id AND gm.deleted = 0) as messageCount
              FROM GroupChat gc
              LEFT JOIN User ou ON ou.id = gc.createdBy
              ${searchClause}
              ORDER BY gc.updatedAt DESC
              LIMIT ? OFFSET ?`,
        args: [...args, limit, (page - 1) * limit],
      });

      const groups = rowsR.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          avatar: String(row.avatar ?? ""),
          createdAt: String(row.createdAt ?? ""),
          updatedAt: String(row.updatedAt ?? ""),
          createdBy: String(row.createdBy ?? ""),
          ownerUsername: row.owner_username ? String(row.owner_username) : null,
          memberCount: Number(row.memberCount ?? 0),
          messageCount: Number(row.messageCount ?? 0),
        };
      });

      return NextResponse.json({
        groups,
        total: Number(totalR.rows[0]?.c ?? 0),
        page,
        limit,
        pages: Math.ceil(Number(totalR.rows[0]?.c ?? 0) / limit),
      });
    }

    // ── Prisma path ──
    const { db } = await import("@/lib/db");
    const where = search ? { name: { contains: search } } : {};
    const [total, chats] = await Promise.all([
      db.groupChat.count({ where }),
      db.groupChat.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { username: true } },
          _count: {
            select: {
              members: true,
              messages: { where: { deleted: false } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      groups: chats.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        avatar: c.avatar,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        createdBy: c.createdBy,
        ownerUsername: c.creator?.username ?? null,
        memberCount: c._count.members,
        messageCount: c._count.messages,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin groups list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки групп" }, { status: 500 });
  }
}

// DELETE /api/admin/groups — delete a group chat (admin)
async function deleteHandler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }
    const { groupId } = await req.json();
    if (!groupId) {
      return NextResponse.json({ error: "groupId обязателен" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const exists = await t.execute({
        sql: "SELECT id, name FROM GroupChat WHERE id = ?",
        args: [groupId],
      });
      if (exists.rows.length === 0) {
        return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
      }
      // Cascade order matches the schema's onDelete: Cascade.
      await t.batch([
        { sql: "DELETE FROM GroupMessage WHERE groupChatId = ?", args: [groupId] },
        { sql: "DELETE FROM GroupChatMember WHERE groupChatId = ?", args: [groupId] },
        { sql: "DELETE FROM GroupChat WHERE id = ?", args: [groupId] },
      ]);
      return NextResponse.json({ ok: true, groupId });
    }

    const { db } = await import("@/lib/db");
    const existing = await db.groupChat.findUnique({ where: { id: groupId } });
    if (!existing) {
      return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
    }
    await db.groupChat.delete({ where: { id: groupId } });
    return NextResponse.json({ ok: true, groupId });
  } catch (error) {
    console.error("Admin group delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления группы" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(getHandler));
export const DELETE = withRateLimit(RATE_LIMITS.admin, withAdminAuth(deleteHandler));
