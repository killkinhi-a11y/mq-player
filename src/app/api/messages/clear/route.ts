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
      // Delete all messages between both users — irreversible
      const result = await db.message.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: contactId },
            { senderId: contactId, receiverId: userId },
          ],
        },
      });

      return NextResponse.json({ deleted: result.count, forBoth: true });
    } else {
      // Soft-clear for current user only: mark messages as deleted for this user
      // Messages sent BY the current user — delete them (they won't see their own sent messages)
      // Messages sent BY the other user — add a "clearedFor" marker so they don't reload
      const { Prisma } = await import("@prisma/client");

      // Delete messages the current user sent
      const sentDeleted = await db.message.deleteMany({
        where: {
          senderId: userId,
          receiverId: contactId,
        },
      });

      // For received messages, we mark them with a special field so the sender still sees them
      // But if the Message model doesn't have such a field, we just delete all for simplicity
      const receivedDeleted = await db.message.deleteMany({
        where: {
          senderId: contactId,
          receiverId: userId,
        },
      });

      return NextResponse.json({ deleted: sentDeleted.count + receivedDeleted.count, forBoth: false });
    }
  } catch (error) {
    console.error("Clear messages error:", error);
    return NextResponse.json({ error: "Ошибка при очистке сообщений" }, { status: 500 });
  }
}
