import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const maxDuration = 30;

interface ListenSessionRow {
  id: string;
  hostId: string;
  guestId: string;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  scTrackId: number | null;
  audioUrl: string;
  source: string;
  progress: number;
  isPlaying: boolean;
  hostName: string;
  guestName: string;
}

async function fetchListenSessionTurso(t: ReturnType<typeof getTursoClient>, sessionId: string): Promise<ListenSessionRow | null> {
  const result = await t.execute({
    sql: `SELECT ls.*, h.username as h_username, g.username as g_username
          FROM ListenSession ls
          JOIN User h ON ls.hostId = h.id
          JOIN User g ON ls.guestId = g.id
          WHERE ls.id = ?`,
    args: [sessionId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    hostId: String(row.hostId ?? ""),
    guestId: String(row.guestId ?? ""),
    trackId: String(row.trackId ?? ""),
    trackTitle: String(row.trackTitle ?? ""),
    trackArtist: String(row.trackArtist ?? ""),
    trackCover: String(row.trackCover ?? ""),
    scTrackId: row.scTrackId != null ? Number(row.scTrackId) : null,
    audioUrl: String(row.audioUrl ?? ""),
    source: String(row.source ?? "soundcloud"),
    progress: Number(row.progress ?? 0),
    isPlaying: row.isPlaying === 1 || row.isPlaying === true,
    hostName: String(row.h_username ?? ""),
    guestName: String(row.g_username ?? ""),
  };
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 10, window: 60, key: "listen-accept" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const userId = session.userId;

    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId обязателен" }, { status: 400 });

    if (isTurso()) {
      const t = getTursoClient();
      const listenSession = await fetchListenSessionTurso(t, sessionId);
      if (!listenSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
      if (listenSession.guestId !== userId) {
        return NextResponse.json({ error: "Вы не являетесь приглашённым" }, { status: 403 });
      }

      // Send system message to host
      await database.createMessage({
        content: "Принял(а) приглашение! 🎶",
        senderId: userId,
        receiverId: listenSession.hostId,
        encrypted: false,
        messageType: "system",
      });

      // Mark notification as read — Turso doesn't support JSON contains,
      // so we use LIKE to match the sessionId substring in the data JSON column.
      await t.execute({
        sql: "UPDATE Notification SET read = 1 WHERE userId = ? AND type = 'listen_invite' AND read = 0 AND data LIKE ?",
        args: [listenSession.hostId, `%${sessionId}%`],
      });

      // Re-read fresh
      const freshSession = await fetchListenSessionTurso(t, sessionId);
      const src = freshSession || listenSession;
      return NextResponse.json({
        ok: true,
        session: {
          id: src.id, hostId: src.hostId, hostName: src.hostName,
          guestId: src.guestId, guestName: src.guestName,
          trackId: src.trackId, trackTitle: src.trackTitle, trackArtist: src.trackArtist,
          trackCover: src.trackCover, scTrackId: src.scTrackId, audioUrl: src.audioUrl,
          source: src.source, progress: src.progress, isPlaying: src.isPlaying, isHost: false,
        },
      });
    }

    const { db } = await import("@/lib/db");
    const listenSession = await db.listenSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });
    if (!listenSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    if (listenSession.guestId !== userId) {
      return NextResponse.json({ error: "Вы не являетесь приглашённым" }, { status: 403 });
    }

    await db.message.create({
      data: {
        senderId: userId,
        receiverId: listenSession.hostId,
        content: "Принял(а) приглашение! 🎶",
        encrypted: false,
        messageType: "system",
      },
    });

    await db.notification.updateMany({
      where: {
        userId: listenSession.hostId, type: "listen_invite", read: false,
        data: { contains: sessionId },
      },
      data: { read: true },
    });

    const freshSession = await db.listenSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });
    const src = freshSession || listenSession;
    return NextResponse.json({
      ok: true,
      session: {
        id: src.id, hostId: src.hostId, hostName: src.host.username,
        guestId: src.guestId, guestName: src.guest.username,
        trackId: src.trackId, trackTitle: src.trackTitle, trackArtist: src.trackArtist,
        trackCover: src.trackCover, scTrackId: src.scTrackId, audioUrl: src.audioUrl,
        source: src.source, progress: src.progress, isPlaying: src.isPlaying, isHost: false,
      },
    });
  } catch (error) {
    console.error("Listen accept error:", error);
    return NextResponse.json({ error: "Ошибка при принятии приглашения" }, { status: 500 });
  }
}
