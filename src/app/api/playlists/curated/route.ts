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

// Search queries for each playlist (primary queries + extra fallbacks for padding to 50)
const SEARCH_QUERIES: Record<string, string[]> = {
  "for-you": [], // filled dynamically from user data
  discoveries: [
    "indie alternative", "lo-fi new artists", "experimental music", "indie pop discovery",
    "indie folk", "bedroom pop", "underground artists", "indie rock new",
    "alt pop 2024", "emerging artists",
  ],
  "new-releases": [
    "new music 2024", "popular this week", "top hits 2024", "new releases this month",
    "latest songs", "chart toppers", "new singles", "trending now",
    "fresh releases", "hot new music",
  ],
  "daily-1": [], // filled dynamically
  chill: [
    "chill beats", "relaxing music", "lo-fi hip hop", "ambient chill", "downtempo",
    "chillhop", "study beats", "relaxing instrumental", "mellow vibe",
    "chill lounge", "peaceful music",
  ],
  energy: [
    "workout music", "energy boost", "party mix", "gym motivation", "bass drop",
    "high energy songs", "adrenaline music", "pump up", "power workout",
    "intense workout music", "gym bangers",
  ],
  "hip-hop": [
    "hip hop new", "rap hits", "trap music", "drill beats",
    "hip hop 2024", "rap new releases", "trap bangers", "conscious hip hop",
    "underground rap", "hip hop mix",
  ],
  electronic: [
    "electronic music", "melodic house", "techno set", "indie electronic",
    "deep house", "future bass", "synthwave", "edm hits",
    "tech house", "electronic dance",
  ],
  "rnb-soul": [
    "rnb soul", "neo soul", "rnb new", "soulful music", "rnb hits",
    "rnb 2024", "soul music", "contemporary rnb", "afrobeats rnb",
    "smooth rnb", "rnb slow jams",
  ],
  rock: [
    "rock music", "alternative rock", "indie rock", "rock hits",
    "modern rock", "classic rock hits", "garage rock", "post punk",
    "hard rock", "progressive rock",
  ],
  jazz: [
    "jazz music", "lo-fi jazz", "jazz fusion", "smooth jazz",
    "jazz piano", "bossa nova", "jazz guitar", "contemporary jazz",
    "jazz instrumental", "swing jazz",
  ],
  classical: [
    "classical music", "piano instrumental", "orchestral", "neoclassical",
    "cello music", "violin classical", "symphony", "piano sonata",
    "string quartet", "film score classical",
  ],
};

// Universal fallback queries used when playlist-specific queries don't yield enough tracks
const UNIVERSAL_FALLBACK_QUERIES = [
  "popular music 2024",
  "top hits this week",
  "best songs",
  "chart music",
  "viral hits",
  "mainstream hits",
  "radio hits 2024",
  "music mix",
];

// Keep a cache to avoid re-searching on every request
const cache = new Map<string, { playlists: CuratedPlaylist[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function searchAndBuildTracks(queries: string[], limit: number, playlistId?: string) {
  const allTracks: CuratedPlaylist["tracks"] = [];
  const seen = new Set<string>();

  const addTrack = (t: CuratedPlaylist["tracks"][0]) => {
    if (!seen.has(String(t.scTrackId))) {
      seen.add(String(t.scTrackId));
      allTracks.push(t);
    }
  };

  const processResults = async (query: string, fetchLimit: number) => {
    try {
      const results = await searchSCTracks(query, fetchLimit);
      for (const t of results) {
        addTrack({
          id: `sc_${t.scTrackId}`,
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
  };

  // --- Pass 1: Primary queries (up to 8 queries, fetch up to 50 per query) ---
  const primaryQueries = queries.slice(0, 8);
  for (const query of primaryQueries) {
    if (allTracks.length >= limit) break;
    const remaining = limit - allTracks.length;
    const fetchLimit = Math.min(50, Math.max(15, remaining));
    await processResults(query, fetchLimit);
  }

  if (allTracks.length >= limit) return allTracks;

  // --- Pass 2: Extra fallback queries specific to the playlist from SEARCH_QUERIES ---
  if (playlistId && SEARCH_QUERIES[playlistId]) {
    const fallbackQueries = SEARCH_QUERIES[playlistId].filter(q => !primaryQueries.includes(q));
    for (const query of fallbackQueries.slice(0, 6)) {
      if (allTracks.length >= limit) break;
      const remaining = limit - allTracks.length;
      const fetchLimit = Math.min(50, Math.max(15, remaining));
      await processResults(query, fetchLimit);
    }
  }

  if (allTracks.length >= limit) return allTracks;

  // --- Pass 3: Universal fallback queries (broad popular music searches) ---
  for (const query of UNIVERSAL_FALLBACK_QUERIES) {
    if (allTracks.length >= limit) break;
    const remaining = limit - allTracks.length;
    const fetchLimit = Math.min(50, Math.max(15, remaining));
    await processResults(query, fetchLimit);
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

    // Build "for-you" queries from user data — expanded for guaranteed 50 tracks
    const forYouQueries: string[] = [];
    if (topArtists.length > 0) {
      // Individual artist searches yield more results than combined
      forYouQueries.push(topArtists[0]);
      if (topArtists.length > 1) forYouQueries.push(topArtists[1]);
      // Combined artist search
      forYouQueries.push(topArtists.slice(0, 2).join(" "));
    }
    if (topGenres.length > 0) {
      // Individual genre searches
      forYouQueries.push(`${topGenres[0]} music`);
      if (topGenres.length > 1) forYouQueries.push(`${topGenres[1]} music`);
      // Combined genres
      forYouQueries.push(topGenres.slice(0, 2).join(" "));
    }
    // Cross genre-artist queries for diversity
    if (topArtists.length > 0 && topGenres.length > 0) {
      forYouQueries.push(`${topArtists[0]} ${topGenres[0]}`);
    }
    // Year-based popular queries as filler
    forYouQueries.push("popular hits", "top songs 2024");
    if (forYouQueries.length === 0) {
      forYouQueries.push("popular music", "top hits mix", "best songs 2024", "trending music");
    }

    // Build "daily" queries — expanded for guaranteed 50 tracks
    const dailyQueries: string[] = [];
    if (topArtists.length > 0) {
      dailyQueries.push(`${topArtists[0]} mix`);
      dailyQueries.push(topArtists[0]);
      dailyQueries.push(`${topArtists[0]} songs`);
      if (topArtists.length > 1) {
        dailyQueries.push(`${topArtists[1]} mix`);
        dailyQueries.push(`${topArtists[0]} ${topArtists[1]}`);
      }
    }
    // Always add filler queries for daily mix
    dailyQueries.push("daily mix", "today hits", "popular mix 2024");

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

          const tracks = await searchAndBuildTracks(queries, 50, config.id);
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
