import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

/**
 * GET /api/social/sessions
 *   Returns active live sessions hosted by the user or their friends.
 *
 * POST /api/social/sessions
 *   Creates a new live listening session. Host becomes the first member.
 *   Body: { trackId, trackTitle, trackArtist, trackCover, scTrackId?, audioUrl, source }
 *   Returns: { session: { id, code, ... } }
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
      session.userId, // include own sessions
    ];

    // Active = updated in last 10 min
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const sessions = await db.liveSession.findMany({
      where: {
        hostId: { in: friendIds },
        updatedAt: { gte: tenMinAgo },
      },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

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
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { username: true, avatar: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Generate unique code (retry on collision)
    let code = generateCode();
    for (let i = 0; i < 5; i++) {
      const exists = await db.liveSession.findUnique({ where: { code }, select: { id: true } });
      if (!exists) break;
      code = generateCode();
    }

    const liveSession = await db.liveSession.create({
      data: {
        hostId: session.userId,
        code,
        trackId,
        trackTitle,
        trackArtist,
        trackCover: trackCover || "",
        scTrackId: scTrackId || null,
        audioUrl: audioUrl || "",
        source: source || "soundcloud",
        isPlaying: true,
        progress: 0,
        guestCount: 1,
        members: {
          create: {
            userId: session.userId,
            username: user.username,
            avatar: user.avatar,
          },
        },
      },
      include: { members: true },
    });

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
