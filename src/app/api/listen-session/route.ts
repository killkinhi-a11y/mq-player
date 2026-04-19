import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 60, window: 60, key: "listen-session-get" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    // Get session where user is host (and guest is set — active session)
    const hostedSession = await db.listenSession.findFirst({
      where: { hostId: userId, guestId: { not: userId } },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Get session where user is guest
    const joinedSession = await db.listenSession.findFirst({
      where: { guestId: userId, hostId: { not: userId } },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });

    return NextResponse.json({
      hosted: hostedSession ? {
        id: hostedSession.id,
        hostId: hostedSession.hostId,
        hostName: hostedSession.host.username,
        guestId: hostedSession.guestId,
        guestName: hostedSession.guest.username,
        trackId: hostedSession.trackId,
        trackTitle: hostedSession.trackTitle,
        trackArtist: hostedSession.trackArtist,
        trackCover: hostedSession.trackCover,
        scTrackId: hostedSession.scTrackId,
        audioUrl: hostedSession.audioUrl,
        source: hostedSession.source,
        progress: hostedSession.progress,
        isPlaying: hostedSession.isPlaying,
        isHost: true,
      } : null,
      joined: joinedSession ? {
        id: joinedSession.id,
        hostId: joinedSession.hostId,
        hostName: joinedSession.host.username,
        guestId: joinedSession.guestId,
        guestName: joinedSession.guest.username,
        trackId: joinedSession.trackId,
        trackTitle: joinedSession.trackTitle,
        trackArtist: joinedSession.trackArtist,
        trackCover: joinedSession.trackCover,
        scTrackId: joinedSession.scTrackId,
        audioUrl: joinedSession.audioUrl,
        source: joinedSession.source,
        progress: joinedSession.progress,
        isPlaying: joinedSession.isPlaying,
        isHost: false,
      } : null,
    });
  } catch (error) {
    console.error("Get listen session error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении сессии" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 30, window: 60, key: "listen-session-post" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const body = await req.json();
    const { action, guestId } = body;

    if (!action || !["create", "update", "leave"].includes(action)) {
      return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
    }

    if (action === "create") {
      const { trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
      if (!trackId || !trackTitle || !trackArtist || !guestId) {
        return NextResponse.json({ error: "Отсутствуют обязательные поля" }, { status: 400 });
      }

      // Check if session already exists between these users
      const existing = await db.listenSession.findFirst({
        where: {
          OR: [
            { hostId: userId, guestId },
            { hostId: guestId, guestId: userId },
          ],
        },
      });

      if (existing) {
        // Update existing session with new track info
        const updated = await db.listenSession.update({
          where: { id: existing.id },
          data: {
            trackId,
            trackTitle,
            trackArtist,
            trackCover: trackCover || "",
            scTrackId: scTrackId || null,
            audioUrl: audioUrl || "",
            source: source || "soundcloud",
            progress: 0,
            isPlaying: true,
          },
        });
        return NextResponse.json({ session: updated, ok: true });
      }

      // Create new session
      const newSession = await db.listenSession.create({
        data: {
          hostId: userId,
          guestId,
          trackId,
          trackTitle,
          trackArtist,
          trackCover: trackCover || "",
          scTrackId: scTrackId || null,
          audioUrl: audioUrl || "",
          source: source || "soundcloud",
        },
      });

      return NextResponse.json({ session: newSession, ok: true });
    }

    if (action === "update") {
      const { progress, isPlaying, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;

      // Find session where user is host
      const hostSession = await db.listenSession.findFirst({
        where: { hostId: userId },
      });

      if (!hostSession) {
        return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};
      if (typeof progress === "number") updateData.progress = progress;
      if (typeof isPlaying === "boolean") updateData.isPlaying = isPlaying;
      if (trackId) {
        updateData.trackId = trackId;
        updateData.trackTitle = trackTitle || hostSession.trackTitle;
        updateData.trackArtist = trackArtist || hostSession.trackArtist;
        if (trackCover !== undefined) updateData.trackCover = trackCover;
        if (scTrackId !== undefined) updateData.scTrackId = scTrackId ?? null;
        if (audioUrl !== undefined) updateData.audioUrl = audioUrl;
        if (source !== undefined) updateData.source = source;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ ok: true });
      }

      const updated = await db.listenSession.update({
        where: { id: hostSession.id },
        data: updateData,
      });

      return NextResponse.json({ session: updated, ok: true });
    }

    if (action === "leave") {
      // Delete sessions where user is host or guest
      await db.listenSession.deleteMany({
        where: {
          OR: [
            { hostId: userId },
            { guestId: userId },
          ],
        },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("Listen session POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при обработке сессии" },
      { status: 500 }
    );
  }
}
