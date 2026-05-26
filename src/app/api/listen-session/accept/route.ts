import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 10, window: 60, key: "listen-accept" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId обязателен" }, { status: 400 });
    }

    // Find the session
    const listenSession = await db.listenSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });

    if (!listenSession) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // Verify the current user is the guest
    if (listenSession.guestId !== userId) {
      return NextResponse.json({ error: "Вы не являетесь приглашённым" }, { status: 403 });
    }

    // Get current user info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    // Send system message back to host
    await db.message.create({
      data: {
        senderId: userId,
        receiverId: listenSession.hostId,
        content: `Принял(а) приглашение! 🎶`,
        encrypted: false,
        messageType: "system",
      },
    });

    // Mark notification as read
    await db.notification.updateMany({
      where: {
        userId: listenSession.hostId,
        type: "listen_invite",
        read: false,
        data: { contains: sessionId },
      },
      data: { read: true },
    });

    // Re-read the session fresh to get the most up-to-date track data
    const freshSession = await db.listenSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        guest: { select: { id: true, username: true, avatar: true } },
      },
    });

    const src = freshSession || listenSession;

    const sessionData = {
      id: src.id,
      hostId: src.hostId,
      hostName: src.host.username,
      guestId: src.guestId,
      guestName: src.guest.username,
      trackId: src.trackId,
      trackTitle: src.trackTitle,
      trackArtist: src.trackArtist,
      trackCover: src.trackCover,
      scTrackId: src.scTrackId,
      audioUrl: src.audioUrl,
      source: src.source,
      progress: src.progress,
      isPlaying: src.isPlaying,
      isHost: false,
    };

    return NextResponse.json({ ok: true, session: sessionData });
  } catch (error) {
    console.error("Listen accept error:", error);
    return NextResponse.json(
      { error: "Ошибка при принятии приглашения" },
      { status: 500 }
    );
  }
}
