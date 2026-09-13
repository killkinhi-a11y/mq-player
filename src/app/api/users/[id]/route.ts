import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/[id] — public user profile for the native app's Friends /
 * user-profile screens (F7).
 *
 * Returns the user's public fields, an online indicator (lastSeen < 5 min,
 * same rule as /api/users/status), and the caller's friendship state with
 * that user — enough to render profile → add friend / cancel request /
 * accept-reject / remove / message actions in a single round trip.
 *
 * Deliberately does NOT expose email / role / moderation fields.
 */
async function handler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    const user = await database.findUserById(id);
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Friendship state relative to the caller (null when no relation exists)
    let friendship: { status: string; requestId: string | null; friendshipId: string | null } = {
      status: "none",
      requestId: null,
      friendshipId: null,
    };
    if (id !== userId) {
      const relation = await database.findFriendship(userId, id);
      if (relation) {
        if (relation.status === "accepted") {
          friendship = { status: "friends", requestId: null, friendshipId: relation.id };
        } else if (relation.status === "pending") {
          if (relation.requesterId === userId) {
            // We sent the request — caller can cancel it (DELETE by request id)
            friendship = { status: "outgoing", requestId: relation.id, friendshipId: null };
          } else {
            // They sent it to us — caller can accept / reject (PUT by request id)
            friendship = { status: "incoming", requestId: relation.id, friendshipId: null };
          }
        } // rejected rows are invisible to both sides — treat as "none"
      }
    } else {
      friendship = { status: "self", requestId: null, friendshipId: null };
    }

    const lastSeenMs = user.lastSeen ? new Date(user.lastSeen).getTime() : null;
    const online = lastSeenMs !== null && Date.now() - lastSeenMs < 5 * 60 * 1000;

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar || "",
        createdAt: user.createdAt,
      },
      online,
      lastSeen: user.lastSeen || null,
      friendship,
    });
  } catch (error) {
    console.error("User profile GET error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке профиля" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(handler));
