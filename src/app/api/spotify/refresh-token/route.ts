import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("spotify_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId) {
    return NextResponse.json({ error: "Spotify client ID not configured" }, { status: 500 });
  }

  const tokenBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  // Add client_secret if available
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
      console.error("[Spotify] Token refresh failed:", tokenRes.status, errorData);
      return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenData;

    const response = NextResponse.json({ access_token });

    // Update access token cookie
    response.cookies.set("spotify_access_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expires_in || 3600,
    });

    // Update refresh token if a new one was issued
    if (newRefreshToken) {
      response.cookies.set("spotify_refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (err) {
    console.error("[Spotify] Token refresh error:", err);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
  }
}
