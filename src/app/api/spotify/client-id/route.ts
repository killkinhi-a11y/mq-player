import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: "Spotify client ID not configured" }, { status: 500 });
  }

  return NextResponse.json({ clientId });
}
