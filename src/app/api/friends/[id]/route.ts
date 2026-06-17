import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient, database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// PUT /api/friends/[id] — accept or reject a friend request
async function putHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { id } = await ctx.params;
    const { action } = await req.json();

    if (!action || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "action должен быть 'accept' или 'reject'" }, { status: 400 });
    }

    // Look up friend request — use Turso raw SQL since database adapter doesn't expose findFriendById
    let friendRequest: { id: string; requesterId: string; addresseeId: string; status: string } | null = null;
    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({
        sql: "SELECT id, requesterId, addresseeId, status FROM Friend WHERE id = ?",
        args: [id],
      });
      if (r.rows.length > 0) {
        const row = r.rows[0] as Record<string, unknown>;
        friendRequest = {
          id: String(row.id ?? ""),
          requesterId: String(row.requesterId ?? ""),
          addresseeId: String(row.addresseeId ?? ""),
          status: String(row.status ?? "pending"),
        };
      }
    } else {
      const { db } = await import("@/lib/db");
      const fr = await db.friend.findUnique({ where: { id } });
      if (fr) {
        friendRequest = {
          id: fr.id, requesterId: fr.requesterId, addresseeId: fr.addresseeId, status: fr.status,
        };
      }
    }

    if (!friendRequest) {
      return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
    }
    if (friendRequest.addresseeId !== userId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";

    if (isTurso()) {
      const t = getTursoClient();
      await t.execute({
        sql: "UPDATE Friend SET status = ?, updatedAt = ? WHERE id = ?",
        args: [newStatus, new Date().toISOString(), id],
      });
    } else {
      const { db } = await import("@/lib/db");
      await db.friend.update({ where: { id }, data: { status: newStatus } });
    }

    // Create notifications on accept
    if (action === "accept") {
      try {
        const requester = await database.findUserById(friendRequest.requesterId);
        const addressee = await database.findUserById(friendRequest.addresseeId);
        if (requester && addressee) {
          await database.createNotifications([
            {
              userId: friendRequest.requesterId,
              type: "friend_accepted",
              title: "Новый друг",
              body: `${addressee.username} принял(а) вашу заявку`,
              data: JSON.stringify({ friendId: friendRequest.addresseeId }),
            },
            {
              userId: friendRequest.addresseeId,
              type: "friend_accepted",
              title: "Новый друг",
              body: `${requester.username} теперь ваш друг`,
              data: JSON.stringify({ friendId: friendRequest.requesterId }),
            },
          ]);
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
async function deleteHandler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { id } = await ctx.params;

    // Verify the user is a party to this friendship
    let friendship: { requesterId: string; addresseeId: string } | null = null;
    if (isTurso()) {
      const t = getTursoClient();
      const r = await t.execute({
        sql: "SELECT requesterId, addresseeId FROM Friend WHERE id = ?",
        args: [id],
      });
      if (r.rows.length > 0) {
        const row = r.rows[0] as Record<string, unknown>;
        friendship = {
          requesterId: String(row.requesterId ?? ""),
          addresseeId: String(row.addresseeId ?? ""),
        };
      }
    } else {
      const { db } = await import("@/lib/db");
      const fr = await db.friend.findUnique({ where: { id }, select: { requesterId: true, addresseeId: true } });
      if (fr) friendship = { requesterId: fr.requesterId, addresseeId: fr.addresseeId };
    }

    if (!friendship || (friendship.requesterId !== userId && friendship.addresseeId !== userId)) {
      return NextResponse.json({ error: "Запрос не найден или нет доступа" }, { status: 403 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      await t.execute({ sql: "DELETE FROM Friend WHERE id = ?", args: [id] });
    } else {
      const { db } = await import("@/lib/db");
      await db.friend.delete({ where: { id } });
    }

    return NextResponse.json({ message: "Друг удалён" });
  } catch (error) {
    console.error("Delete friend error:", error);
    return NextResponse.json({ error: "Ошибка при удалении друга" }, { status: 500 });
  }
}
export const PUT = withRateLimit(RATE_LIMITS.write, withAuth(putHandler));
export const DELETE = withRateLimit(RATE_LIMITS.write, withAuth(deleteHandler));
