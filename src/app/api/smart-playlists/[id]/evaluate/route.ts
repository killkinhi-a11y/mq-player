import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";
import { evaluateSmartPlaylist, type SmartPlaylistConfig } from "@/lib/smartPlaylist";
import { useAppStore } from "@/store/useAppStore";

/**
 * GET /api/smart-playlists/[id]/evaluate
 *
 * Evaluates a smart playlist's rules against the user's library and
 * returns the matching tracks. Runs entirely server-side.
 *
 * Note: we import useAppStore's getState() to access the user's liked
 * tracks + history — these are stored in the client-side Zustand store
 * and synced to the server via /api/sync. For server-side evaluation,
 * we fetch from the UserSync table instead.
 */

async function handler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { id } = await ctx.params;

    // 1. Fetch the smart playlist config
    let config: { rules: string; limit: number; sortBy: string } | null = null;
    if (isTurso()) {
      const t = getTursoClient();
      const result = await t.execute({
        sql: "SELECT rules, limit, sortBy FROM SmartPlaylist WHERE id = ? AND userId = ?",
        args: [id, ctx.userId],
      });
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      }
      const row = result.rows[0] as Record<string, unknown>;
      config = {
        rules: String(row.rules ?? "[]"),
        limit: Number(row.limit ?? 100),
        sortBy: String(row.sortBy ?? "createdAt"),
      };
    } else {
      const { db } = await import("@/lib/db");
      const sp = await db.smartPlaylist.findFirst({ where: { id, userId: ctx.userId } });
      if (!sp) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      config = { rules: sp.rules, limit: sp.limit, sortBy: sp.sortBy };
    }

    if (!config) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

    // 2. Fetch user's library from UserSync
    const likedSync = await database.findUserSyncByUserIdAndKey(ctx.userId, "likedTracks");
    const historySync = await database.findUserSyncByUserIdAndKey(ctx.userId, "history");

    let likedTracksData: any[] = [];
    let history: any[] = [];
    try {
      likedTracksData = likedSync ? JSON.parse(likedSync.data) : [];
    } catch { likedTracksData = []; }
    try {
      history = historySync ? JSON.parse(historySync.data) : [];
    } catch { history = []; }

    // 3. Evaluate
    const rules = JSON.parse(config.rules);
    const tracks = evaluateSmartPlaylist(
      { rules, limit: config.limit, sortBy: config.sortBy as SmartPlaylistConfig["sortBy"] },
      { likedTracksData, history },
    );

    return NextResponse.json({ tracks, count: tracks.length });
  } catch (error) {
    console.error("Smart playlist evaluate error:", error);
    return NextResponse.json({ error: "Ошибка оценки" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(handler));
