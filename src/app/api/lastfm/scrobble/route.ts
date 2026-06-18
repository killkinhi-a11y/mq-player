import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { database } from "@/lib/database";
import crypto from "crypto";

/**
 * Last.fm scrobble API.
 *
 * POST /api/lastfm/scrobble
 * Body: { track, artist, album?, timestamp, duration?, sessionKey }
 *
 * Calls Last.fm's track.scrobble method with API signature.
 * Requires LASTFM_API_KEY + LASTFM_SHARED_SECRET in env.
 */

function getLastFMSessionKey(userId: string, clientKey: string): string {
  // The client sends the session key it got during auth.
  // We verify it against the stored one in UserSync.
  return clientKey;
}

function signRequest(params: Record<string, string>, sharedSecret: string): string {
  // Last.fm signature: sort params by key, concatenate key+value, append secret, MD5
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
  const { track, artist, album, timestamp, duration, sessionKey: clientSessionKey } = body as {
    track: string;
    artist: string;
    album?: string;
    timestamp: number;
    duration?: number;
    sessionKey: string;
  };

  if (!track || !artist || !timestamp || !clientSessionKey) {
    return NextResponse.json({ error: "track, artist, timestamp, sessionKey required" }, { status: 400 });
  }

  // Verify session key matches what we stored
  const stored = await database.findUserSyncByUserIdAndKey(ctx.userId, "lastfm_session");
  if (!stored || stored.data !== clientSessionKey) {
    return NextResponse.json({ error: "Invalid session key" }, { status: 403 });
  }

  // Build Last.fm API request
  const params: Record<string, string> = {
    method: "track.scrobble",
    api_key: apiKey,
    sk: clientSessionKey,
    "artist[]": artist,
    "track[]": track,
    timestamp: String(timestamp),
    format: "json",
  };
  if (album) params["album[]"] = album;
  if (duration) params["duration[]"] = String(duration);

  const apiSig = signRequest(params, sharedSecret);
  params.api_sig = apiSig;

  // Send to Last.fm
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
      console.error("[Last.fm] Scrobble error:", data);
      return NextResponse.json({ error: data.message || "Last.fm error", code: data.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, scrobbles: data.scrobbles });
  } catch (e) {
    console.error("[Last.fm] Scrobble fetch error:", e);
    return NextResponse.json({ error: "Failed to contact Last.fm" }, { status: 502 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, withAuth(handler));
