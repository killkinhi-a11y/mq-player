import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

export const dynamic = "force-dynamic";

// GET /api/notifications — get user's notifications
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    const notifications = await database.findNotifications(userId);
    const unreadCount = await database.countUnreadNotifications(userId);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/notifications — create a notification
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { type, title, body, data } = await req.json();
    if (!type || !title) {
      return NextResponse.json({ error: "type, title обязательны" }, { status: 400 });
    }

    // Only allow system notification types — users cannot create arbitrary notifications
    const allowedTypes = ["message", "friend_request", "friend_accepted", "system", "listen_invite"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }

    // Limit notification body length
    if (body && body.length > 500) {
      return NextResponse.json({ error: "Body too long" }, { status: 400 });
    }

    const notification = await database.createNotification({
      userId,
      type,
      title: title.slice(0, 100),
      body: body ? body.slice(0, 500) : "",
      data: typeof data === "string" ? data : JSON.stringify(data || {}),
    });

    return NextResponse.json({ notification });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PUT /api/notifications — mark notifications as read
async function putHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { notificationId, markAll } = await req.json();

    if (markAll) {
      await database.markAllNotificationsRead(userId);
      return NextResponse.json({ success: true });
    }

    if (notificationId) {
      await database.markNotificationRead(notificationId, userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Укажите notificationId или markAll" }, { status: 400 });
  } catch (error) {
    console.error("Notifications PUT error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/notifications?notificationId=xxx — delete a notification
async function deleteHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      return NextResponse.json({ error: "notificationId обязателен" }, { status: 400 });
    }

    await database.deleteNotification(notificationId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications DELETE error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
export const PUT = withRateLimit(RATE_LIMITS.write, withAuth(putHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));
