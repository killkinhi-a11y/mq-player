/**
 * Audius Music API — free, decentralized, no API key required.
 *
 * Audius is a decentralized music streaming protocol. The API is 100% free
 * with no rate limits and no API key needed. This gives us a reliable
 * fallback when SoundCloud client_ids get rotated/expired.
 *
 * API docs: https://docs.audius.org
 * Host discovery: https://api.audius.co → returns list of healthy hosts
 */

import type { Track } from "@/lib/musicApi";
import { sanitizeGenre } from "@/lib/tasteProfile";

// Cache the discovered host
let cachedHost: string | null = null;

/**
 * Discover a healthy Audius API host.
 * Audius requires you to pick a host from their discovery endpoint first.
 */
async function getAudiusHost(): Promise<string | null> {
  if (cachedHost) return cachedHost;
  try {
    const res = await fetch("https://api.audius.co", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hosts: string[] = data.data || [];
    if (hosts.length === 0) return null;
    // Pick a random host for load distribution
    cachedHost = hosts[Math.floor(Math.random() * Math.min(5, hosts.length))];
    return cachedHost;
  } catch {
    return null;
  }
}

/**
 * Search tracks on Audius.
 * Returns tracks in the same Track format as SoundCloud tracks.
 */
export async function searchAudiusTracks(query: string, limit = 20): Promise<Track[]> {
  const host = await getAudiusHost();
  if (!host) return [];

  try {
    const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}&app_name=MQPlayer`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: any[] = data.data || [];

    return tracks.map((t: any) => ({
      id: `audius_${t.id}`,
      title: t.title || "Unknown",
      artist: t.user?.name || t.user?.handle || "Unknown Artist",
      album: t.album_name || t.title || "",
      duration: t.duration || 0,
      cover: t.artwork?.["480x480"] || t.artwork?.["150x150"] || "",
      genre: sanitizeGenre(t.genre || t.mood || "") || "",
      audioUrl: "", // Will be resolved on play via getAudiusStream
      previewUrl: t.preview_url || "",
      source: "audius" as const,
      createdAt: t.created_at || t.release_date || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Get the stream URL for an Audius track.
 * Audius provides direct streamable URLs — no authentication needed.
 */
export async function getAudiusStream(trackId: string): Promise<string | null> {
  const host = await getAudiusHost();
  if (!host) return null;

  // trackId is prefixed with "audius_"
  const audiusId = trackId.replace("audius_", "");

  try {
    // Audius returns a 301 redirect to the actual stream URL
    const url = `${host}/v1/tracks/${audiusId}/stream?app_name=MQPlayer`;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    // The response is the audio file itself — return the URL
    // For use in <audio src>, we can use the API URL directly
    // since Audius handles the redirect server-side
    return url;
  } catch {
    // Fallback: try without redirect follow, get the Location header
    try {
      const url = `${host}/v1/tracks/${audiusId}/stream?app_name=MQPlayer`;
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 301 || res.status === 302) {
        return res.headers.get("location") || url;
      }
      return url;
    } catch {
      return null;
    }
  }
}

/**
 * Get trending tracks on Audius.
 */
export async function getAudiusTrending(limit = 20, genre?: string): Promise<Track[]> {
  const host = await getAudiusHost();
  if (!host) return [];

  try {
    let url = `${host}/v1/tracks/trending?app_name=MQPlayer&limit=${limit}`;
    if (genre) url += `&genre=${encodeURIComponent(genre)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: any[] = data.data || [];

    return tracks.map((t: any) => ({
      id: `audius_${t.id}`,
      title: t.title || "Unknown",
      artist: t.user?.name || t.user?.handle || "Unknown Artist",
      album: t.album_name || t.title || "",
      duration: t.duration || 0,
      cover: t.artwork?.["480x480"] || t.artwork?.["150x150"] || "",
      genre: sanitizeGenre(t.genre || t.mood || "") || "",
      audioUrl: "",
      previewUrl: t.preview_url || "",
      source: "audius" as const,
      createdAt: t.created_at || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a track ID is from Audius.
 */
export function isAudiusTrack(trackId: string): boolean {
  return trackId.startsWith("audius_");
}

/**
 * Find an Audius alternative for a SoundCloud track that only has a preview.
 * Searches Audius by artist + title and returns the stream URL if found.
 * Returns null if no match found.
 */
export async function findAudiusAlternative(artist: string, title: string): Promise<string | null> {
  const host = await getAudiusHost();
  if (!host) return null;

  // Clean title for better matching
  const cleanTitle = title
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/feat\.?\s+.*$/i, "")
    .replace(/ft\.?\s+.*$/i, "")
    .trim();

  const query = `${artist} ${cleanTitle}`;

  try {
    const searchUrl = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&limit=5&app_name=MQPlayer`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks: any[] = data.data || [];
    if (tracks.length === 0) return null;

    // Find best match — compare title and artist loosely
    const lowerTitle = cleanTitle.toLowerCase();
    const lowerArtist = artist.toLowerCase();

    for (const t of tracks) {
      const tTitle = (t.title || "").toLowerCase();
      const tArtist = (t.user?.name || t.user?.handle || "").toLowerCase();

      // Check if title and artist match loosely
      const titleMatch =
        tTitle.includes(lowerTitle) ||
        lowerTitle.includes(tTitle) ||
        tTitle.split(" ").some((w: string) => w.length > 3 && lowerTitle.includes(w));
      const artistMatch =
        tArtist.includes(lowerArtist) ||
        lowerArtist.includes(tArtist) ||
        tArtist.split(" ").some((w: string) => w.length > 3 && lowerArtist.includes(w));

      if (titleMatch && artistMatch) {
        // Found a match — return the stream URL
        const streamUrl = `${host}/v1/tracks/${t.id}/stream?app_name=MQPlayer`;
        return streamUrl;
      }
    }

    // No match found — return null, let caller fall back to SNIP preview
    return null;
  } catch {
    return null;
  }
}

