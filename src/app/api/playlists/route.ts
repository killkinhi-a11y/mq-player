import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// GET /api/playlists?userId=&search=&tags=&sort=&page=&limit=
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "";
    const search = searchParams.get("search") || "";
    const tags = searchParams.get("tags") || "";
    const sort = searchParams.get("sort") || "popular"; // popular, new, likes
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const myOnly = searchParams.get("myOnly") === "true";

    const skip = (page - 1) * limit;

    if (myOnly && userId) {
      // Get user's own playlists
      const playlists = await db.playlist.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { username: true } },
          _count: { select: { likes: true } },
        },
      });

      const total = await db.playlist.count({ where: { userId } });

      return NextResponse.json({
        playlists: playlists.map(formatPlaylist),
        total,
        page,
        limit,
      });
    }

    // Public playlists feed
    const where: any = { isPublic: true };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { tags: { contains: search } },
      ];
    }
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim().toLowerCase());
      where.tags = { contains: tagList[0] };
    }
    if (userId) {
      where.userId = { not: userId }; // exclude own playlists from feed
    }

    let orderBy: any = {};
    switch (sort) {
      case "new":
        orderBy = { createdAt: "desc" };
        break;
      case "likes":
        orderBy = { likes: { _count: "desc" } };
        break;
      default: // popular = weighted: likes + playCount
        orderBy = { createdAt: "desc" }; // we'll sort in-memory below
        break;
    }

    let playlists = await db.playlist.findMany({
      where,
      orderBy: sort === "popular" ? undefined : orderBy,
      skip,
      take: limit + 20, // fetch extra for sorting
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
    });

    // In-memory popular sort (weighted: likes*3 + playCount)
    if (sort === "popular") {
      playlists.sort((a, b) => {
        const scoreA = a._count.likes * 3 + a.playCount;
        const scoreB = b._count.likes * 3 + b.playCount;
        return scoreB - scoreA;
      });
    }

    playlists = playlists.slice(0, limit);

    const total = await db.playlist.count({ where });

    // Get current user's likes if authenticated
    let likedIds: string[] = [];
    if (userId) {
      const userLikes = await db.playlistLike.findMany({
        where: { userId },
        select: { playlistId: true },
      });
      likedIds = userLikes.map((l) => l.playlistId);
    }

    return NextResponse.json({
      playlists: playlists.map((p) => ({ ...formatPlaylist(p), isLiked: likedIds.includes(p.id) })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("GET /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
  }
}

// POST /api/playlists — create or publish a playlist
async function postHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, name, description, cover, isPublic, tags, tracks } = body;

    if (!userId || !name) {
      return NextResponse.json({ error: "userId and name required" }, { status: 400 });
    }

    const tracksJson = JSON.stringify(tracks || []);
    const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");

    const playlist = await db.playlist.create({
      data: {
        userId,
        name: name.trim(),
        description: (description || "").trim(),
        cover: cover || "",
        isPublic: isPublic !== false,
        tags: tagsStr,
        tracksJson,
      },
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
    });

    return NextResponse.json({ playlist: formatPlaylist(playlist) });
  } catch (error) {
    console.error("POST /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
  }
}

// PUT /api/playlists — update playlist
async function putHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, userId, name, description, cover, isPublic, tags, tracks } = body;

    if (!id || !userId) {
      return NextResponse.json({ error: "id and userId required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await db.playlist.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Playlist not found or unauthorized" }, { status: 403 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (cover !== undefined) updateData.cover = cover;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags.join(",") : tags;
    }
    if (tracks !== undefined) updateData.tracksJson = JSON.stringify(tracks);

    const playlist = await db.playlist.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
    });

    return NextResponse.json({ playlist: formatPlaylist(playlist) });
  } catch (error) {
    console.error("PUT /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to update playlist" }, { status: 500 });
  }
}

// DELETE /api/playlists?playlistId=&userId=
async function deleteHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playlistId = searchParams.get("playlistId");
    const userId = searchParams.get("userId");

    if (!playlistId || !userId) {
      return NextResponse.json({ error: "playlistId and userId required" }, { status: 400 });
    }

    const existing = await db.playlist.findUnique({ where: { id: playlistId } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 403 });
    }

    await db.playlist.delete({ where: { id: playlistId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to delete playlist" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.write, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
export const PUT = withRateLimit(RATE_LIMITS.write, putHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);

// GET /api/playlists/[id] — handled in separate file

function formatPlaylist(p: any) {
  let tracks = [];
  try {
    tracks = JSON.parse(p.tracksJson || "[]");
  } catch {
    tracks = [];
  }
  return {
    id: p.id,
    userId: p.userId,
    username: p.user?.username || "Unknown",
    name: p.name,
    description: p.description,
    cover: p.cover,
    isPublic: p.isPublic,
    tags: p.tags ? p.tags.split(",").filter(Boolean) : [],
    tracks,
    trackCount: tracks.length,
    likeCount: p._count?.likes || 0,
    playCount: p.playCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
