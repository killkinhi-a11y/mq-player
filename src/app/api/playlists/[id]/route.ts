import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/playlists/[id]?userId= (userId optional for like status)
async function handler(
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const { id } = await ctx!.params;
    const userId = new URL(req.url).searchParams.get("userId");

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

    let tracks = [];
    try {
      tracks = JSON.parse(playlist.tracksJson || "[]");
    } catch {
      tracks = [];
    }

    // Increment play count
    await db.playlist.update({
      where: { id },
      data: { playCount: { increment: 1 } },
    });

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
export const GET = withRateLimit(RATE_LIMITS.write, handler);
