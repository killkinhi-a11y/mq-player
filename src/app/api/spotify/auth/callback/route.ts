import { NextRequest, NextResponse } from "next/server";
import { pkceStore } from "../route";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("[Spotify OAuth] Authorization error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=missing_params`
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=no_client_id`
    );
  }

  // Retrieve PKCE code_verifier
  const pkceEntry = pkceStore.get(state);
  if (!pkceEntry) {
    console.error("[Spotify OAuth] No PKCE entry found for state:", state);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=invalid_state`
    );
  }

  // Clean up PKCE entry (one-time use)
  pkceStore.delete(state);

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/api/spotify/auth/callback`;

  // Exchange authorization code for access token
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: pkceEntry.codeVerifier,
  });

  // Add client_secret if available (not strictly needed for PKCE, but supported)
  if (clientSecret) {
    tokenBody.set("client_secret", clientSecret);
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.text();
      console.error("[Spotify OAuth] Token exchange failed:", tokenRes.status, errorData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=token_exchange_failed`
      );
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Build redirect URL with cookies
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin") || "";
    const redirectUrl = new URL("/play", baseUrl);
    redirectUrl.searchParams.set("spotify", "connected");

    // Create response and set httpOnly cookies
    const response = NextResponse.redirect(redirectUrl.toString());

    // Access token cookie — short-lived (1 hour)
    response.cookies.set("spotify_access_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expires_in || 3600,
    });

    // Refresh token cookie — long-lived
    if (refresh_token) {
      response.cookies.set("spotify_refresh_token", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60, // 1 year
      });
    }

    return response;
  } catch (err) {
    console.error("[Spotify OAuth] Token exchange error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/play?spotify=error&reason=network_error`
    );
  }
}
