import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";

// GET /api/sync — fetch all user data from server
async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    const { userId } = ctx;

    const syncData = await database.findUserSyncData(userId);

    const result: Record<string, unknown> = {};
    for (const row of syncData) {
      try {
        result[row.key] = JSON.parse(row.data);
      } catch {
        result[row.key] = null;
      }
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Sync GET error:", error);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}

// POST /api/sync — save user data to server
// Body: { data: { key: value, ... } }
async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { userId } = ctx;
    const { data } = await req.json();
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "data required" }, { status: 400 });
    }

    // Size limit: 2MB per sync payload
    const jsonSize = JSON.stringify(data).length;
    if (jsonSize > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Data too large (max 2MB)" }, { status: 413 });
    }

    // Only allow specific keys
    const allowedKeys = new Set([
      "history",
      "playlists",
      "likedTracks",
      "dislikedTracks",
      "likedTracksData",
      "dislikedTracksData",
      "settings",
    ]);

    const entries = Object.entries(data);
    for (const [key] of entries) {
      if (!allowedKeys.has(key)) continue;

      const value = data[key];
      const jsonString = JSON.stringify(value ?? null);

      await database.upsertUserSync(userId, key, jsonString);
    }

    return NextResponse.json({ message: "Data synced" });
  } catch (error) {
    console.error("Sync POST error:", error);
    return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
