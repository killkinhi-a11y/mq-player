import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

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

    const sessionData = {
      id: listenSession.id,
      hostId: listenSession.hostId,
      hostName: listenSession.host.username,
      guestId: listenSession.guestId,
      guestName: listenSession.guest.username,
      trackId: listenSession.trackId,
      trackTitle: listenSession.trackTitle,
      trackArtist: listenSession.trackArtist,
      trackCover: listenSession.trackCover,
      scTrackId: listenSession.scTrackId,
      audioUrl: listenSession.audioUrl,
      source: listenSession.source,
      progress: listenSession.progress,
      isPlaying: listenSession.isPlaying,
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
