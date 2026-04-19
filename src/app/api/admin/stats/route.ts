import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function verifyAdmin(req: NextRequest): Promise<{ userId: string; body: Record<string, unknown> } | NextResponse> {
  let body: Record<string, unknown> = {};
  let userId: string | undefined;
  // Try body first (POST/PATCH), then query param (GET)
  try { body = await req.json(); userId = body?.userId as string | undefined; } catch { /* body parse failed */ }
  if (!userId) userId = req.nextUrl.searchParams.get("userId") || undefined;
  if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  const admin = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return { userId, body };
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      confirmedUsers,
      blockedUsers,
      todayUsers,
      weekUsers,
      monthUsers,
      totalMessages,
      totalStories,
      totalPlaylists,
      recentRegistrations,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { confirmed: true } }),
      db.user.count({ where: { blocked: true } }),
      db.user.count({ where: { createdAt: { gte: startOfDay } } }),
      db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.message.count(),
      db.story.count(),
      db.playlist.count(),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          username: true,
          email: true,
          confirmed: true,
          blocked: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      totalUsers,
      confirmedUsers,
      blockedUsers,
      todayUsers,
      weekUsers,
      monthUsers,
      totalMessages,
      totalStories,
      totalPlaylists,
      recentRegistrations,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Ошибка загрузки статистики" }, { status: 500 });
  }
}
