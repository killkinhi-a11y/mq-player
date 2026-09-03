import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

/**
 * PATCH /api/smart-playlists/[id] — update smart playlist
 * DELETE /api/smart-playlists/[id] — delete smart playlist
 */

async function patchHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { id } = await ctx.params;
    const body = await req.json();
    const { name, rules, limit, sortBy } = body as Record<string, unknown>;

    // Verify ownership
    if (isTurso()) {
      const t = getTursoClient();
      const existing = await t.execute({
        sql: "SELECT userId FROM SmartPlaylist WHERE id = ?",
        args: [id],
      });
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      }
      if (String((existing.rows[0] as Record<string, unknown>).userId) !== ctx.userId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }

      const sets: string[] = [];
      const args: (string | number)[] = [];
      if (name !== undefined) { sets.push("name = ?"); args.push(String(name).trim()); }
      if (rules !== undefined) { sets.push("rules = ?"); args.push(JSON.stringify(rules)); }
      if (limit !== undefined) { sets.push('"limit" = ?'); args.push(Math.min(Math.max(1, Number(limit) || 100), 500)); }
      if (sortBy !== undefined) { sets.push("sortBy = ?"); args.push(String(sortBy)); }
      if (sets.length === 0) return NextResponse.json({ error: "Нет данных" }, { status: 400 });
      sets.push("updatedAt = ?");
      args.push(new Date().toISOString());
      args.push(id);
      await t.execute({ sql: `UPDATE SmartPlaylist SET ${sets.join(", ")} WHERE id = ?`, args });
      return NextResponse.json({ ok: true });
    }

    const { db } = await import("@/lib/db");
    const existing = await db.smartPlaylist.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    if (existing.userId !== ctx.userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (rules !== undefined) updateData.rules = JSON.stringify(rules);
    if (limit !== undefined) updateData.limit = Math.min(Math.max(1, Number(limit) || 100), 500);
    if (sortBy !== undefined) updateData.sortBy = String(sortBy);
    if (Object.keys(updateData).length === 0) return NextResponse.json({ error: "Нет данных" }, { status: 400 });

    await db.smartPlaylist.update({ where: { id }, data: updateData });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Smart playlist update error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

async function deleteHandler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { id } = await ctx.params;

    if (isTurso()) {
      const t = getTursoClient();
      const existing = await t.execute({
        sql: "SELECT userId FROM SmartPlaylist WHERE id = ?",
        args: [id],
      });
      if (existing.rows.length === 0) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      if (String((existing.rows[0] as Record<string, unknown>).userId) !== ctx.userId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      await t.execute({ sql: "DELETE FROM SmartPlaylist WHERE id = ?", args: [id] });
      return NextResponse.json({ ok: true });
    }

    const { db } = await import("@/lib/db");
    const existing = await db.smartPlaylist.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    if (existing.userId !== ctx.userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    await db.smartPlaylist.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Smart playlist delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}

export const PATCH = withRateLimit(RATE_LIMITS.write, withAuth(patchHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));
