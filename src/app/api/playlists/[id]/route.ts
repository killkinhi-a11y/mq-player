import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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

    // Access control: only owner or public playlists can be viewed
    if (!playlist.isPublic && playlist.userId !== userId) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    let tracks = [];
    try {
      tracks = JSON.parse(playlist.tracksJson || "[]");
    } catch {
      tracks = [];
    }

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
