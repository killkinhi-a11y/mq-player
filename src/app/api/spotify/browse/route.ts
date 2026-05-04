import { NextRequest, NextResponse } from "next/server";
import { getSpotifyNewReleases, getSpotifyFeaturedPlaylists } from "@/lib/spotify";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const limit = parseInt(searchParams.get("limit") || "12", 10);

  try {
    if (type === "new-releases" || type === "all") {
      const [newReleases, featured] = await Promise.all([
        getSpotifyNewReleases(limit),
        type === "all" ? getSpotifyFeaturedPlaylists(limit) : Promise.resolve([]),
      ]);

      return NextResponse.json({
        newReleases,
        featuredPlaylists: featured,
      });
    }

    if (type === "featured-playlists") {
      const featured = await getSpotifyFeaturedPlaylists(limit);
      return NextResponse.json({ featuredPlaylists: featured });
    }

    return NextResponse.json({ newReleases: [], featuredPlaylists: [] });
  } catch {
    return NextResponse.json({ newReleases: [], featuredPlaylists: [] }, { status: 200 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.search, handler);
