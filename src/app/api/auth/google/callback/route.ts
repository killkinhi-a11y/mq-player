import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { resolveGoogleLogin } from "@/lib/google-auth";
import {
  verifyOAuthState,
  generateOAuthState,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  logAuthDiagnostic,
  getRequestOrigin,
  OAUTH_STATE_COOKIE,
} from "@/lib/oauth";

/**
 * GET /api/auth/google/callback — finish the Google OAuth flow (browser).
 *
 * Full server-side verification chain:
 *   1. state (cookie) === state (query)           — CSRF
 *   2. code → tokens exchange with Google         — server-to-server
 *   3. id_token signature/issuer/audience via JWKS — identity validation
 *   4. resolveGoogleLogin — shared account resolution (lib/google-auth.ts)
 *
 * Account resolution lives in lib/google-auth.ts and is shared with the
 * native Android entry point (/api/auth/google/native) — same flow, two
 * transports. Access tokens are NOT stored — only the id_token is used,
 * once, here.
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/play?authError=${code}`, origin));

  // Correlation ID — ties every diagnostic line of this attempt together
  // in the server log (never exposed to the browser).
  const correlationId = generateOAuthState().slice(0, 8);

  try {
    // 1. CSRF state check
    const queryState = req.nextUrl.searchParams.get("state");
    const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!verifyOAuthState(cookieState, queryState)) {
      return fail("invalid_state");
    }
    // Clear the state cookie — single use
    // (One-time state: after this comparison the cookie is worthless, and it
    // expires in 10 minutes regardless. Success paths below return fresh
    // responses; we clear the cookie on them via a helper.)
    const clearState = (res: NextResponse) => {
      res.cookies.delete(OAUTH_STATE_COOKIE);
      return res;
    };

    // User cancelled at the Google consent screen
    if (req.nextUrl.searchParams.get("error") === "access_denied") {
      return fail("google_cancelled");
    }

    // 2. Exchange the code
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return fail("missing_code");

    const exchange = await exchangeGoogleCode(origin, code, correlationId);
    if (!exchange.id_token) {
      // Google rejected OUR server credentials (wrong/rotated client secret) —
      // a distinct, honest, admin-actionable class. The browser still gets a
      // generic safe message; the provider error code stays in the server log.
      if (exchange.error?.providerError === "invalid_client") {
        return fail("google_not_configured");
      }
      return fail("google_exchange_failed");
    }

    // 3. Verify the id_token cryptographically
    const identity = await verifyGoogleIdToken(exchange.id_token, correlationId);
    if (!identity || !identity.sub) return fail("google_token_invalid");

    // 4. Shared account resolution (identical chain for native logins)
    const result = await resolveGoogleLogin(identity);
    if (!result.ok) {
      logAuthDiagnostic({
        step: "google.resolve",
        errorClass: result.code,
        correlationId,
      });
      return fail(result.code);
    }

    const redirectUrl = new URL(
      "/play?auth=success&provider=google" +
        (result.linked ? "&linked=1" : "") +
        (result.created ? "&created=1" : ""),
      origin
    );
    return clearState(
      await setSessionCookie(NextResponse.redirect(redirectUrl), result.sessionPayload)
    );
  } catch (error) {
    console.error("Google callback error:", error);
    return fail("google_failed");
  }
}
