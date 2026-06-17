import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";

// POST /api/stories/like — like or unlike a story
async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { storyId } = await req.json();

    if (!storyId) {
      return NextResponse.json({ error: "storyId обязателен" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      // Check story exists
      const storyResult = await t.execute({ sql: "SELECT id FROM Story WHERE id = ?", args: [storyId] });
      if (storyResult.rows.length === 0) {
        return NextResponse.json({ error: "История не найдена" }, { status: 404 });
      }
      // Check existing like
      const existingResult = await t.execute({
        sql: "SELECT id FROM StoryLike WHERE storyId = ? AND userId = ?",
        args: [storyId, userId],
      });
      if (existingResult.rows.length > 0) {
        await t.execute({ sql: "DELETE FROM StoryLike WHERE storyId = ? AND userId = ?", args: [storyId, userId] });
        return NextResponse.json({ liked: false, message: "Лайк убран" });
      }
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await t.execute({
        sql: "INSERT INTO StoryLike (id, storyId, userId, createdAt) VALUES (?, ?, ?, ?)",
        args: [id, storyId, userId, new Date().toISOString()],
      });
      return NextResponse.json({ liked: true, message: "История понравилась" });
    }

    const { db } = await import("@/lib/db");
    const story = await db.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: "История не найдена" }, { status: 404 });
    }
    const existingLike = await db.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });
    if (existingLike) {
      await db.storyLike.delete({ where: { id: existingLike.id } });
      return NextResponse.json({ liked: false, message: "Лайк убран" });
    }
    await db.storyLike.create({ data: { storyId, userId } });
    return NextResponse.json({ liked: true, message: "История понравилась" });
  } catch (error) {
    console.error("Story like error:", error);
    return NextResponse.json({ error: "Ошибка при лайке" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(handler));
