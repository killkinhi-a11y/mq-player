import { NextRequest, NextResponse } from "next/server";

/**
 * Resolve SoundCloud stream URL for a track.
 *
 * Runs as an Edge Function — executes at the Vercel PoP closest to the user,
 * which may bypass CloudFront geo-blocks that affect us-east-1 datacenter IPs.
 *
 * SoundCloud migration (2025): most tracks no longer serve unencrypted progressive
 * or plain HLS. The new formats are:
 *   - ctr-encrypted-hls  → SAMPLE-AES-CTR with Widevine (HLS.js + EME)
 *   - cbc-encrypted-hls  → SAMPLE-AES with FairPlay (Safari)
 *
 * Strategy:
 * 1. Get track info from SC API
 * 2. Prefer progressive (old tracks) → resolve to CDN URL
 * 3. Fall back to ctr-encrypted-hls → resolve to manifest URL (EME required)
 * 4. Fall back to cbc-encrypted-hls → resolve to manifest URL (Safari only)
 * 5. Fall back to plain hls → resolve
 */

export const runtime = "edge";

const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa", // Fresh: extracted from SC website
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
];

// SoundCloud PlayReady/Widevine license server URL (public, no auth needed)
const SC_LICENSE_URL = "https://license.media-streaming.soundcloud.cloud/playback/playready";

interface Transcoding {
  url?: string;
  format?: { protocol?: string; mime_type?: string };
  quality?: string;
}

interface TrackInfo {
  streamUrl: string;
  protocol: string; // "progressive" | "hls" | "cbc-encrypted-hls" | "ctr-encrypted-hls"
  isHls: boolean;
  isEncrypted: boolean;
  isPreview: boolean;
  duration: number;
  fullDuration: number;
  trackAuthorization: string; // JWT required by SC to resolve stream URLs
}

/**
 * Get track info and pick the best transcoding.
 * Priority: progressive > ctr-encrypted-hls > cbc-encrypted-hls > hls
 */
function pickTranscoding(transcodings: Transcoding[]): { url: string; protocol: string; isHls: boolean; isEncrypted: boolean } | null {
  // 1. Progressive (unencrypted MP3) — best for old tracks
  for (const t of transcodings) {
    if (t.format?.protocol === "progressive" && t.url) {
      return { url: t.url, protocol: "progressive", isHls: false, isEncrypted: false };
    }
  }
  // 2. CTR encrypted HLS — works in Chrome/Firefox/Edge via HLS.js + EME (Widevine)
  for (const t of transcodings) {
    if (t.format?.protocol === "ctr-encrypted-hls" && t.url) {
      return { url: t.url, protocol: "ctr-encrypted-hls", isHls: true, isEncrypted: true };
    }
  }
  // 3. CBC encrypted HLS — works in Safari (FairPlay)
  for (const t of transcodings) {
    if (t.format?.protocol === "cbc-encrypted-hls" && t.url) {
      return { url: t.url, protocol: "cbc-encrypted-hls", isHls: true, isEncrypted: true };
    }
  }
  // 4. Plain HLS (unencrypted) — may still work for some tracks
  for (const t of transcodings) {
    if (t.format?.protocol === "hls" && t.url) {
      return { url: t.url, protocol: "hls", isHls: true, isEncrypted: false };
    }
  }
  return null;
}

async function getTrackInfo(trackId: string, clientId: string): Promise<TrackInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`,
      { signal: controller.signal }
    );
    if (!trackRes.ok) return null;
    const track = await trackRes.json();

    const transcodings: Transcoding[] = (track.media?.transcodings || []).filter(Boolean);
    const picked = pickTranscoding(transcodings);
    if (!picked) return null;

    return {
      streamUrl: picked.url,
      protocol: picked.protocol,
      isHls: picked.isHls,
      isEncrypted: picked.isEncrypted,
      isPreview: track.policy === "SNIP",
      duration: Math.round((track.duration || 0) / 1000),
      fullDuration: Math.round((track.full_duration || 0) / 1000),
      trackAuthorization: (track as Record<string, unknown>).track_authorization as string || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Server-side resolve: fetch the template URL to get the actual URL.
 * Tries all client IDs since some may be rate-limited.
 * Includes track_authorization JWT which SC now requires for media resolution.
 */
async function resolveUrl(templateUrl: string, trackAuthorization: string): Promise<string | null> {
  for (const clientId of CLIENT_IDS) {
    try {
      const separator = templateUrl.includes("?") ? "&" : "?";
      let resolveUrl = `${templateUrl}${separator}client_id=${clientId}`;
      if (trackAuthorization) {
        resolveUrl += `&track_authorization=${encodeURIComponent(trackAuthorization)}`;
      }

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
      if (!info) continue;

      // Try to resolve the template URL to a real URL (with track_authorization JWT)
      const resolvedUrl = await resolveUrl(info.streamUrl, info.trackAuthorization);

      if (resolvedUrl) {
        // Successfully resolved — return the URL with format metadata
        return NextResponse.json({
          url: resolvedUrl,
          isHls: info.isHls,
          isEncrypted: info.isEncrypted,
          protocol: info.protocol,
          isPreview: info.isPreview,
          duration: info.duration,
          fullDuration: info.fullDuration,
          // For encrypted tracks, include the license server URL
          ...(info.isEncrypted ? { licenseUrl: SC_LICENSE_URL } : {}),
        });
      }

      // Resolve failed — include track_authorization in fallback URL for client-side retry
      const separator = info.streamUrl.includes("?") ? "&" : "?";
      let fallbackUrl = `${info.streamUrl}${separator}client_id=${clientId}`;
      if (info.trackAuthorization) {
        fallbackUrl += `&track_authorization=${encodeURIComponent(info.trackAuthorization)}`;
      }

      return NextResponse.json({
        url: null,
        resolveUrl: fallbackUrl,
        isHls: info.isHls,
        isEncrypted: info.isEncrypted,
        protocol: info.protocol,
        isPreview: info.isPreview,
        duration: info.duration,
        fullDuration: info.fullDuration,
        ...(info.isEncrypted ? { licenseUrl: SC_LICENSE_URL } : {}),
        error: "cdn_resolve_failed",
      });
    } catch {}
  }

  return NextResponse.json({ url: null, resolveUrl: null, error: "resolve_failed" });
}
