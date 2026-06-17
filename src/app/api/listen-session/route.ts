import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const maxDuration = 30;

interface SessionShape {
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
  hostName?: string;
  guestName?: string;
}

async function fetchSessionTurso(t: ReturnType<typeof getTursoClient>, whereSql: string, args: (string | number)[]): Promise<SessionShape | null> {
  const result = await t.execute({
    sql: `SELECT ls.*, h.username as h_username, g.username as g_username
          FROM ListenSession ls
          JOIN User h ON ls.hostId = h.id
          JOIN User g ON ls.guestId = g.id
          WHERE ${whereSql} LIMIT 1`,
    args,
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

export async function GET(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 60, window: 60, key: "listen-session-get" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const userId = session.userId;

    if (isTurso()) {
      const t = getTursoClient();
      const [hostedSession, joinedSession] = await Promise.all([
        fetchSessionTurso(t, "ls.hostId = ? AND ls.guestId != ?", [userId, userId]),
        fetchSessionTurso(t, "ls.guestId = ? AND ls.hostId != ?", [userId, userId]),
      ]);
      return NextResponse.json({
        hosted: hostedSession ? { ...hostedSession, isHost: true } : null,
        joined: joinedSession ? { ...joinedSession, isHost: false } : null,
      });
    }

    const { db } = await import("@/lib/db");
    const [hostedSession, joinedSession] = await Promise.all([
      db.listenSession.findFirst({
        where: { hostId: userId, guestId: { not: userId } },
        include: { host: { select: { id: true, username: true, avatar: true } }, guest: { select: { id: true, username: true, avatar: true } } },
      }),
      db.listenSession.findFirst({
        where: { guestId: userId, hostId: { not: userId } },
        include: { host: { select: { id: true, username: true, avatar: true } }, guest: { select: { id: true, username: true, avatar: true } } },
      }),
    ]);
    const shape = (s: typeof hostedSession, isHost: boolean) => s ? {
      id: s.id, hostId: s.hostId, hostName: s.host.username,
      guestId: s.guestId, guestName: s.guest.username,
      trackId: s.trackId, trackTitle: s.trackTitle, trackArtist: s.trackArtist,
      trackCover: s.trackCover, scTrackId: s.scTrackId, audioUrl: s.audioUrl,
      source: s.source, progress: s.progress, isPlaying: s.isPlaying, isHost,
    } : null;
    return NextResponse.json({
      hosted: shape(hostedSession, true),
      joined: shape(joinedSession, false),
    });
  } catch (error) {
    console.error("Get listen session error:", error);
    return NextResponse.json({ error: "Ошибка при получении сессии" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 30, window: 60, key: "listen-session-post" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const userId = session.userId;

    const body = await req.json();
    const { action, guestId } = body;

    if (!action || !["create", "update", "leave"].includes(action)) {
      return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();

      if (action === "create") {
        const { trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
        if (!trackId || !trackTitle || !trackArtist || !guestId) {
          return NextResponse.json({ error: "Отсутствуют обязательные поля" }, { status: 400 });
        }
        // Verify friendship
        const friendResult = await t.execute({
          sql: "SELECT id FROM Friend WHERE status = 'accepted' AND ((requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)) LIMIT 1",
          args: [userId, guestId, guestId, userId],
        });
        if (friendResult.rows.length === 0) {
          return NextResponse.json({ error: "Можно слушать вместе только с друзьями" }, { status: 403 });
        }
        // Find existing session between these users
        const existingResult = await t.execute({
          sql: "SELECT id FROM ListenSession WHERE (hostId = ? AND guestId = ?) OR (hostId = ? AND guestId = ?) LIMIT 1",
          args: [userId, guestId, guestId, userId],
        });
        const now = new Date().toISOString();
        if (existingResult.rows.length > 0) {
          const existingId = String((existingResult.rows[0] as Record<string, unknown>).id);
          await t.execute({
            sql: `UPDATE ListenSession SET trackId = ?, trackTitle = ?, trackArtist = ?, trackCover = ?, scTrackId = ?, audioUrl = ?, source = ?, progress = 0, isPlaying = 1, updatedAt = ? WHERE id = ?`,
            args: [trackId, trackTitle, trackArtist, trackCover || "", scTrackId ?? null, audioUrl || "", source || "soundcloud", now, existingId],
          });
          return NextResponse.json({ ok: true, sessionId: existingId });
        }
        const newId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        await t.execute({
          sql: `INSERT INTO ListenSession (id, hostId, guestId, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source, progress, isPlaying, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
          args: [newId, userId, guestId, trackId, trackTitle, trackArtist, trackCover || "", scTrackId ?? null, audioUrl || "", source || "soundcloud", now, now],
        });
        return NextResponse.json({ ok: true, sessionId: newId });
      }

      if (action === "update") {
        const { progress, isPlaying, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
        const hostResult = await t.execute({ sql: "SELECT id FROM ListenSession WHERE hostId = ? LIMIT 1", args: [userId] });
        if (hostResult.rows.length === 0) {
          return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
        }
        const sessionId = String((hostResult.rows[0] as Record<string, unknown>).id);
        const sets: string[] = [];
        const args: (string | number | null)[] = [];
        if (typeof progress === "number") { sets.push("progress = ?"); args.push(progress); }
        if (typeof isPlaying === "boolean") { sets.push("isPlaying = ?"); args.push(isPlaying ? 1 : 0); }
        if (trackId) {
          sets.push("trackId = ?");
          args.push(trackId);
          sets.push("trackTitle = ?");
          args.push(trackTitle || "");
          sets.push("trackArtist = ?");
          args.push(trackArtist || "");
          if (trackCover !== undefined) { sets.push("trackCover = ?"); args.push(trackCover); }
          if (scTrackId !== undefined) { sets.push("scTrackId = ?"); args.push(scTrackId ?? null); }
          if (audioUrl !== undefined) { sets.push("audioUrl = ?"); args.push(audioUrl); }
          if (source !== undefined) { sets.push("source = ?"); args.push(source); }
        }
        if (sets.length === 0) return NextResponse.json({ ok: true });
        sets.push("updatedAt = ?");
        args.push(new Date().toISOString());
        args.push(sessionId);
        await t.execute({ sql: `UPDATE ListenSession SET ${sets.join(", ")} WHERE id = ?`, args });
        return NextResponse.json({ ok: true });
      }

      if (action === "leave") {
        await t.batch([
          { sql: "DELETE FROM ListenSession WHERE hostId = ?", args: [userId] },
          { sql: "DELETE FROM ListenSession WHERE guestId = ?", args: [userId] },
        ]);
        return NextResponse.json({ ok: true });
      }
    }

    // Prisma fallback
    const { db } = await import("@/lib/db");
    if (action === "create") {
      const { trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
      if (!trackId || !trackTitle || !trackArtist || !guestId) {
        return NextResponse.json({ error: "Отсутствуют обязательные поля" }, { status: 400 });
      }
      const friendship = await db.friend.findFirst({
        where: { OR: [{ requesterId: userId, addresseeId: guestId, status: "accepted" }, { requesterId: guestId, addresseeId: userId, status: "accepted" }] },
      });
      if (!friendship) return NextResponse.json({ error: "Можно слушать вместе только с друзьями" }, { status: 403 });
      const existing = await db.listenSession.findFirst({ where: { OR: [{ hostId: userId, guestId }, { hostId: guestId, guestId: userId }] } });
      if (existing) {
        const updated = await db.listenSession.update({
          where: { id: existing.id },
          data: { trackId, trackTitle, trackArtist, trackCover: trackCover || "", scTrackId: scTrackId || null, audioUrl: audioUrl || "", source: source || "soundcloud", progress: 0, isPlaying: true },
        });
        return NextResponse.json({ session: updated, ok: true });
      }
      const newSession = await db.listenSession.create({
        data: { hostId: userId, guestId, trackId, trackTitle, trackArtist, trackCover: trackCover || "", scTrackId: scTrackId || null, audioUrl: audioUrl || "", source: source || "soundcloud" },
      });
      return NextResponse.json({ session: newSession, ok: true });
    }
    if (action === "update") {
      const { progress, isPlaying, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source } = body;
      const hostSession = await db.listenSession.findFirst({ where: { hostId: userId } });
      if (!hostSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
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
      if (Object.keys(updateData).length === 0) return NextResponse.json({ ok: true });
      const updated = await db.listenSession.update({ where: { id: hostSession.id }, data: updateData });
      return NextResponse.json({ session: updated, ok: true });
    }
    if (action === "leave") {
      await db.listenSession.deleteMany({ where: { OR: [{ hostId: userId }, { guestId: userId }] } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("Listen session POST error:", error);
    return NextResponse.json({ error: "Ошибка при обработке сессии" }, { status: 500 });
  }
}
