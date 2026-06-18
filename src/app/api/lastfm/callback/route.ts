import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth } from "@/lib/withAuth";
import { database } from "@/lib/database";
import crypto from "crypto";

/**
 * Last.fm auth callback.
 *
 * GET /api/lastfm/callback?token=xxx
 *
 * Last.fm redirects here after the user authorizes. We exchange the token
 * for a session key (auth.getSession), store it in UserSync, then redirect
 * to /play?lastfm=connected.
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
  const apiKey = process.env.LASTFM_API_KEY;
  const sharedSecret = process.env.LASTFM_SHARED_SECRET;
  if (!apiKey || !sharedSecret) {
    return NextResponse.redirect(new URL("/play?lastfm=error&reason=no_config", req.url));
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/play?lastfm=error&reason=no_token", req.url));
  }

  // Exchange token for session key
  const params: Record<string, string> = {
    method: "auth.getSession",
    api_key: apiKey,
    token,
    format: "json",
  };
  params.api_sig = signRequest(params, sharedSecret);

  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || !data.session?.key) {
      console.error("[Last.fm] Auth error:", data);
      return NextResponse.redirect(new URL("/play?lastfm=error&reason=auth_failed", req.url));
    }

    const sessionKey = data.session.key;
    const lastfmUsername = data.session.name || "";

    // Store session key in UserSync
    await database.upsertUserSync(
      ctx.userId,
      "lastfm_session",
      JSON.stringify({ sessionKey, username: lastfmUsername })
    );

    return NextResponse.redirect(new URL("/play?lastfm=connected", req.url));
  } catch (e) {
    console.error("[Last.fm] Callback error:", e);
    return NextResponse.redirect(new URL("/play?lastfm=error&reason=fetch_failed", req.url));
  }
}

export const GET = withRateLimit(RATE_LIMITS.auth, withAuth(handler));
