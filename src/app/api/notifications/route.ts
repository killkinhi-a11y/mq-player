import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Ensure the Notification table exists (auto-migration)
let migrationRan = false;
async function ensureTable() {
  if (migrationRan) return;
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "body" TEXT NOT NULL DEFAULT '',
        "data" TEXT NOT NULL DEFAULT '{}',
        "read" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read")`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt")`);
    } catch { /* table may already exist or migration not needed */ }
  migrationRan = true;
}

// GET /api/notifications?userId=xxx — get user's notifications
export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await db.notification.count({
      where: { userId, read: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/notifications — create a notification
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const { userId, type, title, body, data } = await req.json();
    if (!userId || !type || !title) {
      return NextResponse.json({ error: "userId, type, title обязательны" }, { status: 400 });
    }

    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        body: body || "",
        data: data ? JSON.stringify(data) : "{}",
      },
    });

    return NextResponse.json({ notification });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PUT /api/notifications — mark notifications as read
export async function PUT(req: NextRequest) {
  try {
    await ensureTable();
    const { userId, notificationId, markAll } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    if (markAll) {
      await db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (notificationId) {
      await db.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Укажите notificationId или markAll" }, { status: 400 });
  } catch (error) {
    console.error("Notifications PUT error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/notifications?userId=xxx&notificationId=xxx — delete a notification
export async function DELETE(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const notificationId = searchParams.get("notificationId");

    if (!userId || !notificationId) {
      return NextResponse.json({ error: "userId и notificationId обязательны" }, { status: 400 });
    }

    await db.notification.delete({
      where: { id: notificationId, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications DELETE error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
