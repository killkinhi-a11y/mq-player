import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function handler(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids") || "";
    const ids = idsParam.split(",").filter(Boolean).slice(0, 100);

    if (ids.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    let userRows: Array<{ id: string; lastSeen: string | null }> = [];
    if (isTurso()) {
      const t = getTursoClient();
      const placeholders = ids.map(() => "?").join(",");
      const result = await t.execute({
        sql: `SELECT id, lastSeen FROM User WHERE id IN (${placeholders})`,
        args: ids,
      });
      userRows = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          lastSeen: row.lastSeen != null ? String(row.lastSeen) : null,
        };
      });
    } else {
      const { db } = await import("@/lib/db");
      const users = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, lastSeen: true },
      });
      userRows = users.map((u) => ({
        id: u.id,
        lastSeen: u.lastSeen ? u.lastSeen.toISOString() : null,
      }));
    }

    const now = Date.now();
    const ONLINE_THRESHOLD = 5 * 60 * 1000;

    const statuses: Record<string, { online: boolean; lastSeen: number | null }> = {};
    for (const user of userRows) {
      const lastSeen = user.lastSeen ? new Date(user.lastSeen).getTime() : null;
      const online = lastSeen !== null && (now - lastSeen) < ONLINE_THRESHOLD;
      statuses[user.id] = { online, lastSeen };
    }
    // Include IDs that weren't found as offline
    for (const id of ids) {
      if (!statuses[id]) {
        statuses[id] = { online: false, lastSeen: null };
      }
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Batch user status error:", error);
    return NextResponse.json({ statuses: {} }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
