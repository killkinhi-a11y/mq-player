import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 10, window: 60, key: "listen-invite" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const userId = session.userId;

    const { contactId, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = await req.json();
    if (!contactId) return NextResponse.json({ error: "contactId обязателен" }, { status: 400 });
    if (contactId === userId) return NextResponse.json({ error: "Нельзя пригласить себя" }, { status: 400 });

    // Verify friendship
    const friendship = await database.findFriendship(userId, contactId);
    if (!friendship || friendship.status !== "accepted") {
      return NextResponse.json({ error: "Можно приглашать только друзей" }, { status: 403 });
    }

    // Get friend + current user info
    const [friend, user] = await Promise.all([
      database.findUserById(contactId),
      database.findUserById(userId),
    ]);
    if (!friend) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    if (isTurso()) {
      const t = getTursoClient();
      const now = new Date().toISOString();

      // Check for existing session in either direction
      const existingResult = await t.execute({
        sql: "SELECT id FROM ListenSession WHERE (hostId = ? AND guestId = ?) OR (hostId = ? AND guestId = ?) LIMIT 1",
        args: [userId, contactId, contactId, userId],
      });

      let sessionId: string;
      if (existingResult.rows.length > 0) {
        sessionId = String((existingResult.rows[0] as Record<string, unknown>).id ?? "");
        await t.execute({
          sql: `UPDATE ListenSession SET trackId = ?, trackTitle = ?, trackArtist = ?, trackCover = ?, scTrackId = ?, audioUrl = ?, source = ?, progress = 0, isPlaying = 1, updatedAt = ? WHERE id = ?`,
          args: [trackId || "", trackTitle || "Ожидание...", trackArtist || "", trackCover || "", scTrackId ?? null, audioUrl || "", source || "soundcloud", now, sessionId],
        });
      } else {
        sessionId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        await t.execute({
          sql: `INSERT INTO ListenSession (id, hostId, guestId, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source, progress, isPlaying, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
          args: [sessionId, userId, contactId, trackId || "", trackTitle || "Ожидание...", trackArtist || "", trackCover || "", scTrackId ?? null, audioUrl || "", source || "soundcloud", now, now],
        });
      }

      // Send system message in DM
      await database.createMessage({
        content: `listen_invite:${sessionId}`,
        senderId: userId,
        receiverId: contactId,
        encrypted: false,
        messageType: "system",
      });

      // Create notification for the guest
      await database.createNotification({
        userId: contactId,
        type: "listen_invite",
        title: "Приглашение слушать вместе",
        body: `@${user.username} приглашает вас слушать музыку вместе`,
        data: JSON.stringify({ senderId: userId, senderUsername: user.username, sessionId }),
      });

      return NextResponse.json({ sessionId, ok: true });
    }

    // Prisma fallback
    const { db } = await import("@/lib/db");
    const existingSession = await db.listenSession.findFirst({
      where: { OR: [{ hostId: userId, guestId: contactId }, { hostId: contactId, guestId: userId }] },
    });

    let listenSession;
    if (existingSession) {
      listenSession = await db.listenSession.update({
        where: { id: existingSession.id },
        data: {
          trackId: trackId || "", trackTitle: trackTitle || "Ожидание...",
          trackArtist: trackArtist || "", trackCover: trackCover || "",
          scTrackId: scTrackId != null ? scTrackId : null,
          audioUrl: audioUrl || "", source: source || "soundcloud",
          progress: 0, isPlaying: true,
        },
      });
    } else {
      listenSession = await db.listenSession.create({
        data: {
          hostId: userId, guestId: contactId,
          trackId: trackId || "", trackTitle: trackTitle || "Ожидание...",
          trackArtist: trackArtist || "", trackCover: trackCover || "",
          scTrackId: scTrackId != null ? scTrackId : null,
          audioUrl: audioUrl || "", source: source || "soundcloud",
        },
      });
    }

    await db.message.create({
      data: {
        senderId: userId, receiverId: contactId,
        content: `listen_invite:${listenSession.id}`,
        encrypted: false, messageType: "system",
      },
    });

    await db.notification.create({
      data: {
        userId: contactId, type: "listen_invite",
        title: "Приглашение слушать вместе",
        body: `@${user.username} приглашает вас слушать музыку вместе`,
        data: JSON.stringify({ senderId: userId, senderUsername: user.username, sessionId: listenSession.id }),
      },
    });

    return NextResponse.json({ sessionId: listenSession.id, ok: true });
  } catch (error) {
    console.error("Listen invite error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Ошибка при отправке приглашения", details: msg }, { status: 500 });
  }
}
