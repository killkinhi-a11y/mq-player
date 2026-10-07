import { NextResponse } from "next/server";

/**
 * Public Spotify app config for the PKCE flow.
 *
 * Returns ONLY the public Client ID — in the Authorization Code + PKCE flow
 * the Client ID is public by design (it is NOT a secret; the secret is never
 * required and never sent to the browser). The Client SECRET stays in server
 * env and is never exposed by this endpoint (V2 spec §9, research §2).
 */
export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID || null;
  return NextResponse.json(
    { clientId, pkce: true, redirectPath: "/spotify/callback" },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
