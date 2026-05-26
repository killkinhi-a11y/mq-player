import { NextRequest, NextResponse } from "next/server";

/**
 * Demo Audio Stream Proxy — with Range request support
 *
 * Proxies audio files from external sources (SoundHelix) with proper CORS headers.
 * Supports HTTP Range requests for seeking and progressive playback.
 *
 * Without this proxy, the browser blocks cross-origin audio when the <audio>
 * element has crossOrigin="anonymous" and the remote server doesn't send
 * Access-Control-Allow-Origin.
 *
 * Usage: /api/demo/stream?url=https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3
 */

const ALLOWED_HOSTS = [
  "www.soundhelix.com",
  "soundhelix.com",
];

// In-memory cache for demo audio files (small files, <10MB each)
// Avoids re-fetching from upstream on every request
interface CacheEntry {
  data: ArrayBuffer;
  contentType: string;
  cachedAt: number;
}
const audioCache = new Map<string, CacheEntry>();
const CACHE_TTL = 3600_000; // 1 hour

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Security: only allow whitelisted hosts
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    // Check cache first
    let cacheEntry = audioCache.get(url);
    if (cacheEntry && Date.now() - cacheEntry.cachedAt > CACHE_TTL) {
      audioCache.delete(url);
      cacheEntry = undefined;
    }

    let audioData: ArrayBuffer;
    let contentType: string;

    if (cacheEntry) {
      audioData = cacheEntry.data;
      contentType = cacheEntry.contentType;
    } else {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "MQ-Player-Demo-Proxy/1.0",
          "Accept": "audio/mpeg, audio/*, */*",
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Upstream error: ${response.status}` },
          { status: response.status }
        );
      }

      contentType = response.headers.get("content-type") || "audio/mpeg";
      audioData = await response.arrayBuffer();

      // Cache the file (only if <10MB to avoid memory issues)
      if (audioData.byteLength < 10 * 1024 * 1024) {
        audioCache.set(url, {
          data: audioData,
          contentType,
          cachedAt: Date.now(),
        });
        // Purge old entries if cache grows too large
        if (audioCache.size > 20) {
          const oldest = [...audioCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
          for (let i = 0; i < 5; i++) audioCache.delete(oldest[i][0]);
        }
      }
    }

    const totalSize = audioData.byteLength;

    // Parse Range header for seeking support
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const clampedEnd = Math.min(end, totalSize - 1);
        const contentLength = clampedEnd - start + 1;

        // Slice the buffer for the requested range
        const sliced = audioData.slice(start, clampedEnd + 1);

        return new NextResponse(sliced, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(contentLength),
            "Content-Range": `bytes ${start}-${clampedEnd}/${totalSize}`,
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
            "Cache-Control": "public, max-age=604800, immutable",
          },
        });
      }
    }

    // Full response (no Range header)
    return new NextResponse(audioData, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    console.error("[Demo Stream Proxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
      "Access-Control-Max-Age": "86400",
    },
  });
}
