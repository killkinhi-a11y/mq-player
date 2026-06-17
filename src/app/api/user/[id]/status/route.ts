import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

async function handler(_req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const { id } = await ctx!.params;

    let lastSeen: string | null = null;
    let found = false;
    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({ sql: "SELECT lastSeen FROM User WHERE id = ?", args: [id] });
      if (r.rows.length > 0) {
        found = true;
        const row = r.rows[0] as Record<string, unknown>;
        lastSeen = row.lastSeen != null ? String(row.lastSeen) : null;
      }
    } else {
      const { db } = await import("@/lib/db");
      const user = await db.user.findUnique({ where: { id }, select: { lastSeen: true } });
      if (user) {
        found = true;
        lastSeen = user.lastSeen ? user.lastSeen.toISOString() : null;
      }
    }
    if (!found) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const isOnline = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 120000 : false;
    return NextResponse.json({ online: isOnline, lastSeen });
  } catch (error) {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
