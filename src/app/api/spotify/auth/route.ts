import { NextRequest, NextResponse } from "next/server";

// Server-side PKCE code_verifier storage (keyed by state parameter)
// In production, use Redis or a database — this is memory-only for simplicity
const pkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();

// Clean up expired entries periodically
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of pkceStore.entries()) {
      if (val.expiresAt < now) pkceStore.delete(key);
    }
  }, 60_000);
}

// PKCE helpers
function generateRandomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function base64encode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Spotify client ID not configured" }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin")}/api/spotify/auth/callback`;

  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(64);

  // Store code_verifier for later use in callback
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  pkceStore.set(state, {
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  const scopes = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-library-read",
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  return NextResponse.json({ url: authUrl });
}

// Export the store for use in callback route
export { pkceStore };
