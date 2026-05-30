import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/tracks/[id]/comments?trackId=xxx&page=1&limit=50
// Fetch comments for a track, sorted by timestamp ASC
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
    const skip = (page - 1) * limit;

    // Check auth for liked status (optional)
    const session = await getSession();
    const currentUserId = session?.userId || null;

    const [comments, total] = await Promise.all([
      db.trackComment.findMany({
        where: { trackId },
        orderBy: { timestamp: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          username: true,
          avatar: true,
          content: true,
          timestamp: true,
          likes: true,
          createdAt: true,
        },
      }),
      db.trackComment.count({ where: { trackId } }),
    ]);

    return NextResponse.json({
      comments,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
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
      return NextResponse.json(
        { error: "Комментарий должен быть от 1 до 500 символов" },
        { status: 400 }
      );
    }

    if (typeof timestamp !== "number" || timestamp < 0) {
      return NextResponse.json(
        { error: "timestamp должен быть >= 0" },
        { status: 400 }
      );
    }

    // Get user info for the comment
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, avatar: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const comment = await db.trackComment.create({
      data: {
        trackId: String(trackId),
        userId,
        username: user.username,
        avatar: user.avatar || "",
        content: content.trim(),
        timestamp: Math.round(timestamp * 100) / 100, // 2 decimal precision
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
