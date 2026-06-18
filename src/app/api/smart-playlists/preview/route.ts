import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/database";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { evaluateSmartPlaylist, type SmartPlaylistConfig } from "@/lib/smartPlaylist";

/**
 * POST /api/smart-playlists/preview
 * Evaluates rules against the user's library WITHOUT saving.
 */
async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const body = await req.json();
    const { rules, limit, sortBy } = body as {
      rules: SmartPlaylistConfig["rules"];
      limit?: number;
      sortBy?: SmartPlaylistConfig["sortBy"];
    };

    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: "rules must be an array" }, { status: 400 });
    }

    const likedSync = await database.findUserSyncByUserIdAndKey(ctx.userId, "likedTracks");
    const historySync = await database.findUserSyncByUserIdAndKey(ctx.userId, "history");

    let likedTracksData: any[] = [];
    let history: any[] = [];
    try { likedTracksData = likedSync ? JSON.parse(likedSync.data) : []; } catch { likedTracksData = []; }
    try { history = historySync ? JSON.parse(historySync.data) : []; } catch { history = []; }

    const tracks = evaluateSmartPlaylist(
      { rules, limit: limit || 100, sortBy: sortBy || "createdAt" },
      { likedTracksData, history },
    );

    return NextResponse.json({ tracks, count: tracks.length });
  } catch (error) {
    console.error("Smart playlist preview error:", error);
    return NextResponse.json({ error: "Ошибка предпросмотра" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.read, withAuth(handler));
