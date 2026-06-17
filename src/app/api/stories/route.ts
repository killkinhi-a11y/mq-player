import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";

interface StoryWithRelations {
  id: string;
  userId: string;
  type: string;
  content: string;
  bgColor: string;
  textColor: string;
  createdAt: string;
  expiresAt: string;
  user: { id: string; username: string };
  likes: Array<{ userId: string }>;
  comments: Array<{
    id: string; storyId: string; userId: string; content: string; createdAt: string;
    user: { id: string; username: string };
  }>;
}

async function fetchStories(whereSql: string, args: (string | number)[], limit?: number): Promise<StoryWithRelations[]> {
  if (isTurso()) {
    const t = getTursoClient();
    const limitClause = limit ? `LIMIT ${Number(limit)}` : "";
    const sql = `SELECT s.*, u.id as u_id, u.username as u_username
                 FROM Story s
                 JOIN User u ON s.userId = u.id
                 WHERE ${whereSql}
                 ORDER BY s.createdAt DESC
                 ${limitClause}`;
    const result = await t.execute({ sql, args });
    const storyIds = result.rows.map((r) => String((r as Record<string, unknown>).id));
    if (storyIds.length === 0) return [];

    // Fetch likes + comments in parallel
    const [likesResult, commentsResult] = await Promise.all([
      t.execute({
        sql: `SELECT storyId, userId FROM StoryLike WHERE storyId IN (${storyIds.map(() => "?").join(",")})`,
        args: storyIds,
      }),
      t.execute({
        sql: `SELECT c.*, u.id as u_id, u.username as u_username
              FROM StoryComment c
              JOIN User u ON c.userId = u.id
              WHERE c.storyId IN (${storyIds.map(() => "?").join(",")})
              ORDER BY c.createdAt DESC`,
        args: storyIds,
      }),
    ]);
    const likesByStory = new Map<string, Array<{ userId: string }>>();
    for (const r of likesResult.rows) {
      const row = r as Record<string, unknown>;
      const sid = String(row.storyId ?? "");
      if (!likesByStory.has(sid)) likesByStory.set(sid, []);
      likesByStory.get(sid)!.push({ userId: String(row.userId ?? "") });
    }
    const commentsByStory = new Map<string, any[]>();
    for (const r of commentsResult.rows) {
      const row = r as Record<string, unknown>;
      const sid = String(row.storyId ?? "");
      if (!commentsByStory.has(sid)) commentsByStory.set(sid, []);
      commentsByStory.get(sid)!.push({
        id: String(row.id ?? ""),
        storyId: sid,
        userId: String(row.userId ?? ""),
        content: String(row.content ?? ""),
        createdAt: String(row.createdAt ?? ""),
        user: { id: String(row.u_id ?? ""), username: String(row.u_username ?? "") },
      });
    }

    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      const sid = String(row.id ?? "");
      return {
        id: sid,
        userId: String(row.userId ?? ""),
        type: String(row.type ?? "text"),
        content: String(row.content ?? ""),
        bgColor: String(row.bgColor ?? "#1a1a2e"),
        textColor: String(row.textColor ?? "#ffffff"),
        createdAt: String(row.createdAt ?? ""),
        expiresAt: String(row.expiresAt ?? ""),
        user: { id: String(row.u_id ?? ""), username: String(row.u_username ?? "") },
        likes: likesByStory.get(sid) ?? [],
        comments: commentsByStory.get(sid) ?? [],
      };
    });
  }

  const { db } = await import("@/lib/db");
  const prismaWhere: Record<string, unknown> = whereSql.includes("expiresAt >")
    ? { expiresAt: { gt: new Date() } }
    : whereSql.includes("userId =")
      // Extract userId from args[0] — used for "my stories" filter
      ? { userId: args[0], expiresAt: { gt: new Date() } }
      : {};
  const stories = await db.story.findMany({
    where: prismaWhere,
    include: {
      user: { select: { id: true, username: true } },
      likes: { select: { userId: true } },
      comments: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return stories.map((s) => ({
    id: s.id, userId: s.userId, type: s.type, content: s.content,
    bgColor: s.bgColor, textColor: s.textColor,
    createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(),
    user: { id: s.user.id, username: s.user.username },
    likes: s.likes, comments: s.comments.map((c) => ({
      id: c.id, storyId: c.storyId, userId: c.userId, content: c.content,
      createdAt: c.createdAt.toISOString(),
      user: { id: c.user.id, username: c.user.username },
    })),
  }));
}

// GET /api/stories?all=true — get all active stories (feed)
// GET /api/stories — get stories from the authenticated user
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all");
    const { userId } = ctx;

    if (all === "true") {
      // Get all active (non-expired) stories for feed
      const stories = isTurso()
        ? await fetchStories("s.expiresAt > ?", [new Date().toISOString()], 100)
        : await fetchStories("expiresAt >", [], 100);
      return NextResponse.json({ stories });
    }

    // Get my stories
    const stories = await fetchStories("s.userId = ? AND s.expiresAt > ?", [userId, new Date().toISOString()]);
    return NextResponse.json({ stories });
  } catch (error) {
    console.error("Get stories error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке историй" }, { status: 500 });
  }
}

// POST /api/stories — create a new story
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { type, content, bgColor, textColor } = await req.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content обязателен" }, { status: 400 });
    }
    if (content.length > 500_000) {
      return NextResponse.json({ error: "Содержимое слишком большое (макс. 500KB)" }, { status: 400 });
    }

    const user = await database.findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Stories expire after 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: `INSERT INTO Story (id, userId, type, content, bgColor, textColor, createdAt, expiresAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, userId, type || "text", content, bgColor || "#1a1a2e", textColor || "#ffffff", now, expiresAt.toISOString()],
      });
      return NextResponse.json({
        story: {
          id, userId, type: type || "text", content,
          bgColor: bgColor || "#1a1a2e", textColor: textColor || "#ffffff",
          createdAt: now, expiresAt: expiresAt.toISOString(),
          user: { id: user.id, username: user.username },
          likes: [], comments: [],
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const story = await db.story.create({
      data: {
        userId,
        type: type || "text",
        content,
        bgColor: bgColor || "#1a1a2e",
        textColor: textColor || "#ffffff",
        expiresAt,
      },
      include: { user: { select: { id: true, username: true } } },
    });

    return NextResponse.json({ story }, { status: 201 });
  } catch (error) {
    console.error("Create story error:", error);
    return NextResponse.json({ error: "Ошибка при создании истории" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
