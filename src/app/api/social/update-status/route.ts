import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

/**
 * POST /api/social/update-status
 *
 * Updates the current user's listening status. Called every ~10s while playing.
 * Body: { trackId, trackTitle, trackArtist, trackCover, scTrackId?, isPlaying, progress, duration, source }
 *
 * Response: { ok: true }
 */

async function handler(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      trackId, trackTitle, trackArtist, trackCover,
      scTrackId, isPlaying, progress, duration, source,
    } = body;

    if (!trackId || !trackTitle || !trackArtist) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await db.listeningStatus.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        trackId,
        trackTitle,
        trackArtist,
        trackCover: trackCover || "",
        scTrackId: scTrackId || null,
        isPlaying: isPlaying ?? true,
        progress: progress || 0,
        duration: duration || 0,
        source: source || "soundcloud",
      },
      update: {
        trackId,
        trackTitle,
        trackArtist,
        trackCover: trackCover || "",
        scTrackId: scTrackId || null,
        isPlaying: isPlaying ?? true,
        progress: progress || 0,
        duration: duration || 0,
        source: source || "soundcloud",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[social/update-status] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export const POST = withRateLimit({ limit: 30, window: 60 }, handler); // 1 req/2s
