import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

/**
 * GET /api/social/rec-updates
 *
 * Lightweight polling endpoint for real-time recommendation updates.
 * Returns a hash of the user's recommendation-relevant state (likes count,
 * dislikes count, history count, top genres signature). Client compares
 * this hash to its last-known hash — if different, refetch /api/music/recommendations.
 *
 * Polled every ~30s. Designed to be cheap (DB count queries only).
 *
 * Response: { hash: string, likes: number, dislikes: number, history: number, ts: number }
 */

async function handler() {
  const session = await getSession();
  if (!session) return NextResponse.json({ hash: "", ts: Date.now() }, { status: 401 });

  try {
    // Count likes, dislikes, history for this user
    // likedTrackIds and dislikedTrackIds are stored as JSON arrays in UserSync
    const syncData = await db.userSync.findMany({
      where: { userId: session.userId, key: { in: ["likedTrackIds", "dislikedTrackIds", "history"] } },
      select: { key: true, data: true, updatedAt: true },
    });

    let likes = 0, dislikes = 0, history = 0;
    let latestUpdate = 0;

    for (const row of syncData) {
      try {
        const parsed = JSON.parse(row.data || "[]");
        if (Array.isArray(parsed)) {
          if (row.key === "likedTrackIds") likes = parsed.length;
          if (row.key === "dislikedTrackIds") dislikes = parsed.length;
          if (row.key === "history") history = parsed.length;
        }
      } catch {}
      const ts = row.updatedAt?.getTime() || 0;
      if (ts > latestUpdate) latestUpdate = ts;
    }

    // Simple hash: combines counts + latest update timestamp
    const hash = `${likes}:${dislikes}:${history}:${latestUpdate}`;

    return NextResponse.json({
      hash,
      likes,
      dislikes,
      history,
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[social/rec-updates] error:", err);
    return NextResponse.json({ hash: "", ts: Date.now() });
  }
}

export const GET = withRateLimit({ limit: 4, window: 60 }, handler); // 1 req/15s — very cheap polling
