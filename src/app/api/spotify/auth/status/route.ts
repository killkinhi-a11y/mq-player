import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ connected: false });
  }

  try {
    // Validate token by calling Spotify /me endpoint
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!meRes.ok) {
      // Token is invalid/expired
      return NextResponse.json({ connected: false });
    }

    const meData = await meRes.json();

    return NextResponse.json({
      connected: true,
      user: {
        id: meData.id,
        display_name: meData.display_name,
        images: meData.images || [],
      },
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
