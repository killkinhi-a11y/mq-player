import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";

// GET /api/user/now-playing — get own or another user's now-playing status
async function getHandler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    // Allow fetching another user's now-playing via ?userId= param
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");
    const userId = targetUserId && targetUserId !== session.userId ? targetUserId : session.userId;

    const sync = await database.findUserSyncByUserIdAndKey(userId, "nowPlaying");

    if (!sync) {
      return NextResponse.json({ nowPlaying: null }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" },
      });
    }

    const data = JSON.parse(sync.data);
    // If last update was more than 2 minutes ago, consider it stale
    const updatedAt = new Date(sync.updatedAt).getTime();
    if (Date.now() - updatedAt > 2 * 60 * 1000) {
      return NextResponse.json({ nowPlaying: null }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" },
      });
    }

    return NextResponse.json({ nowPlaying: data }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" },
    });
  } catch (error) {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PUT /api/user/now-playing — set own now-playing status
async function putHandler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;
    const { track } = await req.json();

    if (!track || Object.keys(track).length === 0) {
      // Clear now-playing status
      await database.deleteUserSync(userId, "nowPlaying");
      return NextResponse.json({ success: true, nowPlaying: null });
    }

    // Upsert now-playing data
    await database.upsertUserSync(userId, "nowPlaying", JSON.stringify(track));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Now-playing error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, getHandler);
export const PUT = withRateLimit(RATE_LIMITS.write, putHandler);
