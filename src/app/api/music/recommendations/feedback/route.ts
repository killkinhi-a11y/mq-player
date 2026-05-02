import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side feedback persistence for the self-developing recommendation algorithm.
 *
 * Collects anonymous listening feedback (genre completions, skips, artist preferences)
 * and aggregates it to improve recommendations for ALL users.
 *
 * Since the app is anonymous, we use a client-generated anonId (stored in localStorage)
 * as the user identifier. This allows feedback to persist across sessions even if
 * localStorage is cleared.
 *
 * Storage: In-memory Map with TTL-based cleanup (Edge-compatible).
 * In production, this would be backed by Redis or a database.
 */

export const runtime = "edge";

// ── Time decay ──
const FEEDBACK_TIME_DECAY_HOURS = 72; // 3-day half-life

function applyTimeDecay(baseScore: number, lastUpdated: number): number {
  const hoursOld = (Date.now() - lastUpdated) / 3600000;
  const decay = Math.exp(-hoursOld * Math.LN2 / FEEDBACK_TIME_DECAY_HOURS);
  return baseScore * decay;
}

// ── In-memory feedback store ──
interface UserFeedback {
  genreCompletions: Record<string, number>;
  genreSkips: Record<string, number>;
  artistCompletions: Record<string, number>;
  artistSkips: Record<string, number>;
  // Track listening depth per genre/artist
  genreTotalListenTime: Record<string, number>;  // total seconds listened per genre
  artistTotalListenTime: Record<string, number>; // total seconds listened per artist
  totalSessions: number;
  lastUpdated: number;
}

const feedbackStore = new Map<string, UserFeedback>();
const STORE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Aggregate stats (for collaborative filtering) ──
interface AggregateStats {
  genreScore: Record<string, number>;
  artistScore: Record<string, number>;
  totalUsers: number;
}

const aggregateStats: AggregateStats = {
  genreScore: {},
  artistScore: {},
  totalUsers: 0,
};

function getOrCreateUser(anonId: string): UserFeedback {
  let fb = feedbackStore.get(anonId);
  if (!fb) {
    fb = {
      genreCompletions: {},
      genreSkips: {},
      artistCompletions: {},
      artistSkips: {},
      genreTotalListenTime: {},
      artistTotalListenTime: {},
      totalSessions: 0,
      lastUpdated: Date.now(),
    };
    feedbackStore.set(anonId, fb);
  }
  return fb;
}

function cleanupStore() {
  const now = Date.now();
  for (const [key, fb] of feedbackStore) {
    if (now - fb.lastUpdated > STORE_TTL) {
      feedbackStore.delete(key);
    }
  }
}

// ── Feedback spam protection ──
const validateFeedback = (body: Record<string, unknown>): boolean => {
  // Check for suspiciously large payloads
  const totalSignals = [
    ...(body.completedGenres as string[] || []),
    ...(body.skippedGenres as string[] || []),
    ...(body.completedArtists as string[] || []),
    ...(body.skippedArtists as string[] || []),
  ].length;

  if (totalSignals > 200) return false;

  // Check all signals are the same type (suspicious)
  const nonEmpty = [
    (body.completedGenres as string[] || []).length > 0,
    (body.skippedGenres as string[] || []).length > 0,
    (body.completedArtists as string[] || []).length > 0,
    (body.skippedArtists as string[] || []).length > 0,
  ].filter(Boolean).length;

  if (nonEmpty === 1 && totalSignals > 50) return false;

  return true;
};

/**
 * POST /api/music/recommendations/feedback
 *
 * Body:
 *   anonId: string (client-generated anonymous ID)
 *   completedGenres: string[] (genres of fully listened tracks this session)
 *   skippedGenres: string[] (genres of skipped tracks this session)
 *   completedArtists: string[] (artists of fully listened tracks)
 *   skippedArtists: string[] (artists of skipped tracks)
 *   genreListenTimes: Record<string, number> (seconds listened per genre, optional)
 *   artistListenTimes: Record<string, number> (seconds listened per artist, optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anonId, completedGenres, skippedGenres, completedArtists, skippedArtists } = body;

    if (!anonId) {
      return NextResponse.json({ error: "missing anonId" }, { status: 400 });
    }

    // Spam protection
    if (!validateFeedback(body)) {
      return NextResponse.json({ error: "invalid feedback payload" }, { status: 400 });
    }

    if (Math.random() < 0.05) cleanupStore();

    const fb = getOrCreateUser(anonId);
    fb.totalSessions++;
    fb.lastUpdated = Date.now();

    for (const g of (completedGenres || [])) {
      const norm = g.toLowerCase().trim();
      if (norm) fb.genreCompletions[norm] = (fb.genreCompletions[norm] || 0) + 1;
    }
    for (const g of (skippedGenres || [])) {
      const norm = g.toLowerCase().trim();
      if (norm) fb.genreSkips[norm] = (fb.genreSkips[norm] || 0) + 1;
    }
    for (const a of (completedArtists || [])) {
      const norm = a.toLowerCase().trim();
      if (norm) fb.artistCompletions[norm] = (fb.artistCompletions[norm] || 0) + 1;
    }
    for (const a of (skippedArtists || [])) {
      const norm = a.toLowerCase().trim();
      if (norm) fb.artistSkips[norm] = (fb.artistSkips[norm] || 0) + 1;
    }

    // Accumulate listening depth (total seconds listened)
    for (const [genre, seconds] of Object.entries(body.genreListenTimes || {})) {
      const norm = genre.toLowerCase().trim();
      if (norm && typeof seconds === "number" && seconds > 0) {
        fb.genreTotalListenTime[norm] = (fb.genreTotalListenTime[norm] || 0) + seconds;
      }
    }
    for (const [artist, seconds] of Object.entries(body.artistListenTimes || {})) {
      const norm = artist.toLowerCase().trim();
      if (norm && typeof seconds === "number" && seconds > 0) {
        fb.artistTotalListenTime[norm] = (fb.artistTotalListenTime[norm] || 0) + seconds;
      }
    }

    // Update aggregate collaborative stats
    for (const g of (completedGenres || [])) {
      const norm = g.toLowerCase().trim();
      if (norm) aggregateStats.genreScore[norm] = (aggregateStats.genreScore[norm] || 0) + 1;
    }
    for (const g of (skippedGenres || [])) {
      const norm = g.toLowerCase().trim();
      if (norm) aggregateStats.genreScore[norm] = (aggregateStats.genreScore[norm] || 0) - 1;
    }
    for (const a of (completedArtists || [])) {
      const norm = a.toLowerCase().trim();
      if (norm) aggregateStats.artistScore[norm] = (aggregateStats.artistScore[norm] || 0) + 1;
    }
    for (const a of (skippedArtists || [])) {
      const norm = a.toLowerCase().trim();
      if (norm) aggregateStats.artistScore[norm] = (aggregateStats.artistScore[norm] || 0) - 1;
    }
    aggregateStats.totalUsers = feedbackStore.size;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback] Error:", err);
    return NextResponse.json({ error: "feedback save failed" }, { status: 500 });
  }
}

/**
 * GET /api/music/recommendations/feedback?anonId=xxx
 *
 * Returns the accumulated feedback for this user (for recommendation scoring).
 * Also includes top aggregate genre/artist signals from all users,
 * cross-user similarity signals, and time-decayed affinity scores.
 */
export async function GET(request: NextRequest) {
  const anonId = request.nextUrl.searchParams.get("anonId");

  if (!anonId) {
    return NextResponse.json({
      userFeedback: null,
      aggregate: getTopAggregateSignals(15),
    });
  }

  const fb = feedbackStore.get(anonId);
  if (!fb) {
    return NextResponse.json({
      userFeedback: null,
      aggregate: getTopAggregateSignals(15),
    });
  }

  // Compute user's genre affinity using Laplace smoothing
  const genreAffinity: Record<string, number> = {};
  const allGenres = new Set([...Object.keys(fb.genreCompletions), ...Object.keys(fb.genreSkips)]);
  for (const g of allGenres) {
    const completions = fb.genreCompletions[g] || 0;
    const skips = fb.genreSkips[g] || 0;
    const total = completions + skips;
    if (total >= 2) {
      const smoothedCompletions = completions + 1;
      const smoothedSkips = skips + 1;
      const smoothedTotal = total + 2;
      const baseAffinity = (smoothedCompletions - smoothedSkips) / smoothedTotal;
      const confidenceWeight = Math.min(Math.sqrt(smoothedTotal) / 5, 1);
      genreAffinity[g] = baseAffinity * confidenceWeight * 100; // scale to 0-100 range
    }
  }

  // Compute user's artist affinity using Laplace smoothing
  const artistAffinity: Record<string, number> = {};
  const allArtists = new Set([...Object.keys(fb.artistCompletions), ...Object.keys(fb.artistSkips)]);
  for (const a of allArtists) {
    const completions = fb.artistCompletions[a] || 0;
    const skips = fb.artistSkips[a] || 0;
    const total = completions + skips;
    if (total >= 2) {
      const smoothedCompletions = completions + 1;
      const smoothedSkips = skips + 1;
      const smoothedTotal = total + 2;
      const baseAffinity = (smoothedCompletions - smoothedSkips) / smoothedTotal;
      const confidenceWeight = Math.min(Math.sqrt(smoothedTotal) / 5, 1);
      artistAffinity[a] = baseAffinity * confidenceWeight * 100; // scale to 0-100 range
    }
  }

  // Apply time decay to all affinity scores
  for (const g of Object.keys(genreAffinity)) {
    genreAffinity[g] = applyTimeDecay(genreAffinity[g], fb.lastUpdated);
  }
  for (const a of Object.keys(artistAffinity)) {
    artistAffinity[a] = applyTimeDecay(artistAffinity[a], fb.lastUpdated);
  }

  // Compute cross-user similarity signals
  const currentUserTopGenres = Object.entries(fb.genreCompletions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);

  const similarUserGenreBoost: Record<string, number> = {};
  const similarUserArtistBoost: Record<string, number> = {};

  if (currentUserTopGenres.length >= 2) {
    for (const [otherAnonId, otherFb] of feedbackStore.entries()) {
      if (otherAnonId === anonId) continue;
      const otherTopGenres = Object.entries(otherFb.genreCompletions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);

      const sharedGenres = currentUserTopGenres.filter(g => otherTopGenres.includes(g));
      if (sharedGenres.length >= 2) {
        // This user has similar taste — boost their unique top genres
        for (const [genre, count] of Object.entries(otherFb.genreCompletions)) {
          if (!currentUserTopGenres.includes(genre) && count >= 3) {
            similarUserGenreBoost[genre] = (similarUserGenreBoost[genre] || 0) + count;
          }
        }
        for (const [artist, count] of Object.entries(otherFb.artistCompletions)) {
          if (count >= 3) {
            similarUserArtistBoost[artist] = (similarUserArtistBoost[artist] || 0) + count;
          }
        }
      }
    }
  }

  return NextResponse.json({
    userFeedback: {
      genreAffinity,
      artistAffinity,
      totalSessions: fb.totalSessions,
      topGenres: currentUserTopGenres,
      // Listening depth info
      genreTotalListenTime: fb.genreTotalListenTime,
      artistTotalListenTime: fb.artistTotalListenTime,
    },
    similarUserSignals: {
      genreBoost: similarUserGenreBoost,
      artistBoost: similarUserArtistBoost,
    },
    aggregate: getTopAggregateSignals(15),
  });
}

function getTopAggregateSignals(limit: number): {
  topGenres: { genre: string; score: number }[];
  topArtists: { artist: string; score: number }[];
} {
  const topGenres = Object.entries(aggregateStats.genreScore)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, score]) => ({ genre, score }));

  const topArtists = Object.entries(aggregateStats.artistScore)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([artist, score]) => ({ artist, score }));

  return { topGenres, topArtists };
}
