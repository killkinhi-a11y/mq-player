import { NextRequest, NextResponse } from "next/server";

/**
 * CORS proxy for SoundCloud API template URL resolution.
 *
 * The browser can't call api-v2.soundcloud.com directly (no CORS headers
 * for non-soundcloud.com origins). This proxy forwards the request
 * and returns the response with proper CORS headers.
 *
 * Used as a fallback when the Edge stream route can't resolve the CDN URL.
 */

export const runtime = "edge";

const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa",
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "missing url parameter" }, {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  // Security: only allow SoundCloud API URLs
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("soundcloud.com")) {
      return NextResponse.json({ error: "only SoundCloud URLs are allowed" }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  // Try to resolve using each client ID
  for (const clientId of CLIENT_IDS) {
    try {
      const separator = url.includes("?") ? "&" : "?";
      const resolveUrl = `${url}${separator}client_id=${clientId}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(resolveUrl, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            return NextResponse.json({ url: data.url }, {
              headers: corsHeaders(request),
            });
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {}
  }

  return NextResponse.json({ url: null, error: "resolve_failed" }, {
    headers: corsHeaders(request),
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
