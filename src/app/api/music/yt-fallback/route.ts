import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Track } from "@/lib/musicApi";

/**
 * GET /api/music/yt-fallback?artist=...&title=...
 *
 * YouTube Music fallback: when SoundCloud search returns no ALLOW-policy
 * (playable) track, this endpoint searches Invidious instances for a
 * matching video and returns a Track object with a direct stream URL
 * (resolved via Invidious adaptiveFormats).
 *
 * This is a last-resort source — not used as a primary recommendation
 * source, only as a fallback for chart hits that SNIP/MONETIZE on SC.
 */

// Public Invidious instances (tried in order — they're often rate-limited)
const INVIDIOUS_INSTANCES = [
  "https://invidious.fdn.fr",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
];

const cache = new Map<string, { data: Track | null; expiry: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function searchInvidious(query: string): Promise<{ videoId: string; title: string; author: string; thumbnail: string } | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json", "User-Agent": "MQPlayer/1.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const videos: any[] = Array.isArray(data) ? data : (data.videos || []);
      if (videos.length === 0) continue;

      // Pick first video that looks like a song (4 min or less, has music-ish title)
      const candidate = videos.find((v) => {
        const dur = v.lengthSeconds || 0;
        return dur > 30 && dur < 600; // 30s - 10min
      }) || videos[0];

      if (!candidate?.videoId) continue;
      return {
        videoId: candidate.videoId,
        title: candidate.title || "",
        author: candidate.author || "",
        thumbnail: (candidate.videoThumbnails || [])[0]?.url || "",
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveInvidiousStream(videoId: string, instance: string): Promise<{ streamUrl: string; duration: number } | null> {
  try {
    const url = `${instance}/api/v1/videos/${videoId}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", "User-Agent": "MQPlayer/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const formats: any[] = data.adaptiveFormats || data.formatStreams || [];
    if (formats.length === 0) return null;

    // Prefer audio-only formats (m4a/mp3), fallback to muxed mp4
    const audioFormat = formats.find((f) => f.type?.includes("audio")) || formats[0];
    if (!audioFormat?.url) return null;

    return {
      streamUrl: audioFormat.url,
      duration: data.lengthSeconds || 0,
    };
  } catch {
    return null;
  }
}

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist") || "";
  const title = searchParams.get("title") || "";

  if (!artist || !title) {
    return NextResponse.json({ track: null, error: "missing artist/title" }, { status: 400 });
  }

  const query = `${artist} ${title}`.trim();
  const cacheKey = `yt:${query}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ track: cached.data });
  }

  try {
    // 1) Search Invidious
    const searchResult = await searchInvidious(query);
    if (!searchResult) {
      cache.set(cacheKey, { data: null, expiry: Date.now() + CACHE_TTL });
      return NextResponse.json({ track: null, error: "not_found" });
    }

    // 2) Resolve stream URL — try each instance until one works
    let stream: { streamUrl: string; duration: number } | null = null;
    for (const instance of INVIDIOUS_INSTANCES) {
      stream = await resolveInvidiousStream(searchResult.videoId, instance);
      if (stream) break;
    }

    if (!stream) {
      cache.set(cacheKey, { data: null, expiry: Date.now() + CACHE_TTL });
      return NextResponse.json({ track: null, error: "no_stream" });
    }

    const track: Track = {
      id: `yt_${searchResult.videoId}`,
      title: searchResult.title || title,
      artist: searchResult.author || artist,
      album: "",
      cover: searchResult.thumbnail || "",
      duration: stream.duration,
      genre: "",
      audioUrl: stream.streamUrl,
      previewUrl: "",
      source: "soundcloud", // reuse SC playback pipeline (HLS/proxy not needed for direct URL)
      scStreamPolicy: "ALLOW",
      scIsFull: true,
    };

    cache.set(cacheKey, { data: track, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json({ track });
  } catch {
    return NextResponse.json({ track: null, error: "failed" });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
