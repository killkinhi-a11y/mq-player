import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { database } from "@/lib/database";
import crypto from "crypto";

/**
 * Last.fm "now playing" API.
 *
 * POST /api/lastfm/now-playing
 * Body: { track, artist, album?, sessionKey }
 */

function signRequest(params: Record<string, string>, sharedSecret: string): string {
  const sorted = Object.keys(params).sort();
  const sig = sorted.map((k) => `${k}${params[k]}`).join("") + sharedSecret;
  return crypto.createHash("md5").update(sig, "utf8").digest("hex");
}

async function handler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  if (!validateContentType(req)) {
    return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
  }

  const apiKey = process.env.LASTFM_API_KEY;
  const sharedSecret = process.env.LASTFM_SHARED_SECRET;
  if (!apiKey || !sharedSecret) {
    return NextResponse.json({ error: "Last.fm not configured on server" }, { status: 503 });
  }

  const body = await req.json();
  const { track, artist, album, sessionKey: clientSessionKey } = body as {
    track: string;
    artist: string;
    album?: string;
    sessionKey: string;
  };

  if (!track || !artist || !clientSessionKey) {
    return NextResponse.json({ error: "track, artist, sessionKey required" }, { status: 400 });
  }

  const stored = await database.findUserSyncByUserIdAndKey(ctx.userId, "lastfm_session");
  if (!stored || stored.data !== clientSessionKey) {
    return NextResponse.json({ error: "Invalid session key" }, { status: 403 });
  }

  const params: Record<string, string> = {
    method: "track.updateNowPlaying",
    api_key: apiKey,
    sk: clientSessionKey,
    artist,
    track,
    format: "json",
  };
  if (album) params.album = album;

  params.api_sig = signRequest(params, sharedSecret);

  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    formData.append(k, v);
  }

  try {
    const res = await fetch("https://ws.audioscrobbler.com/2.0/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[Last.fm] Now playing error:", data);
      return NextResponse.json({ error: data.message || "Last.fm error" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[Last.fm] Now playing fetch error:", e);
    return NextResponse.json({ error: "Failed to contact Last.fm" }, { status: 502 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, withAuth(handler));
