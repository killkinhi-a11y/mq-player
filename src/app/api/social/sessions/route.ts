import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";

/**
 * GET /api/social/sessions
 *   Returns active live sessions hosted by the user or their friends.
 *
 * POST /api/social/sessions
 *   Creates a new live listening session. Host becomes the first member.
 *   Body: { trackId, trackTitle, trackArtist, trackCover, scTrackId?, audioUrl, source }
 *   Returns: { session: { id, code, ... } }
 *
 * Phase 3: migrated from Prisma-direct to the unified database adapter
 * (src/lib/database.ts) — works on both Turso (production) and Prisma (local).
 */

function generateCode(): string {
  // 6-char alphanumeric join code (uppercase, no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getHandler() {
  const session = await getSession();
  if (!session) return NextResponse.json({ sessions: [] }, { status: 401 });

  try {
    const friendIds = await database.findAcceptedFriendIds(session.userId);
    const hostIds = [...friendIds, session.userId]; // include own sessions

    // Active = updated in last 10 min
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const sessions = await database.findActiveLiveSessions(hostIds, tenMinAgo, 20);

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        code: s.code,
        hostId: s.host.id,
        hostUsername: s.host.username,
        hostAvatar: s.host.avatar,
        trackTitle: s.trackTitle,
        trackArtist: s.trackArtist,
        trackCover: s.trackCover,
        isPlaying: s.isPlaying,
        progress: s.progress,
        guestCount: s.guestCount,
        isHost: s.host.id === session.userId,
      })),
    });
  } catch (err) {
    console.error("[social/sessions GET] error:", err);
    return NextResponse.json({ sessions: [] });
  }
}

async function postHandler(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
    if (!trackId || !trackTitle || !trackArtist) {
      return NextResponse.json({ error: "Missing track fields" }, { status: 400 });
    }

    // Get user info for member record
    const user = await database.findUserById(session.userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Generate unique code (retry on collision)
    let code = generateCode();
    for (let i = 0; i < 5; i++) {
      const exists = await database.findLiveSessionIdByCode(code);
      if (!exists) break;
      code = generateCode();
    }

    const liveSession = await database.createLiveSession(
      {
        hostId: session.userId,
        code,
        trackId,
        trackTitle,
        trackArtist,
        trackCover: trackCover || "",
        scTrackId: scTrackId ?? null,
        audioUrl: audioUrl || "",
        source: source || "soundcloud",
      },
      { username: user.username, avatar: user.avatar }
    );

    return NextResponse.json({
      session: {
        id: liveSession.id,
        code: liveSession.code,
        trackTitle: liveSession.trackTitle,
        trackArtist: liveSession.trackArtist,
        trackCover: liveSession.trackCover,
        isPlaying: liveSession.isPlaying,
        progress: liveSession.progress,
        guestCount: liveSession.guestCount,
      },
    });
  } catch (err) {
    console.error("[social/sessions POST] error:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export const GET = withRateLimit({ limit: 30, window: 60 }, getHandler);
export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
