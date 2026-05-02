import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// POST /api/stories/like — like or unlike a story
async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { storyId } = await req.json();

    if (!storyId) {
      return NextResponse.json({ error: "storyId обязателен" }, { status: 400 });
    }

    // Check if story exists
    const story = await db.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "История не найдена" }, { status: 404 });
    }

    // Check if already liked
    const existingLike = await db.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    if (existingLike) {
      // Unlike
      await db.storyLike.delete({ where: { id: existingLike.id } });
      return NextResponse.json({ liked: false, message: "Лайк убран" });
    } else {
      // Like
      await db.storyLike.create({ data: { storyId, userId } });
      return NextResponse.json({ liked: true, message: "История понравилась" });
    }
  } catch (error) {
    console.error("Story like error:", error);
    return NextResponse.json({ error: "Ошибка при лайке" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, handler);
