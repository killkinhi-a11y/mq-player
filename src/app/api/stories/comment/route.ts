import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";

// POST /api/stories/comment — comment on a story
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { storyId, content } = await req.json();

    if (!storyId || !content) {
      return NextResponse.json({ error: "storyId и content обязательны" }, { status: 400 });
    }

    if (typeof content !== "string" || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json({ error: "Комментарий должен быть от 1 до 1000 символов" }, { status: 400 });
    }

    // Check story exists + expiry
    let storyFound: { id: string; expiresAt: string } | null = null;
    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({ sql: "SELECT id, expiresAt FROM Story WHERE id = ?", args: [storyId] });
      if (r.rows.length > 0) {
        const row = r.rows[0] as Record<string, unknown>;
        storyFound = { id: String(row.id ?? ""), expiresAt: String(row.expiresAt ?? "") };
      }
    } else {
      const { db } = await import("@/lib/db");
      const s = await db.story.findUnique({ where: { id: storyId } });
      if (s) storyFound = { id: s.id, expiresAt: s.expiresAt.toISOString() };
    }
    if (!storyFound) {
      return NextResponse.json({ error: "История не найдена" }, { status: 404 });
    }
    if (new Date(storyFound.expiresAt) < new Date()) {
      return NextResponse.json({ error: "История истекла" }, { status: 410 });
    }

    // Get user for response
    const user = await database.findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: "INSERT INTO StoryComment (id, storyId, userId, content, createdAt) VALUES (?, ?, ?, ?, ?)",
        args: [id, storyId, userId, content, now],
      });
      return NextResponse.json({
        comment: {
          id, storyId, userId, content, createdAt: now,
          user: { id: user.id, username: user.username },
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const comment = await db.storyComment.create({
      data: { storyId, userId, content },
      include: { user: { select: { id: true, username: true } } },
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Story comment error:", error);
    return NextResponse.json({ error: "Ошибка при комментировании" }, { status: 500 });
  }
}

// GET /api/stories/comment?storyId=xxx — get comments for a story
async function getHandler(req: NextRequest, _ctx: { userId: string; userRole: string }) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get("storyId");

    if (!storyId) {
      return NextResponse.json({ error: "storyId обязателен" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const result = await t.execute({
        sql: `SELECT c.*, u.id as u_id, u.username as u_username
              FROM StoryComment c
              JOIN User u ON c.userId = u.id
              WHERE c.storyId = ?
              ORDER BY c.createdAt DESC`,
        args: [storyId],
      });
      const comments = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          storyId: String(row.storyId ?? ""),
          userId: String(row.userId ?? ""),
          content: String(row.content ?? ""),
          createdAt: String(row.createdAt ?? ""),
          user: { id: String(row.u_id ?? ""), username: String(row.u_username ?? "") },
        };
      });
      return NextResponse.json({ comments });
    }

    const { db } = await import("@/lib/db");
    const comments = await db.storyComment.findMany({
      where: { storyId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Get story comments error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке комментариев" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
