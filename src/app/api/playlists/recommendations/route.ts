import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// GET /api/playlists/recommendations?likedTags=pop,rock&dislikedTags=jazz&limit=10
//
// Algorithm:
// 1. Extract taste profile from user's liked tracks and history (sent as likedTags, likedArtists)
// 2. Score each public playlist by tag overlap + recency + popularity
// 3. Exclude playlists already liked by the user
// 4. Return top N recommendations
async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId || "";
    const { searchParams } = new URL(req.url);
    const likedTags = (searchParams.get("likedTags") || "").split(",").filter(Boolean).map((t) => t.trim().toLowerCase());
    const likedArtists = (searchParams.get("likedArtists") || "").split(",").filter(Boolean).map((a) => a.trim().toLowerCase());
    const dislikedTags = (searchParams.get("dislikedTags") || "").split(",").filter(Boolean).map((t) => t.trim().toLowerCase());
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "10") || 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch all public playlists (except user's own)
    const where: Record<string, unknown> = { isPublic: true };
    if (userId) {
      where.userId = { not: userId };
    }

    let playlists = await db.playlist.findMany({
      where,
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
      take: 200, // fetch up to 200 for scoring
    });

    // Get user's liked playlist IDs to exclude
    let likedPlaylistIds: Set<string> = new Set();
    if (userId) {
      const userLikes = await db.playlistLike.findMany({
        where: { userId },
        select: { playlistId: true },
      });
      likedPlaylistIds = new Set(userLikes.map((l) => l.playlistId));
    }

    // Score each playlist
    const scored = playlists
      .filter((p) => !likedPlaylistIds.has(p.id) && JSON.parse(p.tracksJson || "[]").length > 0)
      .map((p) => {
        let tracks: any[] = [];
        try {
          tracks = JSON.parse(p.tracksJson || "[]");
        } catch {
          tracks = [];
        }

        let score = 0;

        // 1. Tag overlap score (0-40 points)
        const playlistTags = (p.tags || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        for (const lt of likedTags) {
          for (const pt of playlistTags) {
            if (pt.includes(lt) || lt.includes(pt)) {
              score += 15;
            }
          }
        }

        // 2. Artist overlap score (0-30 points)
        const playlistArtists = tracks
          .map((t: any) => (t.artist || "").toLowerCase().trim())
          .filter(Boolean);
        const uniqueArtists = [...new Set(playlistArtists)];
        for (const la of likedArtists) {
          for (const pa of uniqueArtists) {
            if (pa.includes(la) || la.includes(pa)) {
              score += 20;
            }
          }
        }

        // 3. Disliked tag penalty (-20 per match)
        for (const dt of dislikedTags) {
          for (const pt of playlistTags) {
            if (pt.includes(dt) || dt.includes(pt)) {
              score -= 20;
            }
          }
        }

        // 4. Popularity bonus (0-15 points)
        score += Math.min(15, (p._count?.likes || 0) * 2 + p.playCount * 0.5);

        // 5. Recency bonus (0-10 points) — playlists from last 7 days get bonus
        const daysSinceCreation = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 1) score += 10;
        else if (daysSinceCreation < 7) score += 5;

        // 6. Track count bonus — prefer playlists with decent amount of tracks (0-5 points)
        if (tracks.length >= 10) score += 5;
        else if (tracks.length >= 5) score += 3;
        else if (tracks.length >= 3) score += 1;

        return { ...p, tracks, _score: score, _tags: playlistTags, _artists: uniqueArtists };
      })
      .filter((p) => p._score > 0)
      .sort((a, b) => b._score - a._score);

    const result = scored.slice(offset, offset + limit).map((p) => {
      return {
        id: p.id,
        userId: p.userId,
        username: p.user?.username || "Unknown",
        name: p.name,
        description: p.description,
        cover: p.cover,
        tags: p._tags,
        tracks: p.tracks,
        trackCount: p.tracks.length,
        likeCount: p._count?.likes || 0,
        playCount: p.playCount,
        score: Math.min(100, Math.round(p._score / 2)),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    // If not enough recommendations, add popular playlists as fallback
    if (result.length < limit) {
      const existingIds = new Set(result.map((r) => r.id));
      const fallback = playlists
        .filter((p) => !existingIds.has(p.id) && JSON.parse(p.tracksJson || "[]").length > 0)
        .sort((a, b) => {
          const scoreA = (a._count?.likes || 0) * 3 + a.playCount;
          const scoreB = (b._count?.likes || 0) * 3 + b.playCount;
          return scoreB - scoreA;
        })
        .slice(0, limit - result.length)
        .map((p) => {
          let tracks: any[] = [];
          try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { tracks = []; }
          return {
            id: p.id,
            userId: p.userId,
            username: p.user?.username || "Unknown",
            name: p.name,
            description: p.description,
            cover: p.cover,
            tags: (p.tags || "").split(",").filter(Boolean),
            tracks,
            trackCount: tracks.length,
            likeCount: p._count?.likes || 0,
            playCount: p.playCount,
            score: 0,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          };
        });

      result.push(...fallback);
    }

    return NextResponse.json({ playlists: result });
  } catch (error) {
    console.error("GET /api/playlists/recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
