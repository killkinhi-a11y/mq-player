import { NextRequest, NextResponse } from "next/server";
import { generateOAuthState, buildGoogleAuthUrl, isGoogleConfigured, OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE, getRequestOrigin } from "@/lib/oauth";

/**
 * GET /api/auth/google — start the Google OAuth 2.0 / OIDC flow.
 *
 * 1. Generates a random `state` and stores it in a short-lived HttpOnly
 *    cookie (CSRF protection — the callback compares cookie vs. query param).
 * 2. Redirects the browser to Google's official consent screen.
 *
 * The redirect_uri is constructed server-side from the request origin, so
 * the browser can never influence it (no open redirect).
 */
export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/play?authError=google_not_configured", getRequestOrigin(req))
    );
  }

  const state = generateOAuthState();
  const origin = getRequestOrigin(req);
  const authUrl = buildGoogleAuthUrl(origin, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must be lax: Google redirects back via top-level navigation
    maxAge: OAUTH_STATE_MAX_AGE,
    path: "/",
  });
  // W13 ACCOUNT LINKING marker: an authenticated user started this flow
  // from Settings ("Подключить Google"). The callback then links the
  // verified Google identity to the SESSION user instead of resolving a
  // login. Same lifetime as the state cookie; requires the session to
  // still be valid when the callback lands.
  if (req.nextUrl.searchParams.get("link") === "1") {
    response.cookies.set("mq_oauth_link", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_MAX_AGE,
      path: "/",
    });
  }
  // Desktop handoff marker: the MQ Player Windows app started this flow in
  // the SYSTEM browser (webview OAuth is blocked by Google). The callback
  // reads it back and routes the finish through /desktop-auth instead of
  // the web /play redirect. Same lifetime as the state cookie.
  if (req.nextUrl.searchParams.get("desktop") === "1") {
    response.cookies.set("mq_oauth_desktop", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}
