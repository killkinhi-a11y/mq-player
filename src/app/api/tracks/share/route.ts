import { NextRequest, NextResponse } from "next/server";
import { getSoundCloudClientId, invalidateClientId } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Share Track API — returns public track info for a shareable page.
 * Uses in-memory cache with 5-minute TTL.
 */

interface CachedShareTrack {
  data: {
    title: string;
    artist: string;
    cover: string;
    duration: number;
    genre: string;
    streamUrl: string | null;
    previewUrl: string;
    scTrackId: number;
    description: string;
  };
  expiry: number;
}

const shareCache = new Map<string, CachedShareTrack>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scTrackId = searchParams.get("scTrackId");
  const trackId = searchParams.get("trackId");

  // Support both trackId (internal) and scTrackId (SoundCloud) lookups
  // For now we focus on scTrackId
  const resolvedId = scTrackId || trackId;
  if (!resolvedId) {
    return NextResponse.json({ error: "missing scTrackId or trackId" }, { status: 400 });
  }

  // Check cache
  const cacheKey = `sc_${resolvedId}`;
  const cached = shareCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) {
      return NextResponse.json({ error: "no_client_id" }, { status: 503 });
    }

    // Fetch track info from SoundCloud API
    const trackRes = await fetch(
      `https://api-v2.soundcloud.com/tracks/${resolvedId}?client_id=${clientId}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (trackRes.status === 401) {
      invalidateClientId();
      return NextResponse.json({ error: "invalid_client_id" }, { status: 503 });
    }
    if (!trackRes.ok) {
      return NextResponse.json({ error: "track_not_found" }, { status: 404 });
    }

    const track = await trackRes.json();
    const user = track.user || {};

    // Build cover URL through our image proxy
    const rawArtwork = track.artwork_url
      ? track.artwork_url.replace("-large.", "-t500x500.")
      : user.avatar_url
        ? (user.avatar_url as string).replace("-large.", "-t500x500.")
        : "";
    const cover = rawArtwork
      ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawArtwork)}`
      : "";

    const title = track.title || "Unknown Track";
    const artist = user.username || "Unknown Artist";
    const genre = track.genre || "";
    const description = track.description || "";
    const duration = Math.round((track.full_duration || track.duration || 0) / 1000);

    // Resolve stream URL via our internal stream endpoint
    let streamUrl: string | null = null;
    let previewUrl = "";
    try {
      const baseUrl = request.nextUrl.origin;
      const streamRes = await fetch(
        `${baseUrl}/api/music/soundcloud/stream?trackId=${resolvedId}`,
        { signal: AbortSignal.timeout(12000) }
      );
      if (streamRes.ok) {
        const streamData = await streamRes.json();
        if (streamData.url) streamUrl = streamData.url;
        if (streamData.isPreview) {
          previewUrl = streamData.url || "";
        }
      }
    } catch {
      // Stream resolution is best-effort
    }

    const data = {
      title,
      artist,
      cover,
      duration,
      genre,
      streamUrl,
      previewUrl,
      scTrackId: track.id,
      description,
    };

    // Cache the result
    shareCache.set(cacheKey, {
      data,
      expiry: Date.now() + CACHE_TTL,
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
