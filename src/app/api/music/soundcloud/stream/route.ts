import { NextRequest, NextResponse } from "next/server";

/**
 * Resolve SoundCloud stream URL for a track.
 *
 * Runs as an Edge Function — executes at the Vercel PoP closest to the user,
 * which may bypass CloudFront geo-blocks that affect us-east-1 datacenter IPs.
 *
 * Strategy:
 * 1. Get track info + template URL from SC API (works from any IP)
 * 2. Try to resolve template URL → CDN URL from Edge PoP
 * 3. If Edge resolve also fails, return the template URL for client-side fallback
 *
 * The client tries: CDN URL → CORS proxy → direct fetch → error
 */

export const runtime = "edge";

const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa", // Fresh: extracted from SC website
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];

async function getTrackInfo(trackId: string, clientId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      { signal: controller.signal }
    );
    if (!trackRes.ok) return null;
    const track = await trackRes.json();

    const transcodings: { url?: string; format?: { protocol?: string } }[] =
      (track.media?.transcodings || []).filter(Boolean);

    let streamUrl: string | null = null;
    let isHls = false;

    // Prefer non-encrypted progressive
    for (const t of transcodings) {
      if (t.format?.protocol === "progressive" && t.url) {
        streamUrl = t.url;
        break;
      }
    }
    // Then non-encrypted HLS
    if (!streamUrl) {
      for (const t of transcodings) {
        if (t.format?.protocol === "hls" && t.url) {
          streamUrl = t.url;
          isHls = true;
          break;
        }
      }
    }
    // Then any available
    if (!streamUrl && transcodings.length > 0) {
      const t = transcodings[0];
      if (t.url) {
        streamUrl = t.url;
        isHls = !!(t.format?.protocol === "hls" || t.format?.protocol?.includes("hls"));
      }
    }

    if (!streamUrl) return null;

    return {
      streamUrl,
      isHls,
      isPreview: track.policy === "SNIP",
      duration: Math.round((track.duration || 0) / 1000),
      fullDuration: Math.round((track.full_duration || 0) / 1000),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Server-side resolve: fetch the template URL to get the actual CDN URL.
 * Tries all client IDs since some may be rate-limited.
 */
async function resolveCdnUrl(templateUrl: string): Promise<string | null> {
  for (const clientId of CLIENT_IDS) {
    try {
      const separator = templateUrl.includes("?") ? "&" : "?";
      const resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;

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
          if (data.url) return data.url;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {}
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json({ url: null, resolveUrl: null, error: "missing trackId" });
  }

  // Try each client ID until one returns track info
  for (const clientId of CLIENT_IDS) {
    try {
      const info = await getTrackInfo(trackId, clientId);
      if (info) {
        // Try server-side resolve from Edge PoP (may bypass CloudFront blocks)
        const cdnUrl = await resolveCdnUrl(info.streamUrl);

        if (cdnUrl) {
          // Server resolved successfully — return CDN URL directly
          return NextResponse.json({
            url: cdnUrl,
            isHls: info.isHls,
            isPreview: info.isPreview,
            duration: info.duration,
            fullDuration: info.fullDuration,
          });
        }

        // Edge resolve failed — return template URL for client-side fallback
        // Client will try: our CORS proxy → direct fetch → error
        const separator = info.streamUrl.includes("?") ? "&" : "?";
        const resolveUrl = `${info.streamUrl}${separator}client_id=${clientId}`;

        return NextResponse.json({
          url: null,
          resolveUrl,
          isHls: info.isHls,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
          error: "cdn_resolve_failed",
        });
      }
    } catch {}
  }

  return NextResponse.json({ url: null, resolveUrl: null, error: "resolve_failed" });
}
