import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";

/**
 * GET /api/social/now-listening
 *
 * Returns list of friends who are currently listening to something.
 * Polled by client every ~15s. Only returns statuses updated in the last 5 min.
 *
 * Response: { friends: Array<{ userId, username, avatar, trackTitle, trackArtist, trackCover, isPlaying, progress, duration }> }
 *
 * Phase 3: migrated from Prisma-direct to the unified database adapter
 * (src/lib/database.ts) — works on both Turso (production) and Prisma (local).
 */

async function handler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ friends: [] }, { status: 401 });
  }

  try {
    const friendIds = await database.findAcceptedFriendIds(session.userId);

    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    // Get listening statuses updated in the last 5 minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const statuses = await database.findActiveListeningStatuses(friendIds, fiveMinAgo);

    const friends = statuses.map((s) => ({
      userId: s.user.id,
      username: s.user.username,
      avatar: s.user.avatar,
      trackTitle: s.trackTitle,
      trackArtist: s.trackArtist,
      trackCover: s.trackCover,
      isPlaying: s.isPlaying,
      progress: s.progress,
      duration: s.duration,
      scTrackId: s.scTrackId,
    }));

    return NextResponse.json({ friends });
  } catch (err) {
    console.error("[social/now-listening] error:", err);
    return NextResponse.json({ friends: [] });
  }
}

export const GET = withRateLimit({ limit: 60, window: 60 }, handler); // 1 req/sec for polling
