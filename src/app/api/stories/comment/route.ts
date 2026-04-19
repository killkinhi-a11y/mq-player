import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// POST /api/stories/comment — comment on a story
async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { storyId, content } = await req.json();

    if (!storyId || !content) {
      return NextResponse.json({ error: "storyId и content обязательны" }, { status: 400 });
    }

    if (typeof content !== "string" || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json({ error: "Комментарий должен быть от 1 до 1000 символов" }, { status: 400 });
    }

    // Check if story exists
    const story = await db.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "История не найдена" }, { status: 404 });
    }

    // Check if story is expired
    if (story.expiresAt < new Date()) {
      return NextResponse.json({ error: "История истекла" }, { status: 410 });
    }

    const comment = await db.storyComment.create({
      data: { storyId, userId, content },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Story comment error:", error);
    return NextResponse.json({ error: "Ошибка при комментировании" }, { status: 500 });
  }
}

// GET /api/stories/comment?storyId=xxx — get comments for a story
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get("storyId");

    if (!storyId) {
      return NextResponse.json({ error: "storyId обязателен" }, { status: 400 });
    }

    const comments = await db.storyComment.findMany({
      where: { storyId },
      include: {
        user: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Get story comments error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке комментариев" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
