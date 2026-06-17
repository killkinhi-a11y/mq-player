import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// POST /api/playlists/like — toggle like on a playlist
async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;
    const body = await req.json();
    const { playlistId } = body;

    if (!playlistId) {
      return NextResponse.json({ error: "playlistId required" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      // Verify playlist exists
      const playlistResult = await t.execute({ sql: "SELECT id FROM Playlist WHERE id = ?", args: [playlistId] });
      if (playlistResult.rows.length === 0) {
        return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      }
      // Check existing like
      const existingResult = await t.execute({
        sql: "SELECT id FROM PlaylistLike WHERE playlistId = ? AND userId = ?",
        args: [playlistId, userId],
      });
      if (existingResult.rows.length > 0) {
        await t.execute({
          sql: "DELETE FROM PlaylistLike WHERE playlistId = ? AND userId = ?",
          args: [playlistId, userId],
        });
        return NextResponse.json({ liked: false });
      }
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await t.execute({
        sql: "INSERT INTO PlaylistLike (id, playlistId, userId, createdAt) VALUES (?, ?, ?, ?)",
        args: [id, playlistId, userId, new Date().toISOString()],
      });
      return NextResponse.json({ liked: true });
    }

    const { db } = await import("@/lib/db");
    const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    const existing = await db.playlistLike.findUnique({
      where: { playlistId_userId: { playlistId, userId } },
    });
    if (existing) {
      await db.playlistLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ liked: false });
    }
    await db.playlistLike.create({ data: { playlistId, userId } });
    return NextResponse.json({ liked: true });
  } catch (error) {
    console.error("POST /api/playlists/like error:", error);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
export const POST = withRateLimit(RATE_LIMITS.write, handler);
