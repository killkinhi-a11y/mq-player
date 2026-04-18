import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/friends/[id] — accept or reject a friend request
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await req.json(); // "accept" or "reject"

    if (!action || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "action должен быть 'accept' или 'reject'" }, { status: 400 });
    }

    const friendRequest = await db.friend.findUnique({ where: { id } });
    if (!friendRequest) {
      return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";
    await db.friend.update({
      where: { id },
      data: { status: newStatus },
    });

    // Create notification when accepted
    if (action === "accept") {
      try {
        const requester = await db.user.findUnique({ where: { id: friendRequest.requesterId }, select: { username: true } });
        const addressee = await db.user.findUnique({ where: { id: friendRequest.addresseeId }, select: { username: true } });
        if (requester && addressee) {
          await db.notification.createMany({
            data: [
              { userId: friendRequest.requesterId, type: "friend_accepted", title: "Новый друг", body: `${addressee.username} принял(а) вашу заявку`, data: JSON.stringify({ friendId: friendRequest.addresseeId }) },
              { userId: friendRequest.addresseeId, type: "friend_accepted", title: "Новый друг", body: `${requester.username} теперь ваш друг`, data: JSON.stringify({ friendId: friendRequest.requesterId }) },
            ],
          });
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      message: action === "accept" ? "Заявка принята" : "Заявка отклонена",
      status: newStatus,
    });
  } catch (error) {
    console.error("Update friend request error:", error);
    return NextResponse.json({ error: "Ошибка при обновлении запроса" }, { status: 500 });
  }
}

// DELETE /api/friends/[id] — remove a friend
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.friend.delete({ where: { id } });

    return NextResponse.json({ message: "Друг удалён" });
  } catch (error) {
    console.error("Delete friend error:", error);
    return NextResponse.json({ error: "Ошибка при удалении друга" }, { status: 500 });
  }
}
