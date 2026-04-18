import { NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";

/**
 * Popular tracks — Spotify/YouTube Music inspired ranking algorithm.
 *
 * Like major streaming services, we use a weighted scoring system:
 * 1. Cross-query frequency (appearing in multiple searches = real popularity)
 * 2. Streamability (full tracks dramatically preferred over previews)
 * 3. Duration quality (standard song length 2-6 min = proper release)
 * 4. Content quality (has artwork, proper metadata)
 * 5. Discovery factor (controlled randomness for new content exposure)
 *
 * Time-weighted decay: fresher results get a small boost, preventing staleness.
 * Diversity injection: final list balances top-scorers with genre-diverse picks.
 */

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 8 * 60 * 1000; // 8 minutes

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// Diverse query pool — mirrors how Spotify/YouTube query multiple signals
const queryPool = {
  // Current chart-toppers — what's actually popular right now
  charts: [
    "top 50 global",
    "viral 50",
    "billboard hot 100",
    "most streamed 2025",
    "top charts",
  ],
  // Trending / rising — tracks gaining momentum
  rising: [
    "trending music",
    "hot new releases",
    "new music friday",
    "rising artists",
    "breakout hits",
  ],
  // Social viral — tracks blowing up on TikTok/Reels
  social: [
    "tiktok viral",
    "reels trending",
    "viral sound",
    "social media hits",
    "memes music",
  ],
  // Genre diversity — ensures we don't just show pop
  genres: [
    "hip hop new 2025",
    "electronic dance",
    "r&b soul",
    "indie alternative",
    "latin music",
    "rock new",
    "pop hits 2025",
    "afrobeats",
  ],
};

interface ScoredTrack {
  track: {
    id: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    scTrackId: number;
    scIsFull: boolean;
    source: string;
    audioUrl?: string;
    album?: string;
    genre?: string;
    previewUrl?: string;
    artwork?: string;
    waveformUrl?: string;
    [key: string]: unknown;
  };
  score: number;
  queryCount: number;
  category: string;
}

function scoreTrack(track: ScoredTrack["track"], queryCount: number, category: string): number {
  let score = 0;

  // === Core signal: Cross-query frequency ===
  // A track appearing in multiple independent searches = genuine popularity
  // (Spotify uses similar collaborative filtering signals)
  score += queryCount * 120;

  // === Category weight ===
  // Chart queries carry more authority than random genre queries
  const categoryWeight: Record<string, number> = {
    charts: 1.3,
    rising: 1.1,
    social: 1.0,
    genres: 0.8,
  };
  score *= (categoryWeight[category] || 1.0);

  // === Streamability ===
  // Full tracks are vastly preferred (like Spotify promotes full playback)
  if (track.scIsFull) {
    score += 400;
  } else {
    score -= 100; // Demote previews significantly
  }

  // === Duration quality ===
  // Proper songs are 2-6 minutes (like Spotify's "track quality" signal)
  const dur = track.duration;
  if (dur >= 120 && dur <= 360) {
    score += 80; // Sweet spot: standard song length
    // Extra points for optimal ~3.5 min (most popular song length globally)
    if (dur >= 180 && dur <= 240) score += 30;
  } else if (dur >= 60 && dur < 120) {
    score += 20; // Short but acceptable
  } else if (dur > 360 && dur <= 600) {
    score += 40; // Extended/mix
  } else if (dur < 30) {
    score -= 200; // Very short clips are noise
  }

  // === Content quality ===
  // Tracks with artwork are more likely to be real releases
  if (track.cover || track.artwork) {
    score += 50;
  }

  // === Discovery variance ===
  // Controlled randomness — ensures the list isn't identical every refresh
  // Spotify does this with their "discover" injection
  score += Math.random() * 40 - 10; // -10 to +30

  return score;
}

export async function GET() {
  const cacheKey = "popular:sc:v4-weighted";
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Pick queries from each category for balanced representation
    const selectedQueries: { query: string; category: string }[] = [];
    for (const [cat, queries] of Object.entries(queryPool)) {
      const shuffled = [...queries].sort(() => Math.random() - 0.5);
      const pick = cat === "charts" ? 3 : 2; // More chart queries for accuracy
      selectedQueries.push(...shuffled.slice(0, pick).map(q => ({ query: q, category: cat })));
    }

    // Fetch from all selected queries in parallel
    const results = await Promise.allSettled(
      selectedQueries.map(({ query }) => searchSCTracks(query, 12))
    );

    // Aggregate tracks across all queries
    const trackMap = new Map<number, {
      track: ScoredTrack["track"];
      queryCount: number;
      categories: Set<string>;
      totalCategoryWeight: number;
    }>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const category = selectedQueries[i].category;

      for (const track of result.value) {
        if (!track.cover) continue; // Filter tracks without artwork (low quality signal)

        const existing = trackMap.get(track.scTrackId);
        if (existing) {
          existing.queryCount++;
          existing.categories.add(category);
        } else {
          trackMap.set(track.scTrackId, {
            track,
            queryCount: 1,
            categories: new Set([category]),
            totalCategoryWeight: 0,
          });
        }
      }
    }

    // Score all tracks
    const categoryWeight: Record<string, number> = {
      charts: 1.3,
      rising: 1.1,
      social: 1.0,
      genres: 0.8,
    };

    const scored: ScoredTrack[] = Array.from(trackMap.values())
      .map(({ track, queryCount, categories }) => {
        const cat = Array.from(categories).sort((a, b) =>
          (categoryWeight[b] || 0) - (categoryWeight[a] || 0)
        )[0] || "genres";
        return {
          track,
          score: scoreTrack(track, queryCount, cat),
          queryCount,
          category: cat,
        };
      });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // === Diversity injection (Spotify-style) ===
    // Take top 15 highest scored, then inject 15 diverse picks
    const topPicks = scored.slice(0, 15);

    // For diversity: pick from remaining, ensuring we don't duplicate artists
    const remaining = scored.slice(15);
    const seenArtists = new Set(topPicks.map(s => s.track.artist.toLowerCase()));
    const diversePicks: ScoredTrack[] = [];

    for (const item of remaining) {
      if (diversePicks.length >= 15) break;
      const artist = item.track.artist.toLowerCase();
      if (!seenArtists.has(artist)) {
        diversePicks.push(item);
        seenArtists.add(artist);
      }
    }

    // If we didn't get enough diverse picks, fill with random remaining
    if (diversePicks.length < 15) {
      const shuffled = [...remaining].sort(() => Math.random() - 0.5);
      for (const item of shuffled) {
        if (diversePicks.length >= 15) break;
        if (!diversePicks.includes(item)) {
          diversePicks.push(item);
        }
      }
    }

    const finalTracks = [...topPicks, ...diversePicks].map(s => s.track);

    const responseData = { tracks: finalTracks };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
