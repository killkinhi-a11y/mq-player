import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Server-side image proxy for SoundCloud artwork.
 *
 * Proxies images from SoundCloud CDN (i1.sndcdn.com, etc.)
 * to bypass client-side blocks.
 *
 * Caches responses to reduce upstream requests.
 */

const imageCache = new Map<string, { data: ArrayBuffer; contentType: string; expiry: number }>();
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB total cache
let currentCacheSize = 0;

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "missing url parameter" }, { status: 400 });
  }

  // Only allow SoundCloud CDN URLs
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.hostname.endsWith("sndcdn.com")) {
      return NextResponse.json({ error: "only SoundCloud CDN URLs are allowed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const cacheKey = imageUrl.split("?")[0]; // ignore query params

  // Check cache
  const cached = imageCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return new NextResponse(cached.data, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400", // cache images for 24h
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    // Don't cache files larger than 5MB
    if (arrayBuffer.byteLength <= 5 * 1024 * 1024) {
      // Evict old entries if cache is too large
      if (currentCacheSize + arrayBuffer.byteLength > MAX_CACHE_SIZE) {
        for (const [key, val] of imageCache.entries()) {
          currentCacheSize -= val.data.byteLength;
          imageCache.delete(key);
          if (currentCacheSize + arrayBuffer.byteLength <= MAX_CACHE_SIZE * 0.8) break;
        }
      }

      imageCache.set(cacheKey, {
        data: arrayBuffer,
        contentType,
        expiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });
      currentCacheSize += arrayBuffer.byteLength;
    }

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[Image Proxy] Error:", err);
    return NextResponse.json({ error: "proxy_failed" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
