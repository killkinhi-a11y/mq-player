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

// ── In-memory feedback store ──
interface UserFeedback {
  genreCompletions: Record<string, number>;
  genreSkips: Record<string, number>;
  artistCompletions: Record<string, number>;
  artistSkips: Record<string, number>;
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

/**
 * POST /api/music/recommendations/feedback
 *
 * Body:
 *   anonId: string (client-generated anonymous ID)
 *   completedGenres: string[] (genres of fully listened tracks this session)
 *   skippedGenres: string[] (genres of skipped tracks this session)
 *   completedArtists: string[] (artists of fully listened tracks)
 *   skippedArtists: string[] (artists of skipped tracks)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anonId, completedGenres, skippedGenres, completedArtists, skippedArtists } = body;

    if (!anonId) {
      return NextResponse.json({ error: "missing anonId" }, { status: 400 });
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
 * Also includes top aggregate genre/artist signals from all users.
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

  // Compute user's genre affinity (completion rate)
  const genreAffinity: Record<string, number> = {};
  const allGenres = new Set([...Object.keys(fb.genreCompletions), ...Object.keys(fb.genreSkips)]);
  for (const g of allGenres) {
    const completions = fb.genreCompletions[g] || 0;
    const skips = fb.genreSkips[g] || 0;
    const total = completions + skips;
    if (total >= 2) {
      genreAffinity[g] = ((completions - skips) / total) * Math.min(Math.sqrt(total), 5);
    }
  }

  const artistAffinity: Record<string, number> = {};
  const allArtists = new Set([...Object.keys(fb.artistCompletions), ...Object.keys(fb.artistSkips)]);
  for (const a of allArtists) {
    const completions = fb.artistCompletions[a] || 0;
    const skips = fb.artistSkips[a] || 0;
    const total = completions + skips;
    if (total >= 2) {
      artistAffinity[a] = ((completions - skips) / total) * Math.min(Math.sqrt(total), 5);
    }
  }

  return NextResponse.json({
    userFeedback: {
      genreAffinity,
      artistAffinity,
      totalSessions: fb.totalSessions,
      topGenres: Object.entries(fb.genreCompletions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre),
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
