import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export async function DELETE(req: NextRequest) {
  const { success } = rateLimit({ ip: getClientIp(req), limit: 5, window: 60, key: "messages-clear" });
  if (!success) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const userId = session.userId;

    const body = await req.json();
    const { contactId, forBoth } = body;

    if (!contactId) {
      return NextResponse.json({ error: "contactId обязателен" }, { status: 400 });
    }

    if (forBoth === true) {
      // Soft-delete for both users — do NOT hard-delete messages
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
    } else {
      // Soft-clear for current user only
      const sentDeleted = await db.message.updateMany({
        where: {
          senderId: userId,
          receiverId: contactId,
          deleted: false,
        },
        data: {
          deleted: true,
          content: "[Очищено]",
          messageType: "system",
          encrypted: false,
        },
      });

      const receivedDeleted = await db.message.updateMany({
        where: {
          senderId: contactId,
          receiverId: userId,
          deleted: false,
        },
        data: {
          deleted: true,
          content: "[Очищено]",
          messageType: "system",
          encrypted: false,
        },
      });

      return NextResponse.json({ deleted: sentDeleted.count + receivedDeleted.count, forBoth: false });
    }
  } catch (error) {
    console.error("Clear messages error:", error);
    return NextResponse.json({ error: "Ошибка при очистке сообщений" }, { status: 500 });
  }
}
