import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sync?userId=xxx — fetch all user data from server
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const syncData = await db.userSync.findMany({
      where: { userId },
    });

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
// Body: { userId, data: { key: value, ... } }
export async function POST(req: NextRequest) {
  try {
    const { userId, data } = await req.json();
    if (!userId || !data || typeof data !== "object") {
      return NextResponse.json({ error: "userId and data required" }, { status: 400 });
    }

    // Only allow specific keys
    const allowedKeys = new Set([
      "history",
      "playlists",
      "likedTracks",
      "dislikedTracks",
      "likedTracksData",
      "settings",
    ]);

    const entries = Object.entries(data);
    for (const [key] of entries) {
      if (!allowedKeys.has(key)) continue;

      const value = data[key];
      const jsonString = JSON.stringify(value ?? null);

      await db.userSync.upsert({
        where: { userId_key: { userId, key } },
        update: { data: jsonString },
        create: { userId, key, data: jsonString },
      });
    }

    return NextResponse.json({ message: "Data synced" });
  } catch (error) {
    console.error("Sync POST error:", error);
    return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
  }
}
