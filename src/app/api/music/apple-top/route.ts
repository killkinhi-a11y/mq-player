import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Track } from "@/lib/musicApi";

/**
 * GET /api/music/apple-top?country=RU
 *
 * Fetches Apple Music Top 100 chart for the user's country.
 * Uses Apple's public RSS feed (no API key needed):
 * https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/50/songs.json
 *
 * Then searches each track on SoundCloud to get playable audio.
 */

const cache = new Map<string, { data: Track[]; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let country = (searchParams.get("country") || "RU").toUpperCase();

  if (!/^[A-Z]{2}$/.test(country)) country = "RU";

  const cacheKey = `apple-top:${country}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ tracks: cached.data, country, source: "apple-music-rss" });
  }

  try {
    const rssUrl = `https://rss.applemarketingtools.com/api/v2/${country.toLowerCase()}/music/most-played/50/songs.json`;
    const rssRes = await fetch(rssUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "MQPlayer/1.0" },
    });

    if (!rssRes.ok) {
      throw new Error(`Apple RSS failed: ${rssRes.status}`);
    }

    const rssData = await rssRes.json();
    const songs: any[] = rssData?.feed?.results || [];

    if (songs.length === 0) {
      return NextResponse.json({ tracks: [], country, source: "apple-music-rss" });
    }

    const tracks: Track[] = [];
    const batchSize = 5;

    for (let i = 0; i < Math.min(songs.length, 50); i += batchSize) {
      const batch = songs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (song) => {
          const artist = song.artistName || "";
          const title = song.name || "";
          const query = `${artist} ${title}`.trim();
          if (!query) return null;

          const scResults = await searchSCTracks(query, 1);
          if (scResults && scResults.length > 0) {
            const t = scResults[0];
            return {
              id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `apple_${i}_${Date.now()}`),
              title: t.title || title,
              artist: t.artist || artist,
              album: t.album || song.collectionName || "",
              cover: t.cover || song.artworkUrl100?.replace("100x100", "400x400") || "",
              duration: t.duration || 0,
              genre: t.genre || song.genres?.[0]?.name || "",
              audioUrl: t.audioUrl || "",
              previewUrl: t.previewUrl || "",
              source: "soundcloud" as const,
              scTrackId: t.scTrackId || null,
              scStreamPolicy: t.scStreamPolicy || "",
              scIsFull: t.scIsFull || false,
            } as Track;
          }
          return null;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          tracks.push(r.value);
        }
      }

      if (tracks.length >= 50) break;
    }

    cache.set(cacheKey, { data: tracks, expiry: Date.now() + CACHE_TTL });

    return NextResponse.json({ tracks, country, source: "apple-music-rss" });
  } catch {
    return NextResponse.json({ tracks: [], country, source: "apple-music-rss", error: "Failed" });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
