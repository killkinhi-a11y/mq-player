import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const query = req.nextUrl.searchParams.get("q");
    if (!userId || !query) return NextResponse.json({ error: "userId и q обязательны" }, { status: 400 });

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
