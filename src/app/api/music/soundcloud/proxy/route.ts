import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Server-side audio stream proxy.
 *
 * Bypasses client-side blocks of SoundCloud CDN (cf-media.sndcdn.com)
 * by relaying audio bytes through the app's own server.
 *
 * Supports Range requests for seeking (HTML5 audio sends Range headers).
 * Streams data in chunks to avoid loading the entire file into memory.
 */

const CHUNK_SIZE = 512 * 1024; // 512KB chunks
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max

// Cache Content-Length for tracks to avoid HEAD requests
const lengthCache = new Map<string, { length: number; contentType: string; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const audioUrl = searchParams.get("url");

  if (!audioUrl) {
    return NextResponse.json({ error: "missing url parameter" }, { status: 400 });
  }

  // Only allow SoundCloud-related URLs for security.
  // SC uses multiple CDN domains: cf-media.sndcdn.com, cf-preview-media.sndcdn.com,
  // api-media.sndcdn.com, soundcloud.com, media-streaming.soundcloud.cloud, etc.
  try {
    const parsed = new URL(audioUrl);
    const h = parsed.hostname;
    const isSCDomain =
      h.endsWith("sndcdn.com") ||
      h.endsWith("soundcloud.com") ||
      h.endsWith("soundcloud.cloud") ||
      h === "soundcloud.com" ||
      h === "api.soundcloud.com" ||
      h === "api-v2.soundcloud.com";
    if (!isSCDomain) {
      return NextResponse.json({ error: "only SoundCloud CDN URLs are allowed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const rangeHeader = request.headers.get("range");
  const cacheKey = audioUrl.split("?")[0]; // ignore query params for caching

  try {
    // Get file info (use cache if available)
    let contentLength: number | null = null;
    let contentType = "audio/mpeg";

    const cached = lengthCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      contentLength = cached.length;
      contentType = cached.contentType;
    }

    if (!contentLength || !rangeHeader) {
      // If no Range header, just do a HEAD request to get info (or proxy the whole file)
      try {
        const headRes = await fetch(audioUrl, {
          method: rangeHeader ? undefined : "HEAD",
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          },
        });

        if (headRes.ok) {
          const cl = headRes.headers.get("content-length");
          if (cl) contentLength = parseInt(cl, 10);
          const ct = headRes.headers.get("content-type");
          if (ct) contentType = ct;

          // Cache for 3 minutes
          if (contentLength) {
            lengthCache.set(cacheKey, {
              length: contentLength,
              contentType: contentType,
              expiry: Date.now() + 3 * 60 * 1000,
            });
          }
        }
      } catch {
        // If HEAD fails, we'll get the info from the actual GET request
      }
    }

    // Parse Range header
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : (contentLength ? Math.min(start + CHUNK_SIZE * 2 - 1, contentLength - 1) : start + CHUNK_SIZE * 2 - 1);

        if (contentLength && start >= contentLength) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${contentLength}` },
          });
        }

        const effectiveEnd = contentLength ? Math.min(end, contentLength - 1) : end;

        // Fetch the requested range from SoundCloud CDN
        const scResponse = await fetch(audioUrl, {
          headers: {
            Range: `bytes=${start}-${effectiveEnd}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });

        if (!scResponse.ok && scResponse.status !== 206) {
          return NextResponse.json({ error: "upstream_error" }, { status: 502 });
        }

        const upstreamLength = scResponse.headers.get("content-length");
        const actualLength = upstreamLength ? parseInt(upstreamLength, 10) : (effectiveEnd - start + 1);
        const totalLength = contentLength || actualLength;
        const upstreamCT = scResponse.headers.get("content-type");
        if (upstreamCT) contentType = upstreamCT;

        // Update cache
        if (!contentLength || totalLength > contentLength) {
          lengthCache.set(cacheKey, {
            length: totalLength,
            contentType: contentType,
            expiry: Date.now() + 3 * 60 * 1000,
          });
        }

        // Stream the response body through
        const body = scResponse.body;

        return new NextResponse(body, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": actualLength.toString(),
            "Content-Range": `bytes ${start}-${start + actualLength - 1}/${totalLength}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // No Range header — stream the entire file
    const scResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(60000),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
    });

    if (!scResponse.ok) {
      return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    }

    const upstreamCT = scResponse.headers.get("content-type");
    if (upstreamCT) contentType = upstreamCT;
    const upstreamCL = scResponse.headers.get("content-length");
    const totalLength = upstreamCL ? parseInt(upstreamCL, 10) : null;

    // Update cache
    if (totalLength) {
      lengthCache.set(cacheKey, {
        length: totalLength,
        contentType: contentType,
        expiry: Date.now() + 3 * 60 * 1000,
      });
    }

    // Safety check: don't try to proxy files larger than MAX_FILE_SIZE
    if (totalLength && totalLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Range",
    };
    if (totalLength) {
      responseHeaders["Content-Length"] = totalLength.toString();
    }

    return new NextResponse(scResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[SC Proxy] Error:", err);
    return NextResponse.json({ error: "proxy_failed" }, { status: 500 });
  }
}

// Handle CORS preflight for Range requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
