import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";

/**
 * POST /api/social/update-status
 *
 * Updates the current user's listening status. Called every ~10s while playing.
 * Body: { trackId, trackTitle, trackArtist, trackCover, scTrackId?, isPlaying, progress, duration, source }
 *
 * Response: { ok: true }
 *
 * Phase 3: migrated from Prisma-direct to the unified database adapter
 * (src/lib/database.ts) — works on both Turso (production) and Prisma (local).
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

    await database.upsertListeningStatus(session.userId, {
      trackId,
      trackTitle,
      trackArtist,
      trackCover: trackCover || "",
      scTrackId: scTrackId ?? null,
      isPlaying: isPlaying ?? true,
      progress: progress || 0,
      duration: duration || 0,
      source: source || "soundcloud",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[social/update-status] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export const POST = withRateLimit({ limit: 30, window: 60 }, handler); // 1 req/2s
