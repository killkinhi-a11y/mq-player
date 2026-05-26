import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// GET /api/friends — list accepted friends + pending requests received
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    // Get all friend relations where this user is involved
    const friendships = await database.findFriends(userId);

    // Separate into accepted friends and pending incoming requests
    const friends: { id: string; username: string; avatar: string; addedAt: string }[] = [];
    const pendingRequests: { id: string; username: string; requestId: string }[] = [];

    for (const f of friendships) {
      if (f.status === "accepted") {
        const friendUser = f.requesterId === userId ? f.addressee : f.requester;
        friends.push({
          id: friendUser.id,
          username: friendUser.username,
          avatar: friendUser.avatar || "",
          addedAt: f.updatedAt,
        });
      } else if (f.status === "pending" && f.addresseeId === userId) {
        // Pending request received by this user
        pendingRequests.push({
          id: f.requester.id,
          username: f.requester.username,
          requestId: f.id,
        });
      }
    }

    return NextResponse.json({ friends, pendingRequests });
  } catch (error) {
    console.error("Get friends error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке друзей" }, { status: 500 });
  }
}

// POST /api/friends — send friend request
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { addresseeId } = await req.json();

    if (!addresseeId) {
      return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
    }

    if (userId === addresseeId) {
      return NextResponse.json({ error: "Нельзя добавить себя в друзья" }, { status: 400 });
    }

    // Verify both users exist
    const [requester, addressee] = await Promise.all([
      database.findUserById(userId),
      database.findUserById(addresseeId),
    ]);
    if (!requester || !addressee) {
      return NextResponse.json({ error: "Один из пользователей не найден" }, { status: 404 });
    }

    // Check if a relation already exists
    const existing = await database.findFriendship(userId, addresseeId);

    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "Вы уже друзья" }, { status: 409 });
      }
      if (existing.status === "pending") {
        if (existing.requesterId === userId) {
          return NextResponse.json({ error: "Запрос уже отправлен" }, { status: 409 });
        } else {
          // The other person sent us a request — auto-accept
          await database.updateFriendStatus(existing.id, "accepted");
          // Create notification for both users
          try {
            await database.createNotifications([
              { userId: addresseeId, type: "friend_accepted", title: "Новый друг", body: `${requester.username} теперь ваш друг`, data: JSON.stringify({ friendId: userId }) },
              { userId: userId, type: "friend_accepted", title: "Новый друг", body: `${addressee.username} теперь ваш друг`, data: JSON.stringify({ friendId: addresseeId }) },
            ]);
          } catch { /* non-critical */ }
          return NextResponse.json({ message: "Заявка принята — вы теперь друзья!" }, { status: 200 });
        }
      }
      // rejected — delete old and create fresh request
      await database.deleteFriend(existing.id);
    }
    const friend = await database.createFriend({
      requesterId: userId,
      addresseeId,
      status: "pending",
    });

    // Create notification for the addressee
    try {
      await database.createNotification({
        userId: addresseeId,
        type: "friend_request",
        title: `Заявка в друзья`,
        body: `${requester.username} хочет добавить вас в друзья`,
        data: JSON.stringify({ senderId: userId, senderUsername: requester.username, requestId: friend.id }),
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ message: "Запрос в друзья отправлен", friendId: friend.id }, { status: 201 });
  } catch (error) {
    console.error("Send friend request error:", error);
    return NextResponse.json({ error: "Ошибка при отправке запроса" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
