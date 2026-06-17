import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// GET /api/playlists?search=&tags=&sort=&page=&limit=
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().slice(0, 100);
    const tags = searchParams.get("tags") || "";
    const sort = searchParams.get("sort") || "popular";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20") || 20), 100);
    const myOnly = searchParams.get("myOnly") === "true";

    const offset = (page - 1) * limit;

    if (isTurso()) {
      const t = getTursoClient();

      if (myOnly && userId) {
        const [result, countResult] = await Promise.all([
          t.execute({
            sql: `SELECT p.*, u.username,
                    (SELECT COUNT(*) FROM PlaylistLike WHERE playlistId = p.id) as likeCount
                  FROM Playlist p
                  JOIN User u ON p.userId = u.id
                  WHERE p.userId = ?
                  ORDER BY p.updatedAt DESC
                  LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
          }),
          t.execute({ sql: "SELECT COUNT(*) as c FROM Playlist WHERE userId = ?", args: [userId] }),
        ]);
        const total = Number(countResult.rows[0]?.c ?? 0);
        return NextResponse.json({
          playlists: result.rows.map((r) => formatTursoPlaylist(r as Record<string, unknown>)),
          total, page, limit,
        });
      }

      // Public feed
      const whereParts: string[] = ["p.isPublic = 1"];
      const args: (string | number)[] = [];
      if (userId) {
        whereParts.push("p.userId != ?");
        args.push(userId);
      }
      if (search) {
        whereParts.push("(p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)");
        const like = `%${search}%`;
        args.push(like, like, like);
      }
      if (tags) {
        const tagList = tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (tagList.length > 0) {
          whereParts.push("p.tags LIKE ?");
          args.push(`%${tagList[0]}%`);
        }
      }

      const whereSql = whereParts.join(" AND ");
      // Fetch extra rows for in-memory popular sort
      const fetchLimit = sort === "popular" ? limit + 20 : limit;
      const result = await t.execute({
        sql: `SELECT p.*, u.username,
                (SELECT COUNT(*) FROM PlaylistLike WHERE playlistId = p.id) as likeCount
              FROM Playlist p
              JOIN User u ON p.userId = u.id
              WHERE ${whereSql}
              ORDER BY p.createdAt DESC
              LIMIT ? OFFSET ?`,
        args: [...args, fetchLimit, offset],
      });

      let rows = result.rows;
      if (sort === "popular") {
        const arr = [...rows];
        arr.sort((a, b) => {
          const scoreA = Number((a as Record<string, unknown>).likeCount ?? 0) * 3 +
                         Number((a as Record<string, unknown>).playCount ?? 0);
          const scoreB = Number((b as Record<string, unknown>).likeCount ?? 0) * 3 +
                         Number((b as Record<string, unknown>).playCount ?? 0);
          return scoreB - scoreA;
        });
        rows = arr.slice(0, limit);
      }

      const totalResult = await t.execute({
        sql: `SELECT COUNT(*) as c FROM Playlist p WHERE ${whereSql}`,
        args,
      });
      const total = Number(totalResult.rows[0]?.c ?? 0);

      // Get user's likes
      let likedIds: string[] = [];
      if (userId) {
        const likesResult = await t.execute({
          sql: "SELECT playlistId FROM PlaylistLike WHERE userId = ?",
          args: [userId],
        });
        likedIds = likesResult.rows.map((r) => String((r as Record<string, unknown>).playlistId ?? ""));
      }

      return NextResponse.json({
        playlists: rows.map((r) => ({
          ...formatTursoPlaylist(r as Record<string, unknown>),
          isLiked: likedIds.includes(String((r as Record<string, unknown>).id ?? "")),
        })),
        total, page, limit,
      });
    }

    // Prisma fallback
    const { db } = await import("@/lib/db");
    if (myOnly && userId) {
      const playlists = await db.playlist.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip: offset, take: limit,
        include: { user: { select: { username: true } }, _count: { select: { likes: true } } },
      });
      const total = await db.playlist.count({ where: { userId } });
      return NextResponse.json({
        playlists: playlists.map(formatPlaylist),
        total, page, limit,
      });
    }

    const where: Record<string, unknown> = { isPublic: true };
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
    if (userId) where.userId = { not: userId };

    let orderBy: { createdAt: "desc" } | { likes: { _count: "desc" } } = { createdAt: "desc" };
    if (sort === "likes") orderBy = { likes: { _count: "desc" } };

    let playlists = await db.playlist.findMany({
      where,
      orderBy: sort === "popular" ? undefined : orderBy,
      skip: offset,
      take: limit + 20,
      include: { user: { select: { username: true } }, _count: { select: { likes: true } } },
    });

    if (sort === "popular") {
      playlists.sort((a, b) => {
        const scoreA = a._count.likes * 3 + a.playCount;
        const scoreB = b._count.likes * 3 + b.playCount;
        return scoreB - scoreA;
      });
    }
    playlists = playlists.slice(0, limit);

    const total = await db.playlist.count({ where });

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
      total, page, limit,
    });
  } catch (error) {
    console.error("GET /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
  }
}

// POST /api/playlists — create or publish a playlist
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const body = await req.json();
    const { name, description, cover, isPublic, tags, tracks } = body;

    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (typeof name !== "string" || name.trim().length > 200) {
      return NextResponse.json({ error: "Name too long (max 200 chars)" }, { status: 400 });
    }
    if (description && typeof description === "string" && description.length > 2000) {
      return NextResponse.json({ error: "Description too long (max 2000 chars)" }, { status: 400 });
    }

    const tracksJson = JSON.stringify(tracks || []);
    const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
    const now = new Date().toISOString();

    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await t.execute({
        sql: `INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          id, userId, name.trim(), (description || "").trim(), cover || "",
          isPublic !== false ? 1 : 0, tagsStr, tracksJson, now, now,
        ],
      });
      // Fetch with user + like count
      const result = await t.execute({
        sql: `SELECT p.*, u.username,
                (SELECT COUNT(*) FROM PlaylistLike WHERE playlistId = p.id) as likeCount
              FROM Playlist p
              JOIN User u ON p.userId = u.id
              WHERE p.id = ?`,
        args: [id],
      });
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return NextResponse.json({ playlist: row ? formatTursoPlaylist(row) : null });
    }

    const { db } = await import("@/lib/db");
    const playlist = await db.playlist.create({
      data: {
        userId, name: name.trim(), description: (description || "").trim(),
        cover: cover || "", isPublic: isPublic !== false, tags: tagsStr, tracksJson,
      },
      include: { user: { select: { username: true } }, _count: { select: { likes: true } } },
    });
    return NextResponse.json({ playlist: formatPlaylist(playlist) });
  } catch (error) {
    console.error("POST /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
  }
}

// PUT /api/playlists — update playlist
async function putHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const body = await req.json();
    const { id, name, description, cover, isPublic, tags, tracks } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Verify ownership + get current row
    let ownerId: string | null = null;
    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({ sql: "SELECT userId FROM Playlist WHERE id = ?", args: [id] });
      if (r.rows.length > 0) ownerId = String((r.rows[0] as Record<string, unknown>).userId ?? "");
    } else {
      const { db } = await import("@/lib/db");
      const existing = await db.playlist.findUnique({ where: { id }, select: { userId: true } });
      if (existing) ownerId = existing.userId;
    }
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Playlist not found or unauthorized" }, { status: 403 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const sets: string[] = [];
      const args: (string | number)[] = [];
      if (name !== undefined) { sets.push("name = ?"); args.push(String(name).trim()); }
      if (description !== undefined) { sets.push("description = ?"); args.push(String(description).trim()); }
      if (cover !== undefined) { sets.push("cover = ?"); args.push(cover); }
      if (isPublic !== undefined) { sets.push("isPublic = ?"); args.push(isPublic ? 1 : 0); }
      if (tags !== undefined) {
        sets.push("tags = ?");
        args.push(Array.isArray(tags) ? tags.join(",") : tags);
      }
      if (tracks !== undefined) { sets.push("tracksJson = ?"); args.push(JSON.stringify(tracks)); }
      sets.push("updatedAt = ?");
      args.push(new Date().toISOString());
      if (sets.length > 0) {
        args.push(id);
        await t.execute({ sql: `UPDATE Playlist SET ${sets.join(", ")} WHERE id = ?`, args });
      }
      const result = await t.execute({
        sql: `SELECT p.*, u.username,
                (SELECT COUNT(*) FROM PlaylistLike WHERE playlistId = p.id) as likeCount
              FROM Playlist p
              JOIN User u ON p.userId = u.id
              WHERE p.id = ?`,
        args: [id],
      });
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return NextResponse.json({ playlist: row ? formatTursoPlaylist(row) : null });
    }

    const { db } = await import("@/lib/db");
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (cover !== undefined) updateData.cover = cover;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags.join(",") : tags;
    }
    if (tracks !== undefined) updateData.tracksJson = JSON.stringify(tracks);

    const playlist = await db.playlist.update({
      where: { id }, data: updateData,
      include: { user: { select: { username: true } }, _count: { select: { likes: true } } },
    });
    return NextResponse.json({ playlist: formatPlaylist(playlist) });
  } catch (error) {
    console.error("PUT /api/playlists error:", error);
    return NextResponse.json({ error: "Failed to update playlist" }, { status: 500 });
  }
}

// DELETE /api/playlists?playlistId=
async function deleteHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { searchParams } = new URL(req.url);
    const playlistId = searchParams.get("playlistId");

    if (!playlistId) return NextResponse.json({ error: "playlistId required" }, { status: 400 });

    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({ sql: "SELECT userId FROM Playlist WHERE id = ?", args: [playlistId] });
      if (r.rows.length === 0) {
        return NextResponse.json({ error: "Not found or unauthorized" }, { status: 403 });
      }
      const ownerId = String((r.rows[0] as Record<string, unknown>).userId ?? "");
      if (ownerId !== userId) {
        return NextResponse.json({ error: "Not found or unauthorized" }, { status: 403 });
      }
      // Cascade-delete likes first, then the playlist
      await t.batch([
        t.execute({ sql: "DELETE FROM PlaylistLike WHERE playlistId = ?", args: [playlistId] }),
        t.execute({ sql: "DELETE FROM Playlist WHERE id = ?", args: [playlistId] }),
      ]);
      return NextResponse.json({ success: true });
    }

    const { db } = await import("@/lib/db");
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

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
export const PUT = withRateLimit(RATE_LIMITS.write, withAuth(putHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));

// ── Helpers ──────────────────────────────────────────────────────────────────

interface PlaylistRow {
  id: string;
  userId: string;
  name: string;
  description: string;
  cover: string;
  isPublic: boolean;
  tags: string;
  tracksJson: string;
  playCount: number;
  createdAt: Date;
  updatedAt: Date;
  user?: { username: string };
  _count?: { likes: number };
}

function formatPlaylist(p: PlaylistRow) {
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

function formatTursoPlaylist(row: Record<string, unknown>) {
  let tracks: unknown[] = [];
  try {
    tracks = JSON.parse(String(row.tracksJson ?? "[]"));
  } catch {
    tracks = [];
  }
  const tagsStr = String(row.tags ?? "");
  return {
    id: String(row.id ?? ""),
    userId: String(row.userId ?? ""),
    username: String(row.username ?? "Unknown"),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    cover: String(row.cover ?? ""),
    isPublic: row.isPublic === 1 || row.isPublic === true,
    tags: tagsStr ? tagsStr.split(",").filter(Boolean) : [],
    tracks,
    trackCount: tracks.length,
    likeCount: Number(row.likeCount ?? 0),
    playCount: Number(row.playCount ?? 0),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}
