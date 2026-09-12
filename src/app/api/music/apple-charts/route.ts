import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { fetchAppleTop } from "./fetcher";

/**
 * GET /api/music/apple-charts?country=RU
 *
 * Fetches Apple Music Top 100 chart for the user's country via the public
 * RSS feed (no API key needed), then searches each track on SoundCloud
 * to get a playable audio URL.
 */

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  let country = (searchParams.get("country") || "RU").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) country = "RU";
  try {
    const tracks = await fetchAppleTop(country);
    return NextResponse.json({ tracks, country, source: "apple-music-rss" });
  } catch {
    return NextResponse.json({ tracks: [], country, source: "apple-music-rss", error: "Failed" });
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, handler);
