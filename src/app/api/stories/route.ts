import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/stories?all=true — get all active stories (feed)
// GET /api/stories — get stories from the authenticated user
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all");

    const now = new Date();

    if (all === "true") {
      // Get all active (non-expired) stories for feed
      const stories = await db.story.findMany({
        where: { expiresAt: { gt: now } },
        include: {
          user: { select: { id: true, username: true } },
          likes: { select: { userId: true } },
          comments: {
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ stories });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;

    const stories = await db.story.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      include: {
        user: { select: { id: true, username: true } },
        likes: { select: { userId: true } },
        comments: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ stories });
  } catch (error) {
    console.error("Get stories error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке историй" }, { status: 500 });
  }
}

// POST /api/stories — create a new story
async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { type, content, bgColor, textColor } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "content обязателен" }, { status: 400 });
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Stories expire after 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = await db.story.create({
      data: {
        userId,
        type: type || "text",
        content,
        bgColor: bgColor || "#1a1a2e",
        textColor: textColor || "#ffffff",
        expiresAt,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ story }, { status: 201 });
  } catch (error) {
    console.error("Create story error:", error);
    return NextResponse.json({ error: "Ошибка при создании истории" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
