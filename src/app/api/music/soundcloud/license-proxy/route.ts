import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for SoundCloud DRM license requests.
 *
 * SoundCloud's license server (license.media-streaming.soundcloud.cloud)
 * does not return CORS headers, so browsers cannot call it directly.
 * This Edge Function proxies the license challenge/response between
 * HLS.js EME and SoundCloud's Widevine/FairPlay license server.
 *
 * CRITICAL: The `licenseAuthToken` (JWE token from the stream resolve response)
 * MUST be included in the license request. Without it, SC's license server
 * rejects the request. The client sends this token alongside the CDM challenge.
 */
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { licenseUrl, challenge /* base64-encoded */, licenseAuthToken /* JWE from resolve */ } = body;

  if (!licenseUrl || !challenge) {
    return NextResponse.json({ error: "missing licenseUrl or challenge" }, {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  // Security: only allow SoundCloud license server URLs
  try {
    const parsed = new URL(licenseUrl);
    if (!parsed.hostname.endsWith("soundcloud.com") && !parsed.hostname.endsWith("soundcloud.cloud")) {
      return NextResponse.json({ error: "only SoundCloud URLs are allowed" }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }
  } catch {
    return NextResponse.json({ error: "invalid licenseUrl" }, {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  try {
    // Forward the license request to SoundCloud with 15s timeout
    // DRM license acquisition can be slow — EME key exchange + SC server processing
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
      // Build the license URL with auth token as query parameter
      // SC's license server expects the token in the URL
      let licenseFetchUrl = licenseUrl;
      if (licenseAuthToken) {
        const sep = licenseUrl.includes("?") ? "&" : "?";
        licenseFetchUrl += `${sep}license-auth-token=${encodeURIComponent(licenseAuthToken)}`;
      }

      res = await fetch(licenseFetchUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/octet-stream",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          // Some SC license servers check Referer/Origin for legitimacy
          "Referer": "https://w.soundcloud.com/",
          "Origin": "https://w.soundcloud.com",
          // Forward the license auth token as a header too (belt and suspenders)
          ...(licenseAuthToken ? { "X-License-Auth-Token": licenseAuthToken } : {}),
        },
        body: Buffer.from(challenge, "base64"),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.error("[license-proxy] SC license server returned", res.status, licenseAuthToken ? "(with auth token)" : "(NO auth token)");
      return NextResponse.json(
        { error: `license server returned ${res.status}` },
        { status: res.status, headers: corsHeaders(request) },
      );
    }

    // Return the raw license key as base64 — HLS.js will decode it
    const licenseBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(licenseBuffer).toString("base64");

    return NextResponse.json({ license: base64 }, {
      headers: corsHeaders(request),
    });
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    console.error("[license-proxy] Error:", isTimeout ? "timeout (15s)" : err);
    return NextResponse.json(
      { error: isTimeout ? "license server timeout" : "license proxy failed" },
      { status: isTimeout ? 504 : 500, headers: corsHeaders(request) },
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin");
  // Allow any origin — the license proxy needs to work from any deployment URL
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
