import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ").replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb").replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass").replace(/d 'n' b/gi, "drum and bass")
    .replace(/lo-fi/g, "lofi").replace(/lo fi/g, "lofi").replace(/new age/g, "newage");
}

// ── Time-of-day context ──
type TimeContext = "morning" | "afternoon" | "evening" | "night" | "weekend" | "friday_evening";

function getTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  if (day === 5 && hour >= 18) return "friday_evening";
  if (day === 0 || day === 6) return "weekend";
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

// Genres that match each time context
const TIME_GENRE_BOOSTS: Record<TimeContext, string[]> = {
  morning: ["pop", "indie pop", "dance pop", "funk", "soul", "rock", "hip-hop"],
  afternoon: ["electronic", "house", "techno", "lo-fi", "ambient", "indie"],
  evening: ["jazz", "lo-fi", "chill", "r&b", "soul", "bossa nova", "acoustic"],
  night: ["ambient", "lo-fi", "piano", "classical", "downtempo", "chill"],
  weekend: ["edm", "house", "hip-hop", "reggaeton", "dance pop", "rock", "pop"],
  friday_evening: ["edm", "house", "hip-hop", "trap", "dance pop", "techno"],
};

// GET /api/playlists/recommendations?likedTags=pop,rock&dislikedTags=jazz&limit=10
//
// Algorithm v3 — time-aware + collaborative filtering:
// 1. Time-of-day awareness: boost playlists matching current time context
// 2. Recency-weighted scoring: newer playlists get bonus
// 3. Collaborative filtering: find users with similar taste, recommend their playlists
// 4. Tag/artist overlap scoring with genre normalization
// 5. Exploration: mix in some playlists from outside user's usual genres
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

    const timeContext = getTimeContext();
    const timeGenres = TIME_GENRE_BOOSTS[timeContext] || [];

    // Fetch public playlists (except user's own)
    const where: Record<string, unknown> = { isPublic: true };
    if (userId) where.userId = { not: userId };

    let playlists = await db.playlist.findMany({
      where,
      include: {
        user: { select: { username: true } },
        _count: { select: { likes: true } },
      },
      take: 300,
      orderBy: { createdAt: "desc" },
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

    // ── COLLABORATIVE FILTERING ──
    // Find users who like similar playlists (users with overlapping taste)
    let similarUserIds = new Set<string>();
    if (userId && likedPlaylistIds.size > 0) {
      const userLikedArr = [...likedPlaylistIds];
      // Find other users who liked the same playlists
      const similarTaste = await db.playlistLike.findMany({
        where: {
          playlistId: { in: userLikedArr.slice(0, 10) },
          userId: { not: userId },
        },
        select: { userId: true, playlistId: true },
        take: 100,
      });
      // Count co-likes per user
      const userCoLikeCounts = new Map<string, number>();
      for (const like of similarTaste) {
        userCoLikeCounts.set(like.userId, (userCoLikeCounts.get(like.userId) || 0) + 1);
      }
      // Users with 2+ co-likes are "similar"
      for (const [uid, count] of userCoLikeCounts) {
        if (count >= 2) similarUserIds.add(uid);
      }
    }

    // Get playlists from similar users that current user hasn't seen
    let collaborativePlaylistIds = new Set<string>();
    if (similarUserIds.size > 0) {
      const collabPlaylists = await db.playlist.findMany({
        where: {
          userId: { in: [...similarUserIds].slice(0, 20) },
          isPublic: true,
          id: { notIn: [...likedPlaylistIds] },
        },
        select: { id: true },
        take: 50,
      });
      collaborativePlaylistIds = new Set(collabPlaylists.map(p => p.id));
    }

    // Score each playlist
    const normalizedLikedTags = likedTags.map(t => normalizeGenre(t));
    const normalizedDislikedTags = dislikedTags.map(t => normalizeGenre(t));

    const scored = playlists
      .filter((p) => !likedPlaylistIds.has(p.id) && JSON.parse(p.tracksJson || "[]").length > 0)
      .map((p) => {
        let tracks: any[] = [];
        try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { tracks = []; }

        let score = 0;

        // 1. Tag overlap (0-40 points)
        const playlistTags = (p.tags || "").split(",").map((t) => normalizeGenre(t)).filter(Boolean);
        for (const lt of normalizedLikedTags) {
          for (const pt of playlistTags) {
            if (pt === lt || pt.includes(lt) || lt.includes(pt)) score += 15;
          }
        }

        // 2. Artist overlap (0-30 points)
        const playlistArtists = [...new Set(tracks.map((t: any) => (t.artist || "").toLowerCase().trim()).filter(Boolean))];
        for (const la of likedArtists) {
          for (const pa of playlistArtists) {
            if (pa === la || pa.includes(la) || la.includes(pa)) score += 20;
          }
        }

        // 3. TIME-OF-DAY BONUS (0-20 points)
        for (const tg of timeGenres) {
          const norm = normalizeGenre(tg);
          for (const pt of playlistTags) {
            if (pt === norm || pt.includes(norm) || norm.includes(pt)) { score += 20; break; }
          }
          // Check track genres too
          if (score < 20) {
            for (const t of tracks.slice(0, 5)) {
              const trackGenre = normalizeGenre(t.genre || "");
              if (trackGenre === norm || trackGenre.includes(norm) || norm.includes(trackGenre)) { score += 10; break; }
            }
          }
        }

        // 4. Disliked tag penalty (-20 per match)
        for (const dt of normalizedDislikedTags) {
          for (const pt of playlistTags) {
            if (pt === dt || pt.includes(dt) || dt.includes(pt)) score -= 20;
          }
        }

        // 5. COLLABORATIVE FILTERING BONUS (0-25 points)
        if (collaborativePlaylistIds.has(p.id)) {
          score += 25;
        }

        // 6. Popularity bonus (0-15 points)
        score += Math.min(15, (p._count?.likes || 0) * 2 + p.playCount * 0.5);

        // 7. Recency bonus — exponential decay over 30 days
        const daysSinceCreation = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-daysSinceCreation / 30);
        score += Math.round(recencyWeight * 15);

        // 8. Track count bonus (0-5 points)
        if (tracks.length >= 10) score += 5;
        else if (tracks.length >= 5) score += 3;
        else if (tracks.length >= 3) score += 1;

        // 9. Artist diversity bonus (0-5 points)
        if (playlistArtists.length >= 8) score += 5;
        else if (playlistArtists.length >= 5) score += 3;

        // 10. Exploration bonus — playlists with no tag/artist overlap get a small bonus for diversity
        const hasOverlap = normalizedLikedTags.some(lt => playlistTags.some(pt => pt.includes(lt) || lt.includes(pt)))
          || likedArtists.some(la => playlistArtists.some(pa => pa.includes(la) || la.includes(pa)));
        if (!hasOverlap && playlistTags.length > 0) score += 8; // small nudge for novel genres

        // 11. Randomness for freshness
        score += Math.random() * 10 - 5;

        return { ...p, tracks, _score: score, _tags: playlistTags, _artists: playlistArtists, _isCollaborative: collaborativePlaylistIds.has(p.id) };
      })
      .filter((p) => p._score > 5)
      .sort((a, b) => b._score - a._score);

    // 70/30 exploitation vs exploration split
    const exploitableCount = Math.ceil(limit * 0.7);
    const explorationCount = limit - exploitableCount;
    const exploitation = scored.filter(p => p._tags.some(t =>
      normalizedLikedTags.some(lt => t.includes(lt) || lt.includes(t))
    )).slice(offset, offset + exploitableCount);
    const exploration = scored.filter(p => !exploitation.some(e => e.id === p.id))
      .sort(() => Math.random() - 0.5) // randomize exploration pool
      .slice(0, explorationCount);

    const merged = [...exploitation, ...exploration];

    const result = merged.map((p) => ({
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
      isCollaborative: p._isCollaborative,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    // Fallback: popular playlists filtered by dislikedTags
    if (result.length < limit) {
      const existingIds = new Set(result.map((r) => r.id));
      const fallback = playlists
        .filter((p) => {
          if (existingIds.has(p.id)) return false;
          let tracks: any[] = [];
          try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { return false; }
          if (tracks.length === 0) return false;
          if (dislikedTags.length > 0) {
            const playlistTags = (p.tags || "").split(",").map((t) => normalizeGenre(t)).filter(Boolean);
            for (const dt of normalizedDislikedTags) {
              for (const pt of playlistTags) {
                if (pt === dt || pt.includes(dt) || dt.includes(pt)) return false;
              }
            }
          }
          return true;
        })
        .sort((a, b) => (b._count?.likes || 0) * 3 + b.playCount - ((a._count?.likes || 0) * 3 + a.playCount))
        .slice(0, limit - result.length)
        .map((p) => {
          let tracks: any[] = [];
          try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { tracks = []; }
          return {
            id: p.id, userId: p.userId, username: p.user?.username || "Unknown",
            name: p.name, description: p.description, cover: p.cover,
            tags: (p.tags || "").split(",").filter(Boolean),
            tracks, trackCount: tracks.length,
            likeCount: p._count?.likes || 0, playCount: p.playCount,
            score: 0, isCollaborative: false,
            createdAt: p.createdAt, updatedAt: p.updatedAt,
          };
        });
      result.push(...fallback);
    }

    return NextResponse.json({
      playlists: result,
      _meta: { timeContext, similarUsersFound: similarUserIds.size },
    });
  } catch (error) {
    console.error("GET /api/playlists/recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
