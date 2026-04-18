import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/friends?userId=xxx — list accepted friends + pending requests received
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    // Get all friend relations where this user is involved
    const friendships = await db.friend.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { addresseeId: userId },
        ],
      },
      include: {
        requester: { select: { id: true, username: true, avatar: true } },
        addressee: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Separate into accepted friends and pending incoming requests
    const friends: { id: string; username: string; avatar: string; addedAt: string }[] = [];
    const pendingRequests: { id: string; username: string; requestId: string }[] = [];

    for (const f of friendships) {
      if (f.status === "accepted") {
        const friendUser = f.requesterId === userId ? f.addressee : f.requester;
        friends.push({
          id: friendUser.id,
          username: friendUser.username,
          avatar: (friendUser as any).avatar || "",
          addedAt: f.updatedAt.toISOString(),
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
export async function POST(req: NextRequest) {
  try {
    const { requesterId, addresseeId } = await req.json();

    if (!requesterId || !addresseeId) {
      return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
    }

    if (requesterId === addresseeId) {
      return NextResponse.json({ error: "Нельзя добавить себя в друзья" }, { status: 400 });
    }

    // Verify both users exist
    const [requester, addressee] = await Promise.all([
      db.user.findUnique({ where: { id: requesterId } }),
      db.user.findUnique({ where: { id: addresseeId } }),
    ]);
    if (!requester || !addressee) {
      return NextResponse.json({ error: "Один из пользователей не найден" }, { status: 404 });
    }

    // Check if a relation already exists
    const existing = await db.friend.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "Вы уже друзья" }, { status: 409 });
      }
      if (existing.status === "pending") {
        if (existing.requesterId === requesterId) {
          return NextResponse.json({ error: "Запрос уже отправлен" }, { status: 409 });
        } else {
          // The other person sent us a request — auto-accept
          await db.friend.update({
            where: { id: existing.id },
            data: { status: "accepted" },
          });
          return NextResponse.json({ message: "Заявка принята — вы теперь друзья!" }, { status: 200 });
        }
      }
      // rejected — allow re-sending
      await db.friend.update({
        where: { id: existing.id },
        data: { status: "pending", requesterId, addresseeId },
      });
      return NextResponse.json({ message: "Запрос отправлен повторно" }, { status: 201 });
    }

    const friend = await db.friend.create({
      data: { requesterId, addresseeId, status: "pending" },
    });

    return NextResponse.json({ message: "Запрос в друзья отправлен", friendId: friend.id }, { status: 201 });
  } catch (error) {
    console.error("Send friend request error:", error);
    return NextResponse.json({ error: "Ошибка при отправке запроса" }, { status: 500 });
  }
}
