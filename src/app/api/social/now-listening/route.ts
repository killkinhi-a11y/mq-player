import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

/**
 * GET /api/social/now-listening
 *
 * Returns list of friends who are currently listening to something.
 * Polled by client every ~15s. Only returns statuses updated in the last 5 min.
 *
 * Response: { friends: Array<{ userId, username, avatar, trackTitle, trackArtist, trackCover, isPlaying, progress, duration }> }
 */

async function handler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ friends: [] }, { status: 401 });
  }

  try {
    // Get accepted friends (both directions)
    const sentFriends = await db.friend.findMany({
      where: { requesterId: session.userId, status: "accepted" },
      select: { addresseeId: true },
    });
    const receivedFriends = await db.friend.findMany({
      where: { addresseeId: session.userId, status: "accepted" },
      select: { requesterId: true },
    });
    const friendIds = [
      ...sentFriends.map((f) => f.addresseeId),
      ...receivedFriends.map((f) => f.requesterId),
    ];

    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    // Get listening statuses updated in the last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const statuses = await db.listeningStatus.findMany({
      where: {
        userId: { in: friendIds },
        updatedAt: { gte: fiveMinAgo },
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

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
