import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 10, window: 60, key: "listen-invite" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const { contactId, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = await req.json();
    if (!contactId) {
      return NextResponse.json({ error: "contactId обязателен" }, { status: 400 });
    }

    if (contactId === userId) {
      return NextResponse.json({ error: "Нельзя пригласить себя" }, { status: 400 });
    }

    // Check the user exists
    const friend = await db.user.findUnique({
      where: { id: contactId },
      select: { id: true, username: true },
    });
    if (!friend) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Get the current user's info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Check for existing session in either direction (A→B or B→A)
    const existingSession = await db.listenSession.findFirst({
      where: {
        OR: [
          { hostId: userId, guestId: contactId },
          { hostId: contactId, guestId: userId },
        ],
      },
    });

    let listenSession;
    if (existingSession) {
      // Update existing session with new track data
      listenSession = await db.listenSession.update({
        where: { id: existingSession.id },
        data: {
          trackId: trackId || "",
          trackTitle: trackTitle || "Ожидание...",
          trackArtist: trackArtist || "",
          trackCover: trackCover || "",
          scTrackId: scTrackId != null ? scTrackId : null,
          audioUrl: audioUrl || "",
          source: source || "soundcloud",
          progress: 0,
          isPlaying: true,
        },
      });
    } else {
      // Create new session
      listenSession = await db.listenSession.create({
        data: {
          hostId: userId,
          guestId: contactId,
          trackId: trackId || "",
          trackTitle: trackTitle || "Ожидание...",
          trackArtist: trackArtist || "",
          trackCover: trackCover || "",
          scTrackId: scTrackId != null ? scTrackId : null,
          audioUrl: audioUrl || "",
          source: source || "soundcloud",
        },
      });
    }

    // Send a system message in the DM
    await db.message.create({
      data: {
        senderId: userId,
        receiverId: contactId,
        content: `listen_invite:${listenSession.id}`,
        encrypted: false,
        messageType: "system",
      },
    });

    // Create a notification for the guest
    await db.notification.create({
      data: {
        userId: contactId,
        type: "listen_invite",
        title: "Приглашение слушать вместе",
        body: `@${user.username} приглашает вас слушать музыку вместе`,
        data: JSON.stringify({ senderId: userId, senderUsername: user.username, sessionId: listenSession.id }),
      },
    });

    return NextResponse.json({ sessionId: listenSession.id, ok: true });
  } catch (error) {
    console.error("Listen invite error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке приглашения" },
      { status: 500 }
    );
  }
}
