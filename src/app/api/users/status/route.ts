import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

async function handler(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids") || "";
    const ids = idsParam.split(",").filter(Boolean).slice(0, 100); // Cap at 100

    if (ids.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    // Batch fetch: get all users' last seen time in a single query
    const users = await db.user.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        lastSeen: true,
      },
    });

    // Also check if any are invisible (via localStorage — but that's client-side)
    // Server only knows lastSeen; the client-side hideOnline flag is checked separately
    const now = Date.now();
    const ONLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const statuses: Record<string, { online: boolean; lastSeen: number | null }> = {};
    for (const user of users) {
      const lastSeen = user.lastSeen ? new Date(user.lastSeen).getTime() : null;
      const online = lastSeen !== null && (now - lastSeen) < ONLINE_THRESHOLD;
      statuses[user.id] = { online, lastSeen };
    }

    // Include IDs that weren't found as offline
    for (const id of ids) {
      if (!statuses[id]) {
        statuses[id] = { online: false, lastSeen: null };
      }
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Batch user status error:", error);
    return NextResponse.json({ statuses: {} }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
