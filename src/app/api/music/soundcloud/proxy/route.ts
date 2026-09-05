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

// (CHUNK_SIZE removed: it only fed the 1 MB open-ended-range cap — see the
// Range handling below for the history of that bug. Bodies stream through,
// so there is no memory reason to cap range size.)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max

// SoundCloud CDN headers — CloudFront-signed URLs may require Referer/Origin
const SC_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Referer": "https://w.soundcloud.com/",
  "Origin": "https://w.soundcloud.com",
};

// Cache Content-Length for tracks to avoid HEAD requests
const lengthCache = new Map<string, { length: number; contentType: string; expiry: number }>();

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const audioUrl = searchParams.get("url");

  if (!audioUrl) {
    return NextResponse.json({ error: "missing url parameter" }, { status: 400 });
  }

  // Only allow SoundCloud-related URLs for security (strict allowlist).
  // Uses exact domain matching to prevent subdomain bypass attacks.
  const SC_ALLOWED_DOMAINS = [
    "cf-media.sndcdn.com",
    "cf-preview-media.sndcdn.com",
    "api-media.sndcdn.com",
    "i1.sndcdn.com",
    "i2.sndcdn.com",
    "i3.sndcdn.com",
    "i4.sndcdn.com",
    "sndcdn.com",
    "soundcloud.com",
    "api.soundcloud.com",
    "api-v2.soundcloud.com",
    "license.media-streaming.soundcloud.cloud",
    "media-streaming.soundcloud.cloud",
    "api.cobalt.tools",
    "cobalt.tools",
  ];
  try {
    const parsed = new URL(audioUrl);
    const h = parsed.hostname;
    const isSCDomain = SC_ALLOWED_DOMAINS.some(d => h === d || h.endsWith("." + d));
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
          headers: SC_FETCH_HEADERS,
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
        // Open-ended ranges (bytes=N-) MUST stream the full remainder.
        //
        // HISTORY (audio bug, 2026-09): this used to cap open-ended ranges at
        // CHUNK_SIZE*2 (1 MB). The WASM decode worker makes exactly ONE
        // open-ended fetch per load/seek — it received 1 MB, then EOF, and
        // the track ENDED PREMATURELY ~65 s after every seek on long tracks
        // (verified in-browser: Get Lucky 246 s cut at ~90 s). The body is
        // STREAMED through the server, so an unbounded range is memory-safe.
        // Bounded ranges (browser media stack) keep the explicit end.
        const requestedEnd = rangeMatch[2]
          ? parseInt(rangeMatch[2], 10)
          : (contentLength ? contentLength - 1 : Infinity);

        if (contentLength && start >= contentLength) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${contentLength}` },
          });
        }

        const effectiveEnd =
          contentLength && isFinite(requestedEnd)
            ? Math.min(requestedEnd, contentLength - 1)
            : requestedEnd;

        // Fetch the requested range from SoundCloud CDN.
        // For open-ended ranges we forward the open-ended request upstream —
        // the CDN streams the remainder (proper 206 + Content-Range back).
        const rangeValue = isFinite(effectiveEnd)
          ? `bytes=${start}-${effectiveEnd}`
          : `bytes=${start}-`;
        const scResponse = await fetch(audioUrl, {
          headers: {
            Range: rangeValue,
            ...SC_FETCH_HEADERS,
          },
          signal: AbortSignal.timeout(60000),
          redirect: "follow",
        });

        if (!scResponse.ok && scResponse.status !== 206) {
          return NextResponse.json({ error: "upstream_error" }, { status: 502 });
        }

        const upstreamLength = scResponse.headers.get("content-length");
        const actualLength = upstreamLength ? parseInt(upstreamLength, 10) : null;
        // True total from Content-Range (authoritative for 206 responses).
        const crHeader = scResponse.headers.get("content-range");
        const crTotalMatch = crHeader?.match(/\/(\d+)\s*$/);
        const crTotal = crTotalMatch ? parseInt(crTotalMatch[1], 10) : null;
        const crRangeMatch = crHeader?.match(/^bytes\s+(\d+)-(\d+)\s*\//);
        const totalLength = crTotal || contentLength || (actualLength ? start + actualLength : 0);
        const rangeEnd = crRangeMatch
          ? parseInt(crRangeMatch[2], 10)
          : actualLength !== null
            ? start + actualLength - 1
            : effectiveEnd;
        const upstreamCT = scResponse.headers.get("content-type");
        if (upstreamCT) contentType = upstreamCT;

        // Update cache
        if (totalLength) {
          lengthCache.set(cacheKey, {
            length: totalLength,
            contentType,
            expiry: Date.now() + 3 * 60 * 1000,
          });
        }

        // Stream the response body through with an accurate Content-Range
        // so clients can detect truncation and issue follow-up requests.
        const outHeaders: Record<string, string> = {
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=300",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
          "Content-Range": `bytes ${start}-${rangeEnd}/${totalLength}`,
        };
        if (actualLength !== null) {
          outHeaders["Content-Length"] = actualLength.toString();
        }
        return new NextResponse(scResponse.body, {
          status: 206,
          headers: outHeaders,
        });
      }
    }

    // No Range header — stream the entire file
    const scResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(60000),
      redirect: "follow",
      headers: SC_FETCH_HEADERS,
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
