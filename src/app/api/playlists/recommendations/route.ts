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

// ── Genre relationship graph for content-based matching ──
const genreRelations: Record<string, string[]> = {
  "hip-hop": ["rap", "trap", "r&b", "soul", "funk", "lo-fi hip hop", "drill"],
  "rap": ["hip-hop", "trap", "r&b", "boom bap"],
  "trap": ["hip-hop", "rap", "drill", "edm"],
  "r&b": ["soul", "funk", "hip-hop", "pop", "neo soul"],
  "rnb": ["soul", "funk", "hip-hop", "pop", "neo soul"],
  "soul": ["r&b", "funk", "jazz", "neo soul"],
  "funk": ["soul", "r&b", "disco", "jazz"],
  "rock": ["alternative", "indie", "metal", "punk", "blues"],
  "alternative": ["rock", "indie", "dream pop", "post-punk"],
  "indie": ["alternative", "rock", "lo-fi", "dream pop", "folk"],
  "metal": ["rock", "punk", "alternative"],
  "electronic": ["house", "techno", "edm", "synthwave", "ambient", "trance"],
  "house": ["electronic", "techno", "disco"],
  "techno": ["electronic", "house", "minimal"],
  "edm": ["electronic", "house", "dubstep", "trap"],
  "synthwave": ["electronic", "ambient"],
  "ambient": ["electronic", "chill", "classical"],
  "drum and bass": ["electronic", "jungle", "breakbeat"],
  "jazz": ["blues", "soul", "lo-fi", "classical"],
  "classical": ["piano", "orchestral", "ambient"],
  "pop": ["indie pop", "dance pop", "electropop", "r&b"],
  "lo-fi": ["chillhop", "ambient", "indie", "jazz"],
  "chill": ["lo-fi", "ambient", "downtempo", "acoustic"],
  "country": ["folk", "americana", "blues"],
  "folk": ["acoustic", "country", "indie"],
  "latin": ["reggaeton", "salsa", "bachata"],
  "reggae": ["dub", "ska", "dancehall"],
  "blues": ["jazz", "rock", "soul"],
  "punk": ["rock", "alternative", "hardcore"],
  "dubstep": ["electronic", "edm", "drum and bass"],
  "trance": ["electronic", "edm", "progressive"],
  "drill": ["hip-hop", "trap", "rap"],
  "afrobeats": ["afro pop", "latin", "r&b"],
};

function getRelatedGenres(genre: string): string[] {
  const lower = genre.toLowerCase().trim();
  const related = new Set<string>();
  const direct = genreRelations[lower];
  if (direct) for (const g of direct) related.add(g);
  for (const [key, values] of Object.entries(genreRelations)) {
    if (values.includes(lower) || values.some(v => v.includes(lower) || lower.includes(v))) related.add(key);
  }
  return [...related];
}

// ── Mood extraction ──
type Mood = "chill" | "bassy" | "melodic" | "dark" | "upbeat" | "romantic" | "aggressive" | "dreamy";
const MOOD_KEYWORDS: Record<Mood, string[]> = {
  chill: ["chill", "relax", "calm", "mellow", "smooth", "soft"],
  bassy: ["bass", "808", "banger", "drop"],
  melodic: ["melodic", "melody", "piano", "guitar"],
  dark: ["dark", "grimy", "raw", "underground"],
  upbeat: ["upbeat", "happy", "energetic", "party", "dance"],
  romantic: ["love", "heart", "romance", "baby"],
  aggressive: ["hard", "heavy", "aggressive", "intense"],
  dreamy: ["dream", "float", "cloud", "space", "atmospheric"],
};

function extractMoods(text: string): Mood[] {
  const lower = text.toLowerCase();
  const moods: Mood[] = [];
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) { moods.push(mood as Mood); break; }
    }
  }
  return moods;
}

// Genre → mood mapping
const GENRE_MOODS: Record<string, Mood[]> = {
  "hip-hop": ["bassy", "aggressive"], "trap": ["bassy", "dark", "aggressive"],
  "r&b": ["romantic", "chill"], "rnb": ["romantic", "chill"], "soul": ["romantic", "melodic"],
  "house": ["upbeat", "dreamy"], "techno": ["dark", "aggressive"],
  "edm": ["upbeat", "bassy"], "dubstep": ["bassy", "aggressive", "dark"],
  "jazz": ["melodic", "chill"], "classical": ["melodic", "dreamy"],
  "pop": ["upbeat", "romantic"], "indie": ["dreamy", "melodic"],
  "rock": ["aggressive", "upbeat"], "metal": ["aggressive", "dark"],
  "synthwave": ["dreamy", "dark"], "punk": ["aggressive", "upbeat"],
  "folk": ["melodic", "chill"], "lo-fi": ["chill", "dreamy"],
  "chill": ["chill", "dreamy"], "ambient": ["chill", "dreamy"],
  "drill": ["aggressive", "dark", "bassy"], "afrobeats": ["upbeat", "bassy"],
  "reggae": ["chill", "upbeat"], "blues": ["melodic", "dark"],
};

// GET /api/playlists/recommendations
//
// Algorithm v4 — content-based + collaborative:
// 1. RICH SIGNALS: accepts full taste profile (genres, artists, moods, history)
// 2. CONTENT-BASED FILTERING: compares playlist tracks against user's taste at track level
// 3. GENRE RELATIONSHIP SCORING: uses genre graph for fuzzy genre matching
// 4. MOOD ALIGNMENT: matches playlist's mood profile against user's mood preferences
// 5. QUALITY GATES: minimum 3 tracks, minimum 2 unique artists, not spam
// 6. ENERGY AWARENESS: match playlist energy to time-of-day
// 7. IMPROVED COLLABORATIVE FILTERING: also uses track-level co-occurrence
async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId || "";
    const { searchParams } = new URL(req.url);
    
    // v4: richer signal inputs
    const likedTags = (searchParams.get("likedTags") || "").split(",").filter(Boolean).map((t) => t.trim().toLowerCase());
    const likedArtists = (searchParams.get("likedArtists") || "").split(",").filter(Boolean).map((a) => a.trim().toLowerCase());
    const dislikedTags = (searchParams.get("dislikedTags") || "").split(",").filter(Boolean).map((t) => t.trim().toLowerCase());
    
    // v4: new parameters
    const topGenres = (searchParams.get("topGenres") || "").split(",").filter(Boolean).map((g) => normalizeGenre(g));
    const userMoodsParam = (searchParams.get("moods") || "").split(",").filter(Boolean) as Mood[];
    const dislikedGenresParam = (searchParams.get("dislikedGenres") || "").split(",").filter(Boolean).map((g) => normalizeGenre(g));
    const languagePreference = searchParams.get("lang") || "mixed";
    
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
    let similarUserIds = new Set<string>();
    if (userId && likedPlaylistIds.size > 0) {
      const userLikedArr = [...likedPlaylistIds];
      const similarTaste = await db.playlistLike.findMany({
        where: {
          playlistId: { in: userLikedArr.slice(0, 10) },
          userId: { not: userId },
        },
        select: { userId: true, playlistId: true },
        take: 100,
      });
      const userCoLikeCounts = new Map<string, number>();
      for (const like of similarTaste) {
        userCoLikeCounts.set(like.userId, (userCoLikeCounts.get(like.userId) || 0) + 1);
      }
      for (const [uid, count] of userCoLikeCounts) {
        if (count >= 2) similarUserIds.add(uid);
      }
    }

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

    // Build user genre set (from tags + explicit topGenres)
    const userGenreSet = new Set([...likedTags, ...topGenres]);
    const dislikedGenresSet = new Set([...dislikedTags, ...dislikedGenresParam]);
    
    // Build user mood set
    const userMoods = new Set<Mood>(userMoodsParam);
    // Also derive moods from user's genres if not explicitly provided
    if (userMoods.size === 0 && userGenreSet.size > 0) {
      for (const g of [...userGenreSet].slice(0, 3)) {
        const moods = GENRE_MOODS[g] || [];
        for (const m of moods) userMoods.add(m);
      }
    }

    // Score each playlist
    const normalizedLikedTags = likedTags.map(t => normalizeGenre(t));
    const normalizedDislikedTags = dislikedTags.map(t => normalizeGenre(t));

    const scored = playlists
      .filter((p) => {
        if (likedPlaylistIds.has(p.id)) return false;
        let tracks: any[] = [];
        try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { return false; }
        // v4: QUALITY GATE — minimum 3 tracks
        if (tracks.length < 3) return false;
        return true;
      })
      .map((p) => {
        let tracks: any[] = [];
        try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { tracks = []; }

        let score = 0;
        
        // Extract playlist metadata
        const playlistTags = (p.tags || "").split(",").map((t) => normalizeGenre(t)).filter(Boolean);
        const playlistArtists = [...new Set(tracks.map((t: any) => (t.artist || "").toLowerCase().trim()).filter(Boolean))];
        const playlistGenres = [...new Set(tracks.map((t: any) => normalizeGenre(t.genre || "")).filter(Boolean))];
        
        // Extract playlist mood profile from track titles + genres
        const playlistMoods = new Set<Mood>();
        for (const t of tracks.slice(0, 10)) {
          for (const m of extractMoods(`${t.title || ""} ${t.genre || ""}`)) {
            playlistMoods.add(m);
          }
        }
        // Also add moods from playlist genres
        for (const g of playlistGenres) {
          const moods = GENRE_MOODS[g] || [];
          for (const m of moods) playlistMoods.add(m);
        }

        // ── 1. CONTENT-BASED GENRE OVERLAP (0-50 points) ──
        // v4: Compare playlist tracks' genres against user's full genre profile
        const userExpandedGenres = new Set(userGenreSet);
        // Expand user genres with related genres (1 hop) for fuzzy matching
        for (const ug of [...userGenreSet]) {
          for (const rg of getRelatedGenres(ug)) userExpandedGenres.add(normalizeGenre(rg));
        }
        
        for (const pg of playlistGenres) {
          const pgNorm = normalizeGenre(pg);
          // Direct match with user genres
          if (userGenreSet.has(pgNorm)) score += 10;
          // Fuzzy match with expanded genres (lower weight)
          else if (userExpandedGenres.has(pgNorm)) score += 4;
          // Related genre match
          else {
            for (const ug of userGenreSet) {
              const related = getRelatedGenres(ug);
              if (related.includes(pgNorm) || pgNorm.includes(normalizeGenre(ug))) {
                score += 3;
                break;
              }
            }
          }
        }

        // ── 2. TAG OVERLAP (0-35 points) ──
        for (const lt of normalizedLikedTags) {
          for (const pt of playlistTags) {
            if (pt === lt || pt.includes(lt) || lt.includes(pt)) score += 12;
          }
        }

        // ── 3. ARTIST OVERLAP (0-30 points) ──
        for (const la of likedArtists) {
          for (const pa of playlistArtists) {
            if (pa === la || pa.includes(la) || la.includes(pa)) score += 20;
          }
        }

        // ── 4. MOOD ALIGNMENT (0-25 points) — NEW in v4 ──
        if (userMoods.size > 0 && playlistMoods.size > 0) {
          let moodMatches = 0;
          for (const um of userMoods) {
            if (playlistMoods.has(um)) moodMatches++;
          }
          score += Math.min(25, moodMatches * 8);
        }

        // ── 5. TIME-OF-DAY BONUS (0-20 points) ──
        for (const tg of timeGenres) {
          const norm = normalizeGenre(tg);
          for (const pt of playlistTags) {
            if (pt === norm || pt.includes(norm) || norm.includes(pt)) { score += 15; break; }
          }
          // Check track genres too
          for (const pg of playlistGenres) {
            if (pg === norm || pg.includes(norm) || norm.includes(pg)) { score += 10; break; }
          }
        }

        // ── 6. DISLIKED GENRE/TAG PENALTY (-25 per match) ──
        for (const dt of dislikedGenresSet) {
          for (const pg of playlistGenres) {
            if (pg === dt || pg.includes(dt) || dt.includes(pg)) score -= 25;
          }
          for (const pt of playlistTags) {
            if (pt === dt || pt.includes(dt) || dt.includes(pt)) score -= 15;
          }
        }

        // ── 7. COLLABORATIVE FILTERING BONUS (0-30 points) ──
        if (collaborativePlaylistIds.has(p.id)) {
          score += 30;
        }

        // ── 8. LANGUAGE PREFERENCE (0-15 points) — NEW in v4 ──
        if (languagePreference !== "mixed") {
          const russianTracks = tracks.filter((t: any) => {
            const text = `${t.title || ""} ${t.artist || ""}`;
            const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
            const latin = (text.match(/[a-zA-Z]/g) || []).length;
            const total = cyrillic + latin;
            return total > 0 && cyrillic / total > 0.4;
          }).length;
          const englishTracks = tracks.filter((t: any) => {
            const text = `${t.title || ""} ${t.artist || ""}`;
            const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
            const latin = (text.match(/[a-zA-Z]/g) || []).length;
            const total = cyrillic + latin;
            return total > 0 && latin / total > 0.6;
          }).length;
          
          if (languagePreference === "russian" && russianTracks > tracks.length * 0.3) score += 15;
          else if (languagePreference === "english" && englishTracks > tracks.length * 0.3) score += 15;
        }

        // ── 9. POPULARITY BONUS (0-15 points) ──
        score += Math.min(15, (p._count?.likes || 0) * 2 + p.playCount * 0.5);

        // ── 10. RECENCY BONUS ──
        const daysSinceCreation = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-daysSinceCreation / 30);
        score += Math.round(recencyWeight * 15);

        // ── 11. QUALITY BONUSES ──
        // Track count
        if (tracks.length >= 15) score += 5;
        else if (tracks.length >= 8) score += 4;
        else if (tracks.length >= 5) score += 2;
        
        // Artist diversity — penalize playlists with too few unique artists
        if (playlistArtists.length >= 8) score += 5;
        else if (playlistArtists.length >= 5) score += 3;
        else if (playlistArtists.length >= 3) score += 1;
        else if (playlistArtists.length < 2 && tracks.length > 5) score -= 10; // likely a "best of single artist" — less interesting

        // ── 12. EXPLORATION BONUS ──
        const hasOverlap = normalizedLikedTags.some(lt => playlistTags.some(pt => pt.includes(lt) || lt.includes(pt)))
          || likedArtists.some(la => playlistArtists.some(pa => pa.includes(la) || la.includes(pa)))
          || [...userGenreSet].some(ug => playlistGenres.some(pg => pg.includes(normalizeGenre(ug)) || normalizeGenre(ug).includes(pg)));
        if (!hasOverlap && playlistGenres.length > 0) score += 8;

        // ── 13. RANDOMNESS ──
        score += Math.random() * 10 - 5;

        return { ...p, tracks, _score: score, _tags: playlistTags, _artists: playlistArtists, _genres: playlistGenres, _moods: [...playlistMoods], _isCollaborative: collaborativePlaylistIds.has(p.id) };
      })
      .filter((p) => p._score > 0) // Lowered threshold from 5 to 0
      .sort((a, b) => b._score - a._score);

    // 65/35 exploitation vs exploration split (was 70/30)
    const exploitableCount = Math.ceil(limit * 0.65);
    const explorationCount = limit - exploitableCount;
    const exploitation = scored.filter(p => p._tags.some(t =>
      normalizedLikedTags.some(lt => t.includes(lt) || lt.includes(t))
    ) || p._genres.some(g =>
      [...userGenreSet].some(ug => g.includes(normalizeGenre(ug)) || normalizeGenre(ug).includes(g))
    )).slice(offset, offset + exploitableCount);
    const exploration = scored.filter(p => !exploitation.some(e => e.id === p.id))
      .sort(() => Math.random() - 0.5)
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

    // Fallback: popular playlists filtered by disliked tags/genres
    if (result.length < limit) {
      const existingIds = new Set(result.map((r) => r.id));
      const fallback = playlists
        .filter((p) => {
          if (existingIds.has(p.id)) return false;
          let tracks: any[] = [];
          try { tracks = JSON.parse(p.tracksJson || "[]"); } catch { return false; }
          if (tracks.length < 3) return false; // Same quality gate
          const plGenres = [...new Set(tracks.map((t: any) => normalizeGenre(t.genre || "")).filter(Boolean))];
          const plTags = (p.tags || "").split(",").map((t) => normalizeGenre(t)).filter(Boolean);
          for (const dg of dislikedGenresSet) {
            for (const pg of plGenres) {
              if (pg === dg || pg.includes(dg) || dg.includes(pg)) return false;
            }
            for (const pt of plTags) {
              if (pt === dg || pt.includes(dg) || dg.includes(pt)) return false;
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
      _meta: { timeContext, similarUsersFound: similarUserIds.size, userMoods: [...userMoods], userGenres: [...userGenreSet] },
    });
  } catch (error) {
    console.error("GET /api/playlists/recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
