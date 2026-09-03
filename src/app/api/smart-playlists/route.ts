import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

/**
 * GET /api/smart-playlists — list user's smart playlists
 * POST /api/smart-playlists — create a new smart playlist
 * Body: { name, rules, limit?, sortBy? }
 */

async function getHandler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (isTurso()) {
      const t = getTursoClient();
      const result = await t.execute({
        sql: "SELECT * FROM SmartPlaylist WHERE userId = ? ORDER BY updatedAt DESC",
        args: [ctx.userId],
      });
      const playlists = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          userId: String(row.userId ?? ""),
          name: String(row.name ?? ""),
          rules: String(row.rules ?? "[]"),
          limit: Number(row.limit ?? 100),
          sortBy: String(row.sortBy ?? "createdAt"),
          createdAt: String(row.createdAt ?? ""),
          updatedAt: String(row.updatedAt ?? ""),
        };
      });
      return NextResponse.json({ playlists });
    }

    const { db } = await import("@/lib/db");
    const playlists = await db.smartPlaylist.findMany({
      where: { userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      playlists: playlists.map((p) => ({
        id: p.id, userId: p.userId, name: p.name, rules: p.rules,
        limit: p.limit, sortBy: p.sortBy,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Smart playlists list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();
    const { name, rules, limit, sortBy } = body as {
      name: string;
      rules: unknown[];
      limit?: number;
      sortBy?: string;
    };

    if (!name || !Array.isArray(rules)) {
      return NextResponse.json({ error: "name и rules обязательны" }, { status: 400 });
    }

    if (name.length > 200) {
      return NextResponse.json({ error: "Слишком длинное название (макс 200)" }, { status: 400 });
    }

    const rulesJson = JSON.stringify(rules);
    const limitVal = Math.min(Math.max(1, limit || 100), 500);
    const sortByVal = sortBy || "createdAt";
    const now = new Date().toISOString();

    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await t.execute({
        sql: 'INSERT INTO SmartPlaylist (id, userId, name, rules, "limit", sortBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, ctx.userId, name.trim(), rulesJson, limitVal, sortByVal, now, now],
      });
      return NextResponse.json({
        playlist: {
          id, userId: ctx.userId, name: name.trim(),
          rules: rulesJson, limit: limitVal, sortBy: sortByVal,
          createdAt: now, updatedAt: now,
        },
      }, { status: 201 });
    }

    const { db } = await import("@/lib/db");
    const playlist = await db.smartPlaylist.create({
      data: {
        userId: ctx.userId,
        name: name.trim(),
        rules: rulesJson,
        limit: limitVal,
        sortBy: sortByVal,
      },
    });
    return NextResponse.json({
      playlist: {
        id: playlist.id, userId: playlist.userId, name: playlist.name,
        rules: playlist.rules, limit: playlist.limit, sortBy: playlist.sortBy,
        createdAt: playlist.createdAt.toISOString(),
        updatedAt: playlist.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Smart playlist create error:", error);
    return NextResponse.json({ error: "Ошибка создания" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
