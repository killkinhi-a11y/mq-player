import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { resolveGoogleLogin } from "@/lib/google-auth";
import {
  generateOAuthState,
  verifyOAuthState,
  verifyGoogleIdToken,
  isGoogleConfigured,
} from "@/lib/oauth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateContentType } from "@/lib/withAuth";

/**
 * /api/auth/google/native — native Android Google login (Credential Manager).
 *
 * GET  → issues a one-time nonce (random 256-bit, HttpOnly cookie, 10 min).
 *        The app passes it into GetGoogleIdOption; Google embeds it in the
 *        id_token `nonce` claim — replay protection for the token exchange.
 *
 * POST { idToken } → the EXACT verification chain the browser callback uses:
 *   1. nonce: cookie (issued by GET) === id_token nonce claim — single use
 *   2. id_token signature/issuer/audience via JWKS (verifyGoogleIdToken)
 *   3. resolveGoogleLogin — the same account resolution as /api/auth/google/callback
 *   4. session cookie (httpOnly) + JSON { authenticated, userId, ... }
 *
 * The Google Client Secret never leaves this server; the app only ever sees
 * the PUBLIC web client id (fetched from /api/auth/providers) and its own
 * one-time id_token. No new OAuth client, no new flow — same identity graph
 * as the web, a native transport.
 */

const NONCE_COOKIE = "mq_native_nonce";
const NONCE_MAX_AGE = 600; // 10 minutes — mirrors OAUTH_STATE_MAX_AGE

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 503 });
  }

  // Light rate limit: 30 nonce fetches per minute per instance.
  // The nonce is public material (no secret); this only stops hot-looping.
  const { success, resetIn } = rateLimit({
    ip: "native-nonce",
    limit: 30,
    window: 60,
    key: "google-native-nonce",
  });
  if (!success) {
    return NextResponse.json(
      { error: "Слишком много запросов", retryAfter: resetIn },
      { status: 429 }
    );
  }

  const nonce = generateOAuthState();
  const response = NextResponse.json({ nonce });
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NONCE_MAX_AGE,
    path: "/",
  });
  return response;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: same budget as email login (10 attempts / min / IP)
    const ip = getClientIp(req);
    const { success, resetIn } = rateLimit({
      ip,
      limit: 10,
      window: 60,
      key: "google-native-login",
    });
    if (!success) {
      return NextResponse.json(
        { error: "Слишком много попыток входа. Попробуйте позже.", retryAfter: resetIn },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(resetIn),
          },
        }
      );
    }

    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    if (!isGoogleConfigured()) {
      return NextResponse.json({ error: "google_not_configured" }, { status: 503 });
    }

    const raw = await req.json();
    const idToken = typeof raw?.idToken === "string" ? raw.idToken : "";
    if (!idToken) {
      return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
    }

    // 1. Nonce check — cookie issued by GET must match the token claim.
    //    Single use: cleared on EVERY outcome below.
    const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
    const clearNonce = (res: NextResponse) => {
      res.cookies.delete(NONCE_COOKIE);
      return res;
    };

    // 2. Cryptographic verification (signature / issuer / audience / exp)
    const identity = await verifyGoogleIdToken(idToken);
    if (!identity || !identity.sub) {
      return clearNonce(
        NextResponse.json({ error: "google_token_invalid" }, { status: 401 })
      );
    }
    if (!verifyOAuthState(cookieNonce, identity.nonce)) {
      return clearNonce(NextResponse.json({ error: "invalid_nonce" }, { status: 401 }));
    }

    // 3. Shared account resolution — identical to the browser callback
    const result = await resolveGoogleLogin(identity);
    if (!result.ok) {
      const status =
        result.code === "maintenance" ? 503 :
        result.code === "blocked" ? 403 :
        result.code === "account_missing" ? 404 : 500;
      // Safe diagnostics only: result codes carry no token material.
      console.warn(`[google-native] login rejected: ${result.code}`);
      return clearNonce(NextResponse.json({ error: result.code }, { status }));
    }

    // 4. Session cookie (httpOnly — OkHttp's cookie jar persists it in the app)
    const response = NextResponse.json({
      authenticated: true,
      userId: result.sessionPayload.userId,
      username: result.sessionPayload.username,
      email: result.sessionPayload.email,
      role: result.sessionPayload.role,
      avatar: result.avatar,
      linked: result.linked,
      created: result.created,
    });
    return clearNonce(await setSessionCookie(response, result.sessionPayload));
  } catch (error) {
    // Never log the request body — it contains the id_token.
    console.error("Google native login error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "google_failed" }, { status: 500 });
  }
}
