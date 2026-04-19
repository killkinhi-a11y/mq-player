import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: {
    id: string;
    title: string;
    artist: string;
    album: string;
    cover: string;
    duration: number;
    genre: string;
    audioUrl: string;
    previewUrl: string;
    source: "soundcloud";
    scTrackId: number | null;
    scStreamPolicy: string;
    scIsFull: boolean;
  }[];
}

const CURATED_CONFIGS = [
  {
    id: "for-you",
    name: "Для вас",
    subtitle: "обновлён сегодня",
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    id: "discoveries",
    name: "Открытия",
    subtitle: "Новое для вас",
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
  {
    id: "new-releases",
    name: "Новинки",
    subtitle: "обновлён сегодня",
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  },
  {
    id: "daily-1",
    name: "Микс дня",
    subtitle: "Ваш ежедневный микс",
    gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  },
  {
    id: "chill",
    name: "Chill",
    subtitle: "Расслабляющая музыка",
    gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
  },
  {
    id: "energy",
    name: "Энергия",
    subtitle: "Зарядись музыкой",
    gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  },
  {
    id: "hip-hop",
    name: "Hip-Hop",
    subtitle: "Свежие хиты",
    gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  },
  {
    id: "electronic",
    name: "Электроника",
    subtitle: "Электронные биты",
    gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  },
  {
    id: "rnb-soul",
    name: "R&B / Соул",
    subtitle: "Гладкие ритмы",
    gradient: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)",
  },
  {
    id: "rock",
    name: "Рок",
    subtitle: "Гитарные хиты",
    gradient: "linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)",
  },
  {
    id: "jazz",
    name: "Джаз",
    subtitle: "Атмосферные мелодии",
    gradient: "linear-gradient(135deg, #ffd89b 0%, #19547b 100%)",
  },
  {
    id: "classical",
    name: "Классика",
    subtitle: "Инструментальная классика",
    gradient: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)",
  },
];

// Search queries for each playlist
const SEARCH_QUERIES: Record<string, string[]> = {
  "for-you": [], // filled dynamically from user data
  discoveries: ["indie alternative", "lo-fi new artists", "experimental music", "indie pop discovery"],
  "new-releases": ["new music 2025", "popular this week", "top hits 2025", "new releases this month"],
  "daily-1": [], // filled dynamically
  chill: ["chill beats", "relaxing music", "lo-fi hip hop", "ambient chill", "downtempo"],
  energy: ["workout music", "energy boost", "party mix", "gym motivation", "bass drop"],
  "hip-hop": ["hip hop new", "rap hits", "trap music", "drill beats"],
  electronic: ["electronic music", "edm mix", "deep house", "techno set"],
  "rnb-soul": ["rnb soul", "neo soul", "rnb new", "soulful music", "rnb hits"],
  "rock": ["rock music", "alternative rock", "indie rock", "rock hits 2025"],
  "jazz": ["jazz music", "lo-fi jazz", "jazz fusion", "smooth jazz"],
  "classical": ["classical music", "piano instrumental", "orchestral", "neoclassical"],
};

// Keep a cache to avoid re-searching on every request
const cache = new Map<string, { playlists: CuratedPlaylist[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function searchAndBuildTracks(queries: string[], limit: number) {
  const allTracks: CuratedPlaylist["tracks"] = [];
  const seen = new Set<string>();

  for (const query of queries.slice(0, 5)) {
    try {
      const perQuery = Math.min(20, Math.ceil((limit - allTracks.length) / Math.max(1, queries.slice(0, 5).length - queries.indexOf(query))));
      const results = await searchSCTracks(query, Math.max(10, perQuery));
      for (const t of results) {
        if (seen.has(String(t.scTrackId))) continue;
        seen.add(String(t.scTrackId));
        allTracks.push({
          id: `sc_${t.scTrackId}_${Date.now()}`,
          title: t.title,
          artist: t.artist,
          album: t.album,
          cover: t.cover,
          duration: t.duration,
          genre: t.genre,
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud",
          scTrackId: t.scTrackId,
          scStreamPolicy: t.scStreamPolicy,
          scIsFull: t.scIsFull,
        });
        if (allTracks.length >= limit) break;
      }
    } catch {}
    if (allTracks.length >= limit) break;
  }
  return allTracks;
}

async function handler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId || "";
    const topGenres = req.nextUrl.searchParams.get("genres")?.split(",").filter(Boolean) || [];
    const topArtists = req.nextUrl.searchParams.get("artists")?.split(",").filter(Boolean) || [];

    // Check cache
    const cacheKey = `${userId}_${topGenres.join(",")}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ playlists: cached.playlists });
    }

    // Build "for-you" queries from user data
    const forYouQueries: string[] = [];
    if (topArtists.length > 0) {
      forYouQueries.push(topArtists.slice(0, 2).join(" "));
    }
    if (topGenres.length > 0) {
      forYouQueries.push(topGenres.slice(0, 2).join(" music"));
    }
    if (forYouQueries.length === 0) {
      forYouQueries.push("popular music", "top hits mix");
    }

    // Build "daily" queries
    const dailyQueries = topArtists.length > 0
      ? topArtists.slice(0, 1).map(a => `${a} mix`)
      : ["daily mix", "today hits"];

    // Search for playlists in parallel (batch of 3 at a time)
    const playlists: CuratedPlaylist[] = [];
    const batchSize = 4;

    for (let i = 0; i < CURATED_CONFIGS.length; i += batchSize) {
      const batch = CURATED_CONFIGS.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (config) => {
          let queries = SEARCH_QUERIES[config.id] || [config.name];
          if (config.id === "for-you") queries = forYouQueries;
          if (config.id === "daily-1") queries = dailyQueries;

          const tracks = await searchAndBuildTracks(queries, 50);
          return {
            ...config,
            tracks,
          };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.tracks.length >= 2) {
          playlists.push(result.value);
        }
      }
    }

    // Update subtitle for "for-you" if user has data
    if (userId) {
      const forYou = playlists.find(p => p.id === "for-you");
      if (forYou) {
        forYou.subtitle = "обновлён сегодня";
      }
    }

    cache.set(cacheKey, { playlists, timestamp: Date.now() });

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error("Curated playlists error:", error);
    return NextResponse.json({ playlists: [] });
  }
}
export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
