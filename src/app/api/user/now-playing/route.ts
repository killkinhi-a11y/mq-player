import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/user/now-playing?userId=xxx — get someone's now-playing status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    const sync = await db.userSync.findUnique({
      where: { userId_key: { userId, key: "nowPlaying" } },
    });

    if (!sync) {
      return NextResponse.json({ nowPlaying: null });
    }

    const data = JSON.parse(sync.data);
    // If last update was more than 2 minutes ago, consider it stale
    const updatedAt = sync.updatedAt.getTime();
    if (Date.now() - updatedAt > 2 * 60 * 1000) {
      return NextResponse.json({ nowPlaying: null });
    }

    return NextResponse.json({ nowPlaying: data });
  } catch (error) {
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PUT /api/user/now-playing — set own now-playing status
export async function PUT(req: NextRequest) {
  try {
    const { userId, track } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId обязателен" }, { status: 400 });

    if (!track || Object.keys(track).length === 0) {
      // Clear now-playing status
      await db.userSync.deleteMany({
        where: { userId, key: "nowPlaying" },
      });
      return NextResponse.json({ success: true, nowPlaying: null });
    }

    // Upsert now-playing data
    await db.userSync.upsert({
      where: { userId_key: { userId, key: "nowPlaying" } },
      create: {
        userId,
        key: "nowPlaying",
        data: JSON.stringify(track),
      },
      update: {
        data: JSON.stringify(track),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Now-playing error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
