import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/notifications?userId=xxx — get user's notifications
export async function GET(req: NextRequest) {
  try {
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
