import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";
import { database } from "@/lib/database";

/**
 * GET /api/lastfm/token
 * Returns the Last.fm API key (public) + whether the user has a connected session.
 * The API key is safe to expose — it's the shared secret that must stay server-side.
 */
async function handler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  const apiKey = process.env.LASTFM_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ connected: false, error: "LASTFM_API_KEY not set" });
  }

  // Check if user has a stored Last.fm session key
  const syncData = await database.findUserSyncByUserIdAndKey(ctx.userId, "lastfm_session");
  const sessionKey = syncData?.data || "";

  return NextResponse.json({
    apiKey,
    connected: !!sessionKey,
    sessionKey: sessionKey ? "***" : null, // don't expose the actual key to the client
  });
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(handler));
