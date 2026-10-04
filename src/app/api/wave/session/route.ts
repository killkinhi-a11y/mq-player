import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveWaveUser, getWaveServerSession, getServerTaste } from "@/lib/wave/server";

/**
 * GET /api/wave/session?sessionId=...&anonId=... — wave session state (§29).
 *
 * Returns the server-side session summary + the caller's own taste
 * aggregate. Identity re-resolves server-side; a sessionId belonging to
 * another user returns 404 (no cross-user leakage, §30).
 */
async function getHandler(request: NextRequest) {
  try {
    const user = await resolveWaveUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
    }
    const session = getWaveServerSession(sessionId);
    if (!session) {
      return NextResponse.json({ session: null }, { status: 404 });
    }
    if (session.userId !== user.userId) {
      // Never confirm the existence of another user's session.
      return NextResponse.json({ session: null }, { status: 404 });
    }
    const taste = getServerTaste(user.userId);
    return NextResponse.json({
      session: {
        id: session.id,
        seed: session.seed,
        createdAt: session.createdAt,
        batches: session.batches,
        tracksServed: session.tracksServed,
        lastActivityAt: session.lastActivityAt,
      },
      taste: {
        topArtists: Object.entries(taste.artists)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([artist, score]) => ({ artist, score: Number(score.toFixed(2)) })),
        topGenres: Object.entries(taste.genres)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([genre, score]) => ({ genre, score: Number(score.toFixed(2)) })),
        boostedArtists: taste.boostArtists,
        suppressedArtists: taste.suppressArtists,
      },
    });
  } catch (err) {
    console.error("[wave] session error:", err);
    return NextResponse.json({ error: "session_failed" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
