import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/tracks/[id]/comments?trackId=xxx&page=1&limit=50
async function getHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const params = await ctx!.params;
    const trackId = new URL(req.url).searchParams.get("trackId") || params.id;

    if (!trackId) {
      return NextResponse.json({ error: "trackId обязателен" }, { status: 400 });
    }

    const page = Math.max(1, Number(new URL(req.url).searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 50));
    const offset = (page - 1) * limit;

    // Check auth for liked status (optional — getHandler doesn't actually use it,
    // but kept for backwards compat in case client expects user-context).
    const session = await getSession();

    if (isTurso()) {
      const t = getTursoClient();
      const [commentsResult, countResult] = await Promise.all([
        t.execute({
          sql: "SELECT id, userId, username, avatar, content, timestamp, likes, createdAt FROM TrackComment WHERE trackId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
          args: [trackId, limit, offset],
        }),
        t.execute({ sql: "SELECT COUNT(*) as c FROM TrackComment WHERE trackId = ?", args: [trackId] }),
      ]);
      const total = Number(countResult.rows[0]?.c ?? 0);
      const comments = commentsResult.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          userId: String(row.userId ?? ""),
          username: String(row.username ?? ""),
          avatar: String(row.avatar ?? ""),
          content: String(row.content ?? ""),
          timestamp: Number(row.timestamp ?? 0),
          likes: Number(row.likes ?? 0),
          createdAt: String(row.createdAt ?? ""),
        };
      });
      return NextResponse.json({ comments, total, page, limit, pages: Math.ceil(total / limit) });
    }

    const { db } = await import("@/lib/db");
    const [comments, total] = await Promise.all([
      db.trackComment.findMany({
        where: { trackId },
        orderBy: { timestamp: "asc" },
        skip: offset,
        take: limit,
        select: {
          id: true, userId: true, username: true, avatar: true,
          content: true, timestamp: true, likes: true, createdAt: true,
        },
      }),
      db.trackComment.count({ where: { trackId } }),
    ]);
    return NextResponse.json({
      comments, total, page, limit, pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/tracks/[id]/comments error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке комментариев" }, { status: 500 });
  }
}

// POST /api/tracks/[id]/comments — add a comment
async function postHandler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;

    const { trackId, content, timestamp } = await req.json();

    if (!trackId || content === undefined || timestamp === undefined) {
      return NextResponse.json(
        { error: "trackId, content и timestamp обязательны" },
        { status: 400 }
      );
    }
    if (typeof content !== "string" || content.trim().length === 0 || content.length > 500) {
      return NextResponse.json({ error: "Комментарий должен быть от 1 до 500 символов" }, { status: 400 });
    }
    if (typeof timestamp !== "number" || timestamp < 0) {
      return NextResponse.json({ error: "timestamp должен быть >= 0" }, { status: 400 });
    }

    const user = await database.findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const roundedTs = Math.round(timestamp * 100) / 100;

    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: `INSERT INTO TrackComment (id, trackId, userId, username, avatar, content, timestamp, likes, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [id, String(trackId), userId, user.username, user.avatar || "", content.trim(), roundedTs, now],
      });
      return NextResponse.json({
        comment: {
          id, trackId: String(trackId), userId,
          username: user.username, avatar: user.avatar || "",
          content: content.trim(), timestamp: roundedTs, likes: 0, createdAt: now,
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const comment = await db.trackComment.create({
      data: {
        trackId: String(trackId),
        userId,
        username: user.username,
        avatar: user.avatar || "",
        content: content.trim(),
        timestamp: roundedTs,
      },
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tracks/[id]/comments error:", error);
    return NextResponse.json({ error: "Ошибка при добавлении комментария" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
