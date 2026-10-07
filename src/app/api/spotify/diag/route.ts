import { NextResponse } from "next/server";
import { getSpotifyToken, isSpotifyConfigured } from "@/lib/spotify/catalog";

/**
 * GET /api/spotify/diag — Spotify catalog connectivity probe.
 *
 * Reports ONLY HTTP status codes per endpoint (token / search / artist /
 * album / playlist). NEVER returns credentials, tokens, or secrets.
 * Purpose: distinguish "Spotify app API access restricted" (403 on
 * endpoints) from transient failures — the UI degrades honestly either way.
 */

export const dynamic = "force-dynamic";

async function probe(url: string, token: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    return res.status === 200 ? "ok" : `http-${res.status}`;
  } catch (e) {
    return e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
  }
}

async function handler() {
  if (!isSpotifyConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json({ configured: true, token: "failed" });
  }

  // Known-good public ids (Travis Scott — artist, ASTROWORLD — album,
  // Today's Top Hits — playlist): real requests, status-only results.
  const [search, artist, album, playlist, topTracks, related] = await Promise.all([
    probe("https://api.spotify.com/v1/search?q=travis&type=track&limit=1", token),
    probe("https://api.spotify.com/v1/artists/0Y5tJS1cIPuFqR7EEWRZ0X", token),
    probe("https://api.spotify.com/v1/albums/41GuZcammXRupP9yzzZJmA", token),
    probe("https://api.spotify.com/v1/playlists/37i9dQZEVXbMDoHDwVN2tF?fields=name", token),
    probe("https://api.spotify.com/v1/artists/0Y5tJS1cIPuFqR7EEWRZ0X/top-tracks?market=US", token),
    probe("https://api.spotify.com/v1/artists/0Y5tJS1cIPuFqR7EEWRZ0X/related-artists", token),
  ]);

  return NextResponse.json({
    configured: true,
    token: "ok",
    endpoints: { search, artist, album, playlist, topTracks, related },
  });
}

export const GET = handler;
