import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    if (!query) return NextResponse.json({ error: "q обязателен" }, { status: 400 });

    const messages = await db.message.findMany({
      where: {
        AND: [
          { OR: [{ senderId: userId }, { receiverId: userId }] },
          { deleted: false },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        receiver: { select: { id: true, username: true, avatar: true } },
      },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Search messages error:", error);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, handler);
