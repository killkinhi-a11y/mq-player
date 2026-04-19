import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await ctx!.params;
    const user = await db.user.findUnique({
      where: { id },
      select: { lastSeen: true },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const isOnline = user.lastSeen ? (Date.now() - user.lastSeen.getTime()) < 120000 : false;
    return NextResponse.json({
      online: isOnline,
      lastSeen: user.lastSeen?.toISOString() || null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
