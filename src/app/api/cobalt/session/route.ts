import { NextRequest, NextResponse } from "next/server";

/**
 * Cobalt Session API — exchanges a Cloudflare Turnstile token for a cobalt JWT.
 *
 * Flow:
 * 1. Client-side Turnstile widget solves a challenge and returns a token
 * 2. Client sends the token here
 * 3. We forward it to cobalt's /session endpoint
 * 4. cobalt verifies the token with Cloudflare and returns a JWT
 * 5. We return the JWT to the client
 *
 * The JWT is then cached client-side and sent with every SNIP bypass request.
 * JWTs typically last several hours, so the user only needs to solve Turnstile
 * once per session.
 */

export const runtime = "edge";

const COBALT_API = "https://api.cobalt.tools";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const turnstileToken = body.turnstileToken;

    if (!turnstileToken || typeof turnstileToken !== "string") {
      return NextResponse.json(
        { error: "missing turnstileToken" },
        { status: 400 },
      );
    }

    // Exchange Turnstile token for cobalt JWT
    const sessionRes = await fetch(`${COBALT_API}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "cf-turnstile-response": turnstileToken,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
    });

    if (!sessionRes.ok) {
      const errorText = await sessionRes.text().catch(() => "");
      console.warn(
        `[cobalt-session] HTTP ${sessionRes.status}: ${errorText.substring(0, 200)}`,
      );
      return NextResponse.json(
        { error: "session_failed", details: errorText.substring(0, 200) },
        { status: sessionRes.status },
      );
    }

    const sessionData = await sessionRes.json();

    // cobalt returns the JWT in various formats depending on version
    // Typically: { token: "eyJ..." } or just the JWT string
    const jwt =
      sessionData.token ||
      sessionData.jwt ||
      sessionData.access_token ||
      (typeof sessionData === "string" ? sessionData : null);

    if (!jwt) {
      console.warn(
        `[cobalt-session] Unexpected response:`,
        JSON.stringify(sessionData).substring(0, 200),
      );
      return NextResponse.json(
        {
          error: "no_jwt",
          details: "cobalt session returned unexpected format",
        },
        { status: 502 },
      );
    }

    console.log(
      `[cobalt-session] JWT obtained successfully, length=${jwt.length}`,
    );

    return NextResponse.json({
      token: jwt,
      // Include expiry info if available
      expiresAt: sessionData.exp || sessionData.expiresAt || null,
    });
  } catch (err) {
    console.error("[cobalt-session] Error:", err);
    return NextResponse.json(
      { error: "session_error" },
      { status: 500 },
    );
  }
}
