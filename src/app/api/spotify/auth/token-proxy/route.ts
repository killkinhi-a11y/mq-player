import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint that returns the user's Spotify access token from httpOnly cookies.
 * This is needed because the Spotify Web Playback SDK's getOAuthToken callback
 * needs the token, but it can't access httpOnly cookies directly from the client.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("spotify_access_token")?.value;

  if (!accessToken) {
    // Try refreshing the token first
    const refreshToken = request.cookies.get("spotify_refresh_token")?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "No token available" }, { status: 401 });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId) {
      return NextResponse.json({ error: "Spotify not configured" }, { status: 500 });
    }

    try {
      const tokenBody = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      });
      if (clientSecret) tokenBody.set("client_secret", clientSecret);

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
      }

      const tokenData = await tokenRes.json();

      const response = NextResponse.json({ access_token: tokenData.access_token });
      response.cookies.set("spotify_access_token", tokenData.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: tokenData.expires_in || 3600,
      });

      if (tokenData.refresh_token) {
        response.cookies.set("spotify_refresh_token", tokenData.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 365 * 24 * 60 * 60,
        });
      }

      return response;
    } catch {
      return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
    }
  }

  // Optionally validate the token is still valid
  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });

    if (meRes.ok) {
      return NextResponse.json({ access_token: accessToken });
    }

    // Token is expired, try refreshing
    const refreshToken = request.cookies.get("spotify_refresh_token")?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "Token expired, no refresh token" }, { status: 401 });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId) {
      return NextResponse.json({ error: "Spotify not configured" }, { status: 500 });
    }

    const tokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    if (clientSecret) tokenBody.set("client_secret", clientSecret);

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
    }

    const tokenData = await tokenRes.json();

    const response = NextResponse.json({ access_token: tokenData.access_token });
    response.cookies.set("spotify_access_token", tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: tokenData.expires_in || 3600,
    });

    if (tokenData.refresh_token) {
      response.cookies.set("spotify_refresh_token", tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    }

    return response;
  } catch {
    // If validation fails, just return the token (let the SDK handle 401)
    return NextResponse.json({ access_token: accessToken });
  }
}
