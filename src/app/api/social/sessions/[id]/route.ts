import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

/**
 * GET /api/social/sessions/[id]?code=ABC123
 *   Returns session details + members. Used for sync polling (every 2s).
 *   If ?code= is provided, joins the session (adds user as member).
 *
 * POST /api/social/sessions/[id]
 *   Updates session playback state (host only).
 *   Body: { isPlaying?, progress?, trackId?, trackTitle?, ... }
 *
 * DELETE /api/social/sessions/[id]
 *   Leaves the session (removes member). Host leaving = session deleted.
 */

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const joinCode = searchParams.get("code");

  try {
    const liveSession = await db.liveSession.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        members: { select: { id: true, userId: true, username: true, avatar: true, joinedAt: true, lastSyncAt: true } },
      },
    });

    if (!liveSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // If joinCode provided and matches, add user as member
    if (joinCode && joinCode === liveSession.code) {
      const existingMember = liveSession.members.find((m) => m.userId === session.userId);
      if (!existingMember) {
        const user = await db.user.findUnique({
          where: { id: session.userId },
          select: { username: true, avatar: true },
        });
        if (user) {
          await db.liveSessionMember.create({
            data: {
              sessionId: liveSession.id,
              userId: session.userId,
              username: user.username,
              avatar: user.avatar,
            },
          });
          await db.liveSession.update({
            where: { id: liveSession.id },
            data: { guestCount: { increment: 1 } },
          });
        }
      }
    }

    // Refresh members after potential join
    const refreshed = await db.liveSession.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true, username: true, avatar: true } },
      },
    });

    return NextResponse.json({
      session: {
        id: refreshed!.id,
        code: refreshed!.code,
        hostId: refreshed!.hostId,
        trackId: refreshed!.trackId,
        trackTitle: refreshed!.trackTitle,
        trackArtist: refreshed!.trackArtist,
        trackCover: refreshed!.trackCover,
        scTrackId: refreshed!.scTrackId,
        audioUrl: refreshed!.audioUrl,
        source: refreshed!.source,
        isPlaying: refreshed!.isPlaying,
        progress: refreshed!.progress,
        guestCount: refreshed!.guestCount,
        members: refreshed!.members,
        isHost: refreshed!.hostId === session.userId,
      },
    });
  } catch (err) {
    console.error("[social/sessions/[id] GET] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const liveSession = await db.liveSession.findUnique({ where: { id }, select: { hostId: true } });
    if (!liveSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (liveSession.hostId !== session.userId) {
      return NextResponse.json({ error: "Only host can update playback" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};
    if (typeof body.isPlaying === "boolean") updateData.isPlaying = body.isPlaying;
    if (typeof body.progress === "number") updateData.progress = body.progress;
    if (body.trackId) {
      updateData.trackId = body.trackId;
      updateData.trackTitle = body.trackTitle || "";
      updateData.trackArtist = body.trackArtist || "";
      updateData.trackCover = body.trackCover || "";
      updateData.scTrackId = body.scTrackId || null;
      updateData.audioUrl = body.audioUrl || "";
      updateData.source = body.source || "soundcloud";
      updateData.progress = 0;
      updateData.isPlaying = true;
    }

    const updated = await db.liveSession.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ session: { id: updated.id, isPlaying: updated.isPlaying, progress: updated.progress } });
  } catch (err) {
    console.error("[social/sessions/[id] POST] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

async function deleteHandler(
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const liveSession = await db.liveSession.findUnique({
      where: { id },
      select: { hostId: true },
    });
    if (!liveSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (liveSession.hostId === session.userId) {
      // Host leaving → delete entire session
      await db.liveSession.delete({ where: { id } });
    } else {
      // Guest leaving → remove member, decrement count
      await db.liveSessionMember.deleteMany({
        where: { sessionId: id, userId: session.userId },
      });
      await db.liveSession.update({
        where: { id },
        data: { guestCount: { decrement: 1 } },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[social/sessions/[id] DELETE] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export const GET = withRateLimit({ limit: 60, window: 60 }, getHandler);
export const POST = withRateLimit({ limit: 30, window: 60 }, postHandler);
export const DELETE = withRateLimit(RATE_LIMITS.write, deleteHandler);
