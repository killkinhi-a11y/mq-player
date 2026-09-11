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
  return response;
}
