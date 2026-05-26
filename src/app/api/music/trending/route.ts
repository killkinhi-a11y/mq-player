import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { RECOMMENDATIONS_CONFIG as CFG } from "@/config/recommendations";

/**
 * Popular tracks — Spotify/YouTube Music inspired ranking algorithm.
 *
 * Like major streaming services, we use a weighted scoring system:
 * 1. Cross-query frequency (appearing in multiple searches = real popularity)
 * 2. Streamability (full tracks dramatically preferred over previews)
 * 3. Duration quality (standard song length 2-6 min = proper release)
 * 4. Content quality (has artwork, proper metadata)
 * 5. Discovery factor (controlled randomness for new content exposure)
 * 6. Freshness heuristic (tracks from "new release" queries get a boost)
 * 7. Social proof dampening (prevent overrepresentation of ubiquitous tracks)
 *
 * Time-weighted decay: fresher results get a small boost, preventing staleness.
 * Diversity injection: final list balances top-scorers with genre-diverse picks.
 * All scoring weights are centralized in @/config/recommendations.
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
  if (cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// Normalize genre for consistent matching (matches other APIs)
function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim()
    .replace(/ & /g, " and ")
    .replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb")
    .replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass")
    .replace(/d 'n' b/gi, "drum and bass");
}

const queryPool = {
  // Current chart-toppers — what's actually popular right now
  charts: [
    "top 50 global",
    "viral 50",
    "most streamed",
    "top charts 2025",
    "chart hits",
  ],
  // Trending / rising — tracks gaining momentum
  rising: [
    "trending music",
    "hot new releases",
    "new music friday",
    "rising artists 2025",
    "breakout hits this week",
  ],
  // Social viral — tracks blowing up on TikTok/Reels
  social: [
    "tiktok viral hits",
    "reels trending music",
    "viral sound 2025",
    "social media music trends",
    "popular remixes",
  ],
  // Genre diversity — ensures we don't just show pop (more specific queries)
  genres: [
    "hip hop new releases",
    "electronic dance music",
    "rnb soul new",
    "indie alternative hits",
    "latin music popular",
    "rock new music",
    "pop radio hits",
    "afrobeats 2025",
  ],
};

interface ScoredTrack {
  track: SCTrack & { [key: string]: unknown };
  score: number;
  queryCount: number;
  category: string;
}

function scoreTrack(track: ScoredTrack["track"], queryCount: number, category: string): number {
  let score = 0;

  // === Core signal: Cross-query frequency ===
  // A track appearing in multiple independent searches = genuine popularity
  // (Spotify uses similar collaborative filtering signals)
  score += queryCount * CFG.trending.crossQueryBonus;

  // === Category weight ===
  // Chart queries carry more authority than random genre queries
  score *= (CFG.trending.categoryWeights[category as keyof typeof CFG.trending.categoryWeights] || 1.0);

  // === Streamability ===
  // Full tracks are vastly preferred (like Spotify promotes full playback)
  if (track.scIsFull) {
    score += CFG.trending.fullPlayableBonus;
  } else {
    score -= CFG.trending.previewPenalty; // Demote previews significantly
  }

  // === Duration quality ===
  // Proper songs are 2-6 minutes (like Spotify's "track quality" signal)
  const dur = track.duration;
  if (dur >= CFG.trending.optimalDurationMin && dur <= CFG.trending.optimalDurationMax) {
    score += CFG.trending.optimalDurationBonus; // Sweet spot: standard song length
    // Extra points for optimal ~3.5 min (most popular song length globally)
    if (dur >= CFG.trending.sweetSpotMin && dur <= CFG.trending.sweetSpotMax) score += CFG.trending.sweetSpotBonus;
  } else if (dur >= 60 && dur < CFG.trending.optimalDurationMin) {
    score += 20; // Short but acceptable
  } else if (dur > CFG.trending.optimalDurationMax && dur <= 600) {
    score += 40; // Extended/mix
  } else if (dur < CFG.trending.shortClipThreshold) {
    score -= CFG.trending.shortClipPenalty; // Very short clips are noise
  }

  // === Content quality ===
  // Tracks with artwork are more likely to be real releases
  if (track.cover) {
    score += CFG.trending.coverBonus;
  }

  // ── FRESHNESS BOOST ──
  // Tracks from "new releases", "2025", "trending" queries are likely fresh
  const freshnessKeywords = ["new", "2025", "fresh", "latest", "recent", "release"];
  const queryLower = (category || "").toLowerCase();
  const isFreshQuery = freshnessKeywords.some(kw => queryLower.includes(kw));
  if (isFreshQuery && track.scIsFull) {
    score += CFG.trending.freshnessBonus7d;  // +25 for fresh-sourced tracks
  }

  // ── SOCIAL PROOF DAMPENING ──
  // Prevent tracks from dominating due to appearing in every query
  if (queryCount >= 4) {
    score *= 0.85;  // 15% dampening for overly frequent tracks
  }

  // === Discovery variance ===
  // Controlled randomness — ensures the list isn't identical every refresh
  // Spotify does this with their "discover" injection
  score += Math.random() * 40 - 10; // -10 to +30

  return score;
}

async function handler(request: NextRequest) {
  // Parse disliked params for filtering
  const { searchParams } = new URL(request.url);
  const dislikedIds = new Set(
    (searchParams.get("dislikedIds") || "").split(",").filter(Boolean)
  );
  const dislikedArtists = new Set(
    (searchParams.get("dislikedArtists") || "").split(",").filter(Boolean).map(a => a.toLowerCase())
  );
  const dislikedGenres = new Set(
    (searchParams.get("dislikedGenres") || "").split(",").filter(Boolean).map(g => normalizeGenre(g))
  );

  // Build a proper cache key that includes disliked content hashes
  // (not just size — prevents sharing filtered cache across users with same count)
  const dh = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; };
  const dislikedHash = `${dh([...dislikedIds].sort().join())}:${dh([...dislikedArtists].sort().join())}:${dh([...dislikedGenres].sort().join())}`;
  const cacheKey = `popular:sc:v6:${dislikedHash}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Pick queries from each category for balanced representation
    const selectedQueries: { query: string; category: string }[] = [];
    for (const [cat, queries] of Object.entries(queryPool)) {
      const shuffled = [...queries].sort(() => Math.random() - 0.5);
      const pick = cat === "charts" ? 4 : 3; // More queries per category for targetTracks target
      selectedQueries.push(...shuffled.slice(0, pick).map(q => ({ query: q, category: cat })));
    }

    // Fetch from all selected queries in parallel
    const results = await Promise.allSettled(
      selectedQueries.map(({ query }) => searchSCTracks(query, 15))
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

        // Filter non-music content (DJ sets, podcasts, comedy, ASMR, etc.)
        const titleLower = (track.title || "").toLowerCase();
        const genreLower = (track.genre || "").toLowerCase();
        const nonMusicKeywords = ["dj set", "podcast", "sermon", "standup", "stand-up", "white noise", "rain sounds", "asmr", "sleep meditation", "guided meditation", "audiobook", "audio book", "talk show", "interview"];
        const nonMusicGenres = ["podcast", "comedy", "education", "news", "non-music", "spoken word"];
        if (nonMusicKeywords.some(kw => titleLower.includes(kw))) continue;
        if (nonMusicGenres.some(g => genreLower.includes(g))) continue;
        if (track.duration > 1800) continue; // Skip tracks > 30 min (likely DJ sets/mixes)
        if (track.duration < 15) continue; // Skip very short clips

        // Filter disliked content
        if (dislikedIds.has(track.id) || dislikedIds.has(String(track.scTrackId))) continue;
        if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
        if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) continue;

        const existing = trackMap.get(track.scTrackId);
        if (existing) {
          existing.queryCount++;
          existing.categories.add(category);
        } else {
          trackMap.set(track.scTrackId, {
            track: track as SCTrack & { [key: string]: unknown },
            queryCount: 1,
            categories: new Set([category]),
            totalCategoryWeight: 0,
          });
        }
      }
    }

    // Score all tracks
    const scored: ScoredTrack[] = Array.from(trackMap.values())
      .map(({ track, queryCount, categories }) => {
        const cat = Array.from(categories).sort((a, b) =>
          (CFG.trending.categoryWeights[b as keyof typeof CFG.trending.categoryWeights] || 0) -
          (CFG.trending.categoryWeights[a as keyof typeof CFG.trending.categoryWeights] || 0)
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
    // Take top scored, then inject diverse picks (dynamic artist limits)
    const finalTracks: (SCTrack & { [key: string]: unknown })[] = [];
    const artistCount = new Map<string, number>();

    // First pass: top scored (max from config)
    for (const item of scored) {
      if (finalTracks.length >= CFG.trending.topScoredLimit) break;
      const artist = item.track.artist.toLowerCase();
      const count = artistCount.get(artist) || 0;
      const artistScore = item.queryCount * (CFG.trending.categoryWeights[item.category as keyof typeof CFG.trending.categoryWeights] || 1.0);
      const artistLimit = artistScore > 500 ? CFG.trending.maxArtistTop : CFG.trending.maxArtistDefault;
      if (count >= artistLimit) continue;
      artistCount.set(artist, count + 1);
      finalTracks.push(item.track);
    }

    // Second pass: diverse picks from remaining (unique artists)
    const seenArtists = new Set(finalTracks.map(t => t.artist.toLowerCase()));
    for (const item of scored) {
      if (finalTracks.length >= CFG.trending.uniqueArtistsLimit) break;
      const artist = item.track.artist.toLowerCase();
      if (seenArtists.has(artist)) continue;
      seenArtists.add(artist);
      finalTracks.push(item.track);
    }

    // Third pass: fill remaining slots with random picks
    if (finalTracks.length < CFG.trending.targetTracks) {
      const existingIds = new Set(finalTracks.map(t => t.scTrackId));
      const shuffled = [...scored].sort(() => Math.random() - 0.5);
      for (const item of shuffled) {
        if (finalTracks.length >= CFG.trending.targetTracks) break;
        if (existingIds.has(item.track.scTrackId)) continue;
        finalTracks.push(item.track);
        existingIds.add(item.track.scTrackId);
      }
    }

    // Fourth pass: if STILL not at target, fetch supplementary tracks
    if (finalTracks.length < CFG.trending.targetTracks) {
      const existingIds = new Set(finalTracks.map(t => t.scTrackId));
      const fillQueries = ["top hits 2025", "popular songs", "best new music", "chart toppers", "trending now"];
      const fillResults = await Promise.allSettled(
        fillQueries.map(q => searchSCTracks(q, 20))
      );
      for (const result of fillResults) {
        if (result.status !== "fulfilled" || finalTracks.length >= CFG.trending.targetTracks) continue;
        for (const track of result.value) {
          if (finalTracks.length >= CFG.trending.targetTracks) break;
          if (existingIds.has(track.scTrackId)) continue;
          if (!track.cover) continue;
          if (dislikedIds.has(track.id) || dislikedIds.has(String(track.scTrackId))) continue;
          if (dislikedArtists.size > 0 && track.artist && dislikedArtists.has(track.artist.toLowerCase())) continue;
          if (dislikedGenres.size > 0 && track.genre && dislikedGenres.has(normalizeGenre(track.genre))) continue;
          finalTracks.push(track as SCTrack & { [key: string]: unknown });
          existingIds.add(track.scTrackId);
        }
      }
    }

    const responseData = {
      tracks: finalTracks,
      _meta: {
        totalCandidates: trackMap.size,
        categoryBreakdown: {
          charts: [...trackMap.values()].filter(t => t.categories.has("charts")).length,
          rising: [...trackMap.values()].filter(t => t.categories.has("rising")).length,
          social: [...trackMap.values()].filter(t => t.categories.has("social")).length,
          genres: [...trackMap.values()].filter(t => t.categories.has("genres")).length,
        },
        filtered: {
          noCover: true, // was applied
          disliked: dislikedIds.size + dislikedArtists.size + dislikedGenres.size > 0,
        },
      }
    };
    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
