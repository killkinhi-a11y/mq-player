import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie, getSessionFromRequest } from "@/lib/auth";
import { resolveGoogleLogin } from "@/lib/google-auth";
import { signDesktopHandoffToken } from "@/lib/desktop-handoff";
import { database } from "@/lib/database";
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

    // ── W13: ACCOUNT LINKING mode ──────────────────────────────────────────
    // Started from Settings with ?link=1. The verified Google identity is
    // attached to the CURRENT session user — no login resolution, no
    // account switching, no auto-merge. Conflicts (identity already owned
    // by another account, or its email belongs to another account) redirect
    // with linkError and nothing is written. The session cookie stays as-is.
    const isLinkFlow = req.cookies.get("mq_oauth_link")?.value === "1";
    if (isLinkFlow) {
      const clearLink = (res: NextResponse) => {
        res.cookies.delete("mq_oauth_link");
        return res;
      };
      const session = await getSessionFromRequest(req);
      if (!session) {
        return clearLink(
          NextResponse.redirect(new URL("/play?linkError=no_session", origin))
        );
      }

      // Conflict: Google identity already attached to ANOTHER account
      const existingIdentity = await database.findAuthIdentity("google", identity.sub);
      if (existingIdentity && existingIdentity.userId !== session.userId) {
        return clearLink(
          NextResponse.redirect(new URL("/play?linkError=google_taken", origin))
        );
      }
      // Conflict: verified Google email belongs to ANOTHER account
      // (in link mode we never silently take over an email-owned account)
      if (identity.email && identity.emailVerified) {
        const emailOwner = await database.findUserByEmail(identity.email);
        if (emailOwner && emailOwner.id !== session.userId) {
          return clearLink(
            NextResponse.redirect(new URL("/play?linkError=google_taken", origin))
          );
        }
      }

      if (!existingIdentity) {
        await database.createAuthIdentity({
          userId: session.userId,
          provider: "google",
          providerUserId: identity.sub,
          providerEmail: identity.email,
          providerUsername: null,
        });
      }

      return clearLink(
        NextResponse.redirect(new URL("/play?linkSuccess=google", origin))
      );
    }

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
    // Desktop handoff (Windows app opened this flow in the system browser):
    // finish through /desktop-auth, which exchanges a one-time code for the
    // session token and passes it to the installed app via mq://. The
    // session cookie is STILL set (this browser tab stays logged in too).
    const isDesktopFlow = req.cookies.get("mq_oauth_desktop")?.value === "1";
    if (isDesktopFlow) {
      const handoffToken = await signDesktopHandoffToken({
        userId: result.sessionPayload.userId,
        username: result.sessionPayload.username,
        email: result.sessionPayload.email,
        role: result.sessionPayload.role,
      });
      redirectUrl.pathname = "/desktop-auth";
      redirectUrl.search = `?c=${encodeURIComponent(handoffToken)}`;
    }
    const response = NextResponse.redirect(redirectUrl);
    if (isDesktopFlow) response.cookies.delete("mq_oauth_desktop");
    return clearState(
      await setSessionCookie(response, result.sessionPayload)
    );
  } catch (error) {
    console.error("Google callback error:", error);
    return fail("google_failed");
  }
}
