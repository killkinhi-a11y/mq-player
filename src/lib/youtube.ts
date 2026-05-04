/**
 * YouTube Music Search & Stream via Piped API
 *
 * Provides a fallback for full-track playback when Spotify Premium is unavailable.
 * Uses Piped (public YouTube frontend) API — no API key required.
 *
 * Flow:
 *   1. Search YouTube Music for "{track title} {artist}"
 *   2. Get the audio stream URL from Piped
 *   3. Proxy the stream through our API (to avoid CORS / regional blocks)
 */

// Multiple Piped instances for fallback
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.r4fo.com",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
];

/* ─── Simple cache ─── */
const ytCache = new Map<string, { data: unknown; expiry: number }>();
const YT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached<T>(key: string): T | null {
  const entry = ytCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  ytCache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  ytCache.set(key, { data, expiry: Date.now() + YT_CACHE_TTL });
}

/* ─── Interfaces ─── */
export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnail: string;
  url: string;
}

export interface YouTubeStreamInfo {
  url: string;        // Direct audio stream URL
  duration: number;   // seconds
  bitrate: number;    // kbps
  mimeType: string;
  audioOnly: boolean;
}

/* ─── Helper: fetch with fallback instances ─── */
async function fetchWithFallback<T>(
  instances: string[],
  buildUrl: (instance: string) => string,
  parse: (data: unknown) => T | null,
  timeoutMs = 10000
): Promise<T | null> {
  for (const instance of instances) {
    try {
      const url = buildUrl(instance);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = parse(data);
      if (result) return result;
    } catch (err) {
      console.warn(`[YouTube] Instance ${instance} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  return null;
}

/**
 * Search YouTube Music for a track.
 * Returns the best matching result (first result, filtered to music).
 */
export async function searchYouTubeMusic(
  trackTitle: string,
  artistName: string,
  maxResults = 3
): Promise<YouTubeSearchResult[]> {
  const query = `${trackTitle} ${artistName}`.trim();
  const cacheKey = `yt-search:${query.toLowerCase()}`;
  const cached = getCached<YouTubeSearchResult[]>(cacheKey);
  if (cached) return cached;

  const results: YouTubeSearchResult[] = [];

  // Try Piped API first
  const pipedResults = await fetchWithFallback(
    PIPED_INSTANCES,
    (inst) => `${inst}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
    (data: unknown) => {
      const items = (data as { items?: Array<Record<string, unknown>> })?.items || [];
      const parsed: YouTubeSearchResult[] = [];
      for (const item of items.slice(0, maxResults)) {
        const url = (item.url as string) || "";
        const videoId = url.replace("/watch?v=", "");
        if (!videoId || videoId.length < 5) continue;
        parsed.push({
          videoId,
          title: (item.title as string) || "",
          artist: (item.uploaderName as string) || "",
          duration: (item.duration as number) || 0,
          thumbnail: (item.thumbnail as string) || "",
          url: `https://youtube.com/watch?v=${videoId}`,
        });
      }
      return parsed.length > 0 ? parsed : null;
    },
    12000
  );

  if (pipedResults) {
    results.push(...pipedResults);
  }

  // Fallback: Invidious API
  if (results.length === 0) {
    const invidiousResults = await fetchWithFallback(
      INVIDIOUS_INSTANCES,
      (inst) => `${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`,
      (data: unknown) => {
        const items = data as Array<Record<string, unknown>> || [];
        const parsed: YouTubeSearchResult[] = [];
        for (const item of items.slice(0, maxResults)) {
          const videoId = item.videoId as string;
          if (!videoId) continue;
          const lengthSeconds = item.lengthSeconds as number;
          // Filter: prefer videos under 15 minutes (likely music, not podcasts)
          if (lengthSeconds && lengthSeconds > 900) continue;
          parsed.push({
            videoId,
            title: (item.title as string) || "",
            artist: (item.author as string) || "",
            duration: lengthSeconds || 0,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            url: `https://youtube.com/watch?v=${videoId}`,
          });
        }
        return parsed.length > 0 ? parsed : null;
      },
      12000
    );

    if (invidiousResults) {
      results.push(...invidiousResults);
    }
  }

  if (results.length > 0) {
    setCache(cacheKey, results);
  }
  return results;
}

/**
 * Get the best audio stream URL for a YouTube video via Piped API.
 * Returns a proxied URL that can be played directly in <audio>.
 */
export async function getYouTubeStream(videoId: string): Promise<YouTubeStreamInfo | null> {
  const cacheKey = `yt-stream:${videoId}`;
  const cached = getCached<YouTubeStreamInfo>(cacheKey);
  if (cached) return cached;

  const stream = await fetchWithFallback(
    PIPED_INSTANCES,
    (inst) => `${inst}/streams/${videoId}`,
    (data: unknown) => {
      const d = data as {
        audioStreams?: Array<{
          url: string;
          bitrate: number;
          mimeType: string;
          quality: string;
          contentLength?: number;
        }>;
        duration?: number;
        title?: string;
      };

      if (!d) return null;

      // Find the best audio stream (prefer high bitrate, mp4/m4a, no video)
      const audioStreams = (d.audioStreams || [])
        .filter(s => {
          const mime = (s.mimeType || "").toLowerCase();
          // Prefer opus or mp4 audio, skip video streams
          return (mime.includes("audio/mp4") || mime.includes("audio/webm") || mime.includes("audio/opus")) &&
                 !mime.includes("video");
        })
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioStreams.length === 0) {
        // Fallback: any audio stream
        const anyAudio = (d.audioStreams || [])
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (anyAudio.length === 0) return null;
        const best = anyAudio[0];
        const result: YouTubeStreamInfo = {
          url: best.url,
          duration: d.duration || 0,
          bitrate: best.bitrate || 128,
          mimeType: best.mimeType || "audio/mp4",
          audioOnly: true,
        };
        setCache(cacheKey, result);
        return result;
      }

      const best = audioStreams[0];
      const result: YouTubeStreamInfo = {
        url: best.url,
        duration: d.duration || 0,
        bitrate: best.bitrate || 128,
        mimeType: best.mimeType || "audio/mp4",
        audioOnly: true,
      };
      setCache(cacheKey, result);
      return result;
    },
    12000
  );

  return stream;
}

/**
 * Search YouTube and get the best audio stream for the first result.
 * Combined helper for quick "play this track from YouTube" operations.
 */
export async function resolveYouTubeAudio(
  trackTitle: string,
  artistName: string
): Promise<{ streamUrl: string; duration: number; videoId: string } | null> {
  const results = await searchYouTubeMusic(trackTitle, artistName, 1);
  if (results.length === 0) return null;

  const best = results[0];
  const stream = await getYouTubeStream(best.videoId);
  if (!stream) return null;

  return {
    streamUrl: stream.url,
    duration: best.duration || stream.duration,
    videoId: best.videoId,
  };
}
