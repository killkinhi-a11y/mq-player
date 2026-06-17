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
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const excludeId = searchParams.get("excludeId") || "";

    if (isTurso()) {
      const t = getTursoClient();
      let sql: string;
      let args: (string | number)[];
      if (q && excludeId) {
        sql = "SELECT id, username, createdAt FROM User WHERE username LIKE ? AND id != ? ORDER BY createdAt DESC LIMIT 50";
        args = [`%${q}%`, excludeId];
      } else if (q) {
        sql = "SELECT id, username, createdAt FROM User WHERE username LIKE ? ORDER BY createdAt DESC LIMIT 50";
        args = [`%${q}%`];
      } else if (excludeId) {
        sql = "SELECT id, username, createdAt FROM User WHERE id != ? ORDER BY createdAt DESC LIMIT 50";
        args = [excludeId];
      } else {
        sql = "SELECT id, username, createdAt FROM User ORDER BY createdAt DESC LIMIT 50";
        args = [];
      }
      const result = await t.execute({ sql, args });
      const users = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          username: String(row.username ?? ""),
          createdAt: String(row.createdAt ?? ""),
        };
      });
      return NextResponse.json({ users });
    }

    const { db } = await import("@/lib/db");
    const where: Record<string, unknown> = {};
    if (excludeId) where.id = { not: excludeId };
    if (q) where.OR = [{ username: { contains: q } }];
    const users = await db.user.findMany({
      where,
      select: { id: true, username: true, createdAt: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error("User search error:", error);
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.search, handler);
