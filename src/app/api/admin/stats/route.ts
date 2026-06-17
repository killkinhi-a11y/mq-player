import { NextRequest, NextResponse } from "next/server";
import { database, isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth } from "@/lib/withAuth";

async function handler(
  _req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (isTurso()) {
      const t = getTursoClient();
      const [
        totalUsersR,
        confirmedUsersR,
        blockedUsersR,
        todayUsersR,
        weekUsersR,
        monthUsersR,
        totalMessagesR,
        totalStoriesR,
        totalPlaylistsR,
        recentR,
      ] = await Promise.all([
        t.execute("SELECT COUNT(*) as c FROM User"),
        t.execute("SELECT COUNT(*) as c FROM User WHERE confirmed = 1"),
        t.execute("SELECT COUNT(*) as c FROM User WHERE blocked = 1"),
        t.execute({ sql: "SELECT COUNT(*) as c FROM User WHERE createdAt >= ?", args: [startOfDay.toISOString()] }),
        t.execute({ sql: "SELECT COUNT(*) as c FROM User WHERE createdAt >= ?", args: [startOfWeek.toISOString()] }),
        t.execute({ sql: "SELECT COUNT(*) as c FROM User WHERE createdAt >= ?", args: [startOfMonth.toISOString()] }),
        t.execute("SELECT COUNT(*) as c FROM Message"),
        t.execute("SELECT COUNT(*) as c FROM Story"),
        t.execute("SELECT COUNT(*) as c FROM Playlist"),
        t.execute({
          sql: "SELECT id, username, email, confirmed, blocked, role, createdAt FROM User ORDER BY createdAt DESC LIMIT 10",
          args: [],
        }),
      ]);
      const parseBool = (v: unknown) => v === 1 || v === true || v === "1" || v === "true";
      return NextResponse.json({
        totalUsers: Number(totalUsersR.rows[0]?.c ?? 0),
        confirmedUsers: Number(confirmedUsersR.rows[0]?.c ?? 0),
        blockedUsers: Number(blockedUsersR.rows[0]?.c ?? 0),
        todayUsers: Number(todayUsersR.rows[0]?.c ?? 0),
        weekUsers: Number(weekUsersR.rows[0]?.c ?? 0),
        monthUsers: Number(monthUsersR.rows[0]?.c ?? 0),
        totalMessages: Number(totalMessagesR.rows[0]?.c ?? 0),
        totalStories: Number(totalStoriesR.rows[0]?.c ?? 0),
        totalPlaylists: Number(totalPlaylistsR.rows[0]?.c ?? 0),
        recentRegistrations: recentR.rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            username: String(row.username ?? ""),
            email: String(row.email ?? ""),
            confirmed: parseBool(row.confirmed),
            blocked: parseBool(row.blocked),
            role: String(row.role ?? "user"),
            createdAt: String(row.createdAt ?? ""),
          };
        }),
      });
    }

    // Prisma fallback
    const { db } = await import("@/lib/db");
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
          id: true, username: true, email: true, confirmed: true, blocked: true,
          role: true, createdAt: true,
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
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(handler));
