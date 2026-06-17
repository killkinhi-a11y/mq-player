import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 5, window: 60, key: "messages-clear" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const body = await req.json();
    const { contactId, forBoth } = body;

    if (!contactId) {
      return NextResponse.json({ error: "contactId обязателен" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      // UPDATE … WHERE … returns the number of rows changed in libSQL
      if (forBoth === true) {
        const r = await t.execute({
          sql: `UPDATE Message SET deleted = 1, content = '[Очищено]', messageType = 'system', encrypted = 0, voiceUrl = NULL, voiceDuration = NULL
                WHERE ((senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)) AND deleted = 0`,
          args: [userId, contactId, contactId, userId],
        });
        return NextResponse.json({ deleted: Number(r.rowsAffected ?? 0), forBoth: true });
      }
      const sentR = await t.execute({
        sql: `UPDATE Message SET deleted = 1, content = '[Очищено]', messageType = 'system', encrypted = 0
              WHERE senderId = ? AND receiverId = ? AND deleted = 0`,
        args: [userId, contactId],
      });
      const receivedR = await t.execute({
        sql: `UPDATE Message SET deleted = 1, content = '[Очищено]', messageType = 'system', encrypted = 0
              WHERE senderId = ? AND receiverId = ? AND deleted = 0`,
        args: [contactId, userId],
      });
      return NextResponse.json({
        deleted: Number(sentR.rowsAffected ?? 0) + Number(receivedR.rowsAffected ?? 0),
        forBoth: false,
      });
    }

    const { db } = await import("@/lib/db");
    if (forBoth === true) {
      const result = await db.message.updateMany({
        where: {
          OR: [
            { senderId: userId, receiverId: contactId },
            { senderId: contactId, receiverId: userId },
          ],
          deleted: false,
        },
        data: {
          deleted: true,
          content: "[Очищено]",
          messageType: "system",
          encrypted: false,
          voiceUrl: null,
          voiceDuration: null,
        },
      });
      return NextResponse.json({ deleted: result.count, forBoth: true });
    }
    const sentDeleted = await db.message.updateMany({
      where: { senderId: userId, receiverId: contactId, deleted: false },
      data: { deleted: true, content: "[Очищено]", messageType: "system", encrypted: false },
    });
    const receivedDeleted = await db.message.updateMany({
      where: { senderId: contactId, receiverId: userId, deleted: false },
      data: { deleted: true, content: "[Очищено]", messageType: "system", encrypted: false },
    });
    return NextResponse.json({ deleted: sentDeleted.count + receivedDeleted.count, forBoth: false });
  } catch (error) {
    console.error("Clear messages error:", error);
    return NextResponse.json({ error: "Ошибка при очистке сообщений" }, { status: 500 });
  }
}
export const DELETE = withAuth(handler);
