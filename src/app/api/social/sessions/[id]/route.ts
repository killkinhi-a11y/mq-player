import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";

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
 *
 * Phase 3: migrated from Prisma-direct to the unified database adapter
 * (src/lib/database.ts) — works on both Turso (production) and Prisma (local).
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
    const liveSession = await database.findLiveSessionById(id);

    if (!liveSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // If joinCode provided and matches, add user as member
    if (joinCode && joinCode === liveSession.code) {
      const members = await database.findLiveSessionMembers(liveSession.id);
      const existingMember = members.find((m) => m.userId === session.userId);
      if (!existingMember) {
        const user = await database.findUserById(session.userId);
        if (user) {
          await database.addLiveSessionMember(liveSession.id, session.userId, user.username, user.avatar);
        }
      }
    }

    // Refresh members after potential join
    const refreshed = await database.findLiveSessionById(id);
    if (!refreshed) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const members = await database.findLiveSessionMembers(refreshed.id);

    return NextResponse.json({
      session: {
        id: refreshed.id,
        code: refreshed.code,
        hostId: refreshed.hostId,
        trackId: refreshed.trackId,
        trackTitle: refreshed.trackTitle,
        trackArtist: refreshed.trackArtist,
        trackCover: refreshed.trackCover,
        scTrackId: refreshed.scTrackId,
        audioUrl: refreshed.audioUrl,
        source: refreshed.source,
        isPlaying: refreshed.isPlaying,
        progress: refreshed.progress,
        guestCount: refreshed.guestCount,
        members: members.map((m) => ({ userId: m.userId, username: m.username, avatar: m.avatar })),
        isHost: refreshed.hostId === session.userId,
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
    const liveSession = await database.findLiveSessionById(id);
    if (!liveSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (liveSession.hostId !== session.userId) {
      return NextResponse.json({ error: "Only host can update playback" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Partial<{
      trackId: string;
      trackTitle: string;
      trackArtist: string;
      trackCover: string;
      scTrackId: number | null;
      audioUrl: string;
      source: string;
      isPlaying: boolean;
      progress: number;
    }> = {};
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

    const updated = await database.updateLiveSession(id, updateData);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const liveSession = await database.findLiveSessionById(id);
    if (!liveSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (liveSession.hostId === session.userId) {
      // Host leaving → delete entire session
      await database.deleteLiveSession(id);
    } else {
      // Guest leaving → remove member, decrement count
      await database.removeLiveSessionMember(id, session.userId);
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
