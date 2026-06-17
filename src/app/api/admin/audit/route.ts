import { NextRequest, NextResponse } from "next/server";
import { database, isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAdminAuth } from "@/lib/withAuth";

async function handler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
    const actionFilter = searchParams.get("action") || "";

    // The Turso adapter's findAuditLogs doesn't support action filter or
    // pagination yet — use raw Turso client for filtered queries.
    if (isTurso()) {
      const t = getTursoClient();
      const offset = (page - 1) * limit;
      const where = actionFilter ? "WHERE action = ?" : "";
      const args: (string | number)[] = actionFilter ? [actionFilter, limit, offset] : [limit, offset];
      const [logsResult, countResult] = await Promise.all([
        t.execute({
          sql: `SELECT * FROM AuditLog ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
          args,
        }),
        t.execute(
          actionFilter
            ? { sql: "SELECT COUNT(*) as count FROM AuditLog WHERE action = ?", args: [actionFilter] }
            : { sql: "SELECT COUNT(*) as count FROM AuditLog", args: [] }
        ),
      ]);
      const total = Number(countResult.rows[0]?.count ?? 0);
      const logs = logsResult.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          adminId: String(row.adminId ?? ""),
          action: String(row.action ?? ""),
          targetId: row.targetId != null ? String(row.targetId) : null,
          details: row.details != null ? String(row.details) : null,
          createdAt: String(row.createdAt ?? ""),
        };
      });
      // Hydrate admin usernames/emails
      const adminIds = [...new Set(logs.map((l) => l.adminId))];
      if (adminIds.length > 0) {
        const placeholders = adminIds.map(() => "?").join(",");
        const adminResult = await t.execute({
          sql: `SELECT id, username, email FROM User WHERE id IN (${placeholders})`,
          args: adminIds,
        });
        const adminMap = new Map<string, { id: string; username: string; email: string }>();
        for (const r of adminResult.rows) {
          const row = r as Record<string, unknown>;
          adminMap.set(String(row.id), {
            id: String(row.id ?? ""),
            username: String(row.username ?? ""),
            email: String(row.email ?? ""),
          });
        }
        for (const log of logs) {
          (log as Record<string, unknown>).admin = adminMap.get(log.adminId) || null;
        }
      }
      return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
    }

    // Prisma path — use the adapter which includes the admin relation
    const allLogs = await database.findAuditLogs({ limit: limit * 5 }); // fetch more, filter in-memory
    const filtered = actionFilter ? allLogs.filter((l) => l.action === actionFilter) : allLogs;
    const paged = filtered.slice((page - 1) * limit, page * limit);
    return NextResponse.json({
      logs: paged,
      total: filtered.length,
      page,
      limit,
      pages: Math.ceil(filtered.length / limit),
    });
  } catch (error) {
    console.error("Admin audit logs error:", error);
    return NextResponse.json({ error: "Ошибка загрузки логов" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.admin, withAdminAuth(handler));
