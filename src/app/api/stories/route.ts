import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stories?userId=xxx — get stories from a specific user
// GET /api/stories?all=true — get all active stories (feed)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
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

    if (userId) {
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
    }

    return NextResponse.json({ error: "Укажите userId или all=true" }, { status: 400 });
  } catch (error) {
    console.error("Get stories error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке историй" }, { status: 500 });
  }
}

// POST /api/stories — create a new story
export async function POST(req: NextRequest) {
  try {
    const { userId, type, content, bgColor, textColor } = await req.json();

    if (!userId || !content) {
      return NextResponse.json({ error: "userId и content обязательны" }, { status: 400 });
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
