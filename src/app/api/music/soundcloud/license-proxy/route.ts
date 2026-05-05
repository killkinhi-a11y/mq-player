import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for SoundCloud DRM license requests.
 *
 * Supports TWO modes:
 *
 * 1. BINARY MODE (preferred): HLS.js sends raw CDM challenge directly.
 *    - URL params: licenseUrl (SC license server), licenseAuthToken (JWE)
 *    - Body: raw CDM challenge (ArrayBuffer / application/octet-stream)
 *    - Response: raw license key (ArrayBuffer)
 *    - No JSON encoding/decoding overhead — simpler and more reliable.
 *
 * 2. JSON MODE (legacy): Client wraps challenge in JSON envelope.
 *    - Body: { licenseUrl, challenge (base64), licenseAuthToken }
 *    - Response: { license (base64) }
 *    - Kept for backward compatibility.
 *
 * SoundCloud's license server does not return CORS headers, so browsers
 * cannot call it directly. This Edge Function proxies the license
 * challenge/response between HLS.js EME and SoundCloud's Widevine/FairPlay
 * license server.
 */
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Detect mode: binary if licenseUrl is in query params, JSON otherwise
  const urlLicenseUrl = searchParams.get("licenseUrl");
  const urlAuthToken = searchParams.get("licenseAuthToken") || "";

  if (urlLicenseUrl) {
    // ═══════════════════════════════════════════════════
    // BINARY MODE: Raw CDM challenge passthrough
    // ═══════════════════════════════════════════════════
    return handleBinaryMode(request, urlLicenseUrl, urlAuthToken);
  }

  // ═══════════════════════════════════════════════════
  // JSON MODE: Legacy JSON envelope
  // ═══════════════════════════════════════════════════
  return handleJsonMode(request);
}

/**
 * Binary mode: HLS.js sends raw CDM challenge, proxy forwards directly.
 */
async function handleBinaryMode(
  request: NextRequest,
  licenseUrl: string,
  licenseAuthToken: string
) {
  // Security: only allow SoundCloud license server URLs
  const urlCheck = validateLicenseUrl(licenseUrl);
  if (urlCheck) {
    return urlCheck;
  }

  try {
    // Read the raw CDM challenge from the request body
    const challengeBody = await request.arrayBuffer();

    if (challengeBody.byteLength === 0) {
      console.error("[license-proxy] Binary mode: empty challenge body");
      return NextResponse.json(
        { error: "empty challenge" },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.log("[license-proxy] Binary mode: challenge", challengeBody.byteLength, "bytes, hasAuthToken:", !!licenseAuthToken);

    // Forward to SC license server
    const result = await forwardToSoundCloud(licenseUrl, licenseAuthToken, challengeBody);

    if (!result.ok) {
      return result.errorResponse;
    }

    // Return RAW license key — HLS.js reads it as ArrayBuffer directly
    return new NextResponse(result.licenseBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        ...corsHeaders(request),
      },
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[license-proxy] Binary mode error:", isTimeout ? "timeout" : err);
    return NextResponse.json(
      { error: isTimeout ? "license server timeout" : "license proxy failed" },
      { status: isTimeout ? 504 : 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * JSON mode: Client wraps challenge in JSON, proxy extracts and forwards.
 */
async function handleJsonMode(request: NextRequest) {
  try {
    const body = await request.json();
    const { licenseUrl, challenge, licenseAuthToken } = body;

    if (!licenseUrl || !challenge) {
      return NextResponse.json({ error: "missing licenseUrl or challenge" }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }

    const urlCheck = validateLicenseUrl(licenseUrl);
    if (urlCheck) {
      return urlCheck;
    }

    const challengeBuffer = Buffer.from(challenge, "base64");
    console.log("[license-proxy] JSON mode: challenge", challengeBuffer.byteLength, "bytes, hasAuthToken:", !!licenseAuthToken);

    const result = await forwardToSoundCloud(licenseUrl, licenseAuthToken || "", challengeBuffer);

    if (!result.ok) {
      return result.errorResponse;
    }

    // Return as JSON-wrapped base64 for backward compatibility
    const base64 = Buffer.from(result.licenseBuffer).toString("base64");
    console.log("[license-proxy] JSON mode: license acquired,", result.licenseBuffer.byteLength, "bytes");

    return NextResponse.json({ license: base64 }, {
      headers: corsHeaders(request),
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[license-proxy] JSON mode error:", isTimeout ? "timeout" : err);
    return NextResponse.json(
      { error: isTimeout ? "license server timeout" : "license proxy failed" },
      { status: isTimeout ? 504 : 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * Validate that the license URL points to a SoundCloud server.
 */
function validateLicenseUrl(licenseUrl: string): NextResponse | null {
  try {
    const parsed = new URL(licenseUrl);
    if (!parsed.hostname.endsWith("soundcloud.com") && !parsed.hostname.endsWith("soundcloud.cloud")) {
      return NextResponse.json(
        { error: "only SoundCloud URLs are allowed" },
        { status: 400, headers: corsHeaders({ headers: new Headers() } as any) }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "invalid licenseUrl" },
      { status: 400, headers: corsHeaders({ headers: new Headers() } as any) }
    );
  }
  return null;
}

/**
 * Forward the license challenge to SoundCloud's license server.
 * Returns { ok: true, licenseBuffer } or { ok: false, errorResponse }.
 */
async function forwardToSoundCloud(
  licenseUrl: string,
  licenseAuthToken: string,
  challengeBody: ArrayBuffer | Buffer | Uint8Array
): Promise<
  | { ok: true; licenseBuffer: ArrayBuffer }
  | { ok: false; errorResponse: NextResponse }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // Build the license URL with auth token as query parameter
    let licenseFetchUrl = licenseUrl;
    if (licenseAuthToken) {
      const sep = licenseUrl.includes("?") ? "&" : "?";
      licenseFetchUrl += `${sep}license-auth-token=${encodeURIComponent(licenseAuthToken)}`;
    }

    const res = await fetch(licenseFetchUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/octet-stream",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Referer": "https://w.soundcloud.com/",
        "Origin": "https://w.soundcloud.com",
        ...(licenseAuthToken ? { "X-License-Auth-Token": licenseAuthToken } : {}),
      },
      body: new Uint8Array(challengeBody),
    });

    if (!res.ok) {
      console.error("[license-proxy] SC license server returned", res.status, licenseAuthToken ? "(with auth token)" : "(NO auth token)");
      const errorBody = await res.text().catch(() => "");
      console.error("[license-proxy] Error body:", errorBody.substring(0, 200));
      return {
        ok: false,
        errorResponse: NextResponse.json(
          { error: `license server returned ${res.status}` },
          { status: res.status, headers: { "Access-Control-Allow-Origin": "*" } }
        ),
      };
    }

    const licenseBuffer = await res.arrayBuffer();
    console.log("[license-proxy] License acquired:", licenseBuffer.byteLength, "bytes, hasAuthToken:", !!licenseAuthToken, "scStatus:", res.status, "scContentType:", res.headers.get("content-type"));

    return { ok: true, licenseBuffer };
  } finally {
    clearTimeout(timeout);
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
    "Access-Control-Expose-Headers": "Content-Length",
    "Access-Control-Max-Age": "86400",
  };
}
