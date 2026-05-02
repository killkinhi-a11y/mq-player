import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for SoundCloud DRM license requests.
 *
 * SoundCloud's license server (license.media-streaming.soundcloud.cloud)
 * does not return CORS headers, so browsers cannot call it directly.
 * This Edge Function proxies the license challenge/response between
 * HLS.js EME and SoundCloud's Widevine/FairPlay license server.
 */
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { licenseUrl, challenge /* base64-encoded */ } = body;

  if (!licenseUrl || !challenge) {
    return NextResponse.json({ error: "missing licenseUrl or challenge" }, { status: 400 });
  }

  try {
    // Forward the license request to SoundCloud
    const res = await fetch(licenseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: Buffer.from(challenge, "base64"),
    });

    if (!res.ok) {
      console.error("[license-proxy] SC license server returned", res.status);
      return NextResponse.json(
        { error: `license server returned ${res.status}` },
        { status: res.status },
      );
    }

    // Return the raw license key as base64 — HLS.js will decode it
    const licenseBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(licenseBuffer).toString("base64");

    return NextResponse.json({ license: base64 });
  } catch (err) {
    console.error("[license-proxy] Error:", err);
    return NextResponse.json({ error: "license proxy failed" }, { status: 500 });
  }
}
