import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/playlists/[id] — get playlist details (userId optional for like status)
async function handler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const { id } = await ctx!.params;
    const session = await getSession();
    const userId = session?.userId || null;

    if (isTurso()) {
      const t = getTursoClient();
      const result = await t.execute({
        sql: `SELECT p.*, u.username,
                (SELECT COUNT(*) FROM PlaylistLike WHERE playlistId = p.id) as likeCount
              FROM Playlist p
              JOIN User u ON p.userId = u.id
              WHERE p.id = ?`,
        args: [id],
      });
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      }
      const row = result.rows[0] as Record<string, unknown>;
      const isPublic = row.isPublic === 1 || row.isPublic === true;
      const ownerId = String(row.userId ?? "");
      if (!isPublic && ownerId !== userId) {
        return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      }
      let tracks: unknown[] = [];
      try {
        tracks = JSON.parse(String(row.tracksJson ?? "[]"));
      } catch { tracks = []; }
      let isLiked = false;
      if (userId) {
        const likeResult = await t.execute({
          sql: "SELECT id FROM PlaylistLike WHERE playlistId = ? AND userId = ?",
          args: [id, userId],
        });
        isLiked = likeResult.rows.length > 0;
      }
      const tagsStr = String(row.tags ?? "");
      return NextResponse.json({
        playlist: {
          id: String(row.id ?? ""),
          userId: ownerId,
          username: String(row.username ?? "Unknown"),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          cover: String(row.cover ?? ""),
          isPublic,
          tags: tagsStr ? tagsStr.split(",").filter(Boolean) : [],
          tracks,
          trackCount: tracks.length,
          likeCount: Number(row.likeCount ?? 0),
          playCount: Number(row.playCount ?? 0),
          isLiked,
          createdAt: String(row.createdAt ?? ""),
          updatedAt: String(row.updatedAt ?? ""),
        },
      });
    }

    const { db } = await import("@/lib/db");
    const playlist = await db.playlist.findUnique({
      where: { id },
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    if (!playlist.isPublic && playlist.userId !== userId) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    let tracks = [];
    try {
      tracks = JSON.parse(playlist.tracksJson || "[]");
    } catch { tracks = []; }
    let isLiked = false;
    if (userId) {
      const like = await db.playlistLike.findUnique({
        where: { playlistId_userId: { playlistId: id, userId } },
      });
      isLiked = !!like;
    }
    return NextResponse.json({
      playlist: {
        id: playlist.id,
        userId: playlist.userId,
        username: playlist.user?.username || "Unknown",
        name: playlist.name,
        description: playlist.description,
        cover: playlist.cover,
        isPublic: playlist.isPublic,
        tags: playlist.tags ? playlist.tags.split(",").filter(Boolean) : [],
        tracks,
        trackCount: tracks.length,
        likeCount: playlist._count?.likes || 0,
        playCount: playlist.playCount,
        isLiked,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
      },
    });
  } catch (error) {
    console.error("GET /api/playlists/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
