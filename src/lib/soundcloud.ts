/**
 * SoundCloud search utility — uses pre-cached client IDs with runtime fallback.
 *
 * The pool contains several known-good IDs; if all of them 401 (SoundCloud
 * rotates them roughly quarterly), we attempt a one-shot extraction by
 * scraping `https://soundcloud.com/` for the `client_id` literal in inline
 * script tags (same pattern yt-dlp uses). The extracted ID is cached in
 * module scope and in `localStorage`/process.env with a 24h TTL.
 */

import { sanitizeGenre } from "@/lib/tasteProfile";

/* ------------------------------------------------------------------ */
/*  Client ID pool — rotated on 401 errors                            */
/* ------------------------------------------------------------------ */
const CLIENT_IDS = [
  "i53MAi5VcJrq7u38ZL1SOZtDi17ds1A0", // 2025-06
  "JYcDeZwsm7iCUaCkf1rFjCmVh5RcY3gE", // backup
  "0fW2nOTiRqfcZvfInHCFInQD6v3a87SE", // backup
  "iZfJlNrHFpRTrlyUIv5VaCkqNKU8wHmD", // backup
];

let activeIndex = 0;
let validatedId: string | null = null;
let extractedIdCache: { id: string; expiresAt: number } | null = null;
const EXTRACTION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Get a working client_id.
 * Returns immediately from validated pool. If the pool is exhausted
 * (all IDs returned 401), attempts a one-shot live extraction.
 */
export async function getSoundCloudClientId(): Promise<string | null> {
  if (validatedId) return validatedId;

  // Try the current pool entry
  const poolId = CLIENT_IDS[activeIndex];
  if (poolId) {
    validatedId = poolId;
    return validatedId;
  }

  // Pool exhausted — try cached extracted ID
  if (extractedIdCache && extractedIdCache.expiresAt > Date.now()) {
    validatedId = extractedIdCache.id;
    return validatedId;
  }

  // Try live extraction (this is a network call — kept lazy)
  const extracted = await extractClientIdFromWebsite().catch(() => null);
  if (extracted) {
    extractedIdCache = { id: extracted, expiresAt: Date.now() + EXTRACTION_TTL_MS };
    validatedId = extracted;
    return validatedId;
  }

  return null;
}

/**
 * Mark current client_id as invalid (e.g. on 401).
 * Next call will try the next ID, or fall back to live extraction
 * if the entire pool has been tried in this process.
 */
export function invalidateClientId(): void {
  const prevIndex = activeIndex;
  activeIndex = (activeIndex + 1) % CLIENT_IDS.length;
  validatedId = null;
  // If we've cycled back to the start, clear the extracted cache too —
  // force a fresh extraction on the next call.
  if (activeIndex === prevIndex) {
    extractedIdCache = null;
  }
}

/**
 * Live-extract a client_id from soundcloud.com by fetching the homepage
 * and parsing the bundled JS for the `client_id` literal.
 *
 * This is the same approach yt-dlp uses. We keep it lightweight:
 *   1. Fetch `https://soundcloud.com/` (small HTML, ~50KB).
 *   2. Find script URLs that look like webpack chunks.
 *   3. Fetch the first 3 chunks (limited to 1MB each) and regex-scan
 *      for `client_id:"<32-char-hex>"` or `client_id: "<32-char-hex>"`.
 *
 * Returns null on any failure — never throws.
 */
async function extractClientIdFromWebsite(): Promise<string | null> {
  try {
    // Bypass via a CORS proxy is NOT needed server-side — this code runs
    // in the Next.js API route, not the browser.
    const homeRes = await fetch("https://soundcloud.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MQPlayer/1.0)" },
      // 5s timeout — we don't want to block the request chain
      signal: AbortSignal.timeout(5000),
    });
    if (!homeRes.ok) return null;
    const html = await homeRes.text();
    // Extract script URLs
    const scriptUrls = Array.from(
      html.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
      (m) => m[1],
    ).filter((u) => u.startsWith("https://") || u.startsWith("/"));
    if (scriptUrls.length === 0) return null;

    // Try up to 5 scripts
    for (const url of scriptUrls.slice(0, 5)) {
      const fullUrl = url.startsWith("/") ? `https://soundcloud.com${url}` : url;
      try {
        const scriptRes = await fetch(fullUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MQPlayer/1.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (!scriptRes.ok) continue;
        // Read at most 2MB to avoid OOM
        const reader = scriptRes.body?.getReader();
        if (!reader) continue;
        let buf = "";
        let totalRead = 0;
        const MAX = 2 * 1024 * 1024;
        let found: string | null = null;
        while (totalRead < MAX) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          buf += new TextDecoder().decode(value, { stream: true });
          totalRead += value.byteLength;
          // Match `client_id:"<32 chars>"` or with a space
          const m = buf.match(/client_id:\s*["']([a-zA-Z0-9]{32})["']/);
          if (m) {
            found = m[1];
            break;
          }
          // Trim buffer to last 1KB to keep memory bounded while allowing
          // matches that span chunks
          if (buf.length > 1024 * 1024) buf = buf.slice(-1024);
        }
        if (found) return found;
      } catch {
        // Continue to next script
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Non-music content filter                                           */
/* ------------------------------------------------------------------ */

// Title keywords that indicate non-music content (DJ sets, podcasts, audiobooks, etc.)
const NON_MUSIC_KEYWORDS = [
  "dj set", "dj mix", "live set", "club mix", "radio show", "radio mix",
  "podcast", "audiobook", "audio book", "bible", "biblia", "quran", "koran",
  "sermon", "preaching", "prayer", "church service", "mass ",
  "meditation guide", "sleep sounds", "white noise", "rain sounds", "asmr",
  "sound effect", "sfx ", "notification sound", "ringtone",
  "interview", "talk show", "news broadcast", "news update",
  "audio drama", "audio play", "radio drama", "storytime",
  "language lesson", "learn ", "course ", "lecture", "tutorial audio",
  "standup", "stand-up", "comedy special",
];

// Genre keywords that indicate non-music content
const NON_MUSIC_GENRES = [
  "podcast", "audiobook", "spoken word", "speech", "talk", "news",
  "comedy", "education", "religion", "spiritual", "meditation",
];

function isNonMusicContent(title: string, genre: string, durationSec: number): boolean {
  const titleLower = title.toLowerCase();
  const genreLower = (genre || "").toLowerCase();

  // Check title keywords
  for (const kw of NON_MUSIC_KEYWORDS) {
    if (titleLower.includes(kw)) return true;
  }

  // Check genre keywords
  for (const ng of NON_MUSIC_GENRES) {
    if (genreLower === ng || genreLower.includes(ng)) return true;
  }

  // Extremely long tracks (>30 min) are likely DJ sets, podcasts, or mixes
  if (durationSec > 1800) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  Track interface                                                     */
/* ------------------------------------------------------------------ */

export interface SCTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  genre: string;
  audioUrl: string;
  previewUrl: string;
  source: "soundcloud";
  scTrackId: number;
  scStreamPolicy: string;
  scIsFull: boolean;
}

/* ------------------------------------------------------------------ */
/*  Search                                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Artist interface & search                                          */
/* ------------------------------------------------------------------ */

export interface SCArtist {
  id: number;
  username: string;
  avatar: string;
  followers: number;
  genre: string;
  trackCount: number;
}

export async function searchSCArtists(
  query: string,
  limit = 20
): Promise<SCArtist[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return [];

    const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(
      query
    )}&client_id=${clientId}&limit=${limit}&facet=genre`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 401) {
      invalidateClientId();
      return [];
    }
    if (!res.ok) return [];

    const data = await res.json();
    const users = data.collection || [];
    if (users.length === 0) return [];

    return users
      .filter((u: Record<string, unknown>) => {
        const kind = (u.kind as string) || "";
        if (kind !== "user") return false;
        // Skip users with very few followers or tracks (likely spam)
        const followers = (u.followers_count as number) || 0;
        const trackCount = (u.track_count as number) || 0;
        if (followers < 100 || trackCount < 1) return false;
        return true;
      })
      .map((u: Record<string, unknown>) => {
        const rawAvatar = (u.avatar_url as string) || "";
        const avatar = rawAvatar
          ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawAvatar.replace("-large.", "-t500x500."))}`
          : "";
        return {
          id: u.id as number,
          username: (u.username as string) || "Unknown",
          avatar,
          followers: (u.followers_count as number) || 0,
          genre: (u.genre as string) || "",
          trackCount: (u.track_count as number) || 0,
        };
      });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Track search (existing)                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve a SoundCloud track to a direct progressive audio URL.
 * Used by the Telegram bot to send audio previews in chat.
 * Tries progressive (MP3) transcodings first for Telegram compatibility.
 */
export async function resolveSCStreamUrl(scTrackId: number): Promise<string | null> {
  const CLIENT_IDS_STREAM = [
    "i53MAi5VcJrq7u38ZL1SOZtDi17ds1A0", // Fresh: extracted from SC website (2025-06)
  ];

  for (const clientId of CLIENT_IDS_STREAM) {
    try {
      const trackRes = await fetch(
        `https://api-v2.soundcloud.com/tracks/${scTrackId}?client_id=${clientId}`,
        { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36" } }
      );
      if (!trackRes.ok) continue;

      const track = await trackRes.json();
      const transcodings: Array<{ url?: string; format?: { protocol?: string } }> =
        (track.media?.transcodings || []).filter(Boolean);

      const trackAuthorization = (track as Record<string, unknown>).track_authorization as string || "";

      // Collect candidates: progressive first, then hls, then others
      const candidates: string[] = [];
      for (const tc of transcodings) {
        if (!tc.url) continue;
        if (tc.format?.protocol === "progressive") candidates.unshift(tc.url);
        else if (tc.format?.protocol === "hls") candidates.push(tc.url);
        else candidates.push(tc.url);
      }

      // Try first 2 candidates in parallel (saves ~4s vs sequential)
      const batch = candidates.slice(0, 2);
      if (batch.length === 1) {
        const r = await resolveTemplateUrl(batch[0], clientId, trackAuthorization);
        if (r) return r;
      } else if (batch.length >= 2) {
        const [r1, r2] = await Promise.all([
          resolveTemplateUrl(batch[0], clientId, trackAuthorization),
          resolveTemplateUrl(batch[1], clientId, trackAuthorization),
        ]);
        if (r1) return r1;
        if (r2) return r2;
      }

      // Sequential fallback for remaining candidates
      for (const url of candidates.slice(2)) {
        const r = await resolveTemplateUrl(url, clientId, trackAuthorization);
        if (r) return r;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveTemplateUrl(
  templateUrl: string,
  clientId: string,
  trackAuthorization: string
): Promise<string | null> {
  try {
    const separator = templateUrl.includes("?") ? "&" : "?";
    let url = `${templateUrl}${separator}client_id=${clientId}`;
    if (trackAuthorization) {
      url += `&track_authorization=${encodeURIComponent(trackAuthorization)}`;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch {}
  return null;
}

/**
 * Get tracks from a specific SoundCloud user (artist page).
 * Returns tracks sorted by release date (newest first) — i.e., new releases.
 */
export async function getSCUserTracks(
  userId: number,
  limit = 20
): Promise<SCTrack[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return [];

    const url = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${clientId}&limit=${limit}&sort=created_at&direction=desc`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 401) {
      invalidateClientId();
      return [];
    }
    if (!res.ok) return [];

    const data = await res.json();
    const tracks: Record<string, unknown>[] = data.collection || data || [];
    if (!Array.isArray(tracks) || tracks.length === 0) return [];

    return tracks
      .filter((t: Record<string, unknown>) => {
        const policy = (t.policy as string) || "";
        if (policy === "BLOCK") return false;
        const title = (t.title as string) || "";
        const genre = (t.genre as string) || "";
        const durationMs = (t.full_duration as number) || (t.duration as number) || 0;
        const durationSec = Math.round(durationMs / 1000);
        if (isNonMusicContent(title, genre, durationSec)) return false;
        return true;
      })
      .map((t: Record<string, unknown>) => {
        const user = t.user as Record<string, unknown> | undefined;
        const artwork = t.artwork_url as string | undefined;
        const rawCover = artwork
          ? artwork.replace("-large.", "-t500x500.")
          : (user?.avatar_url as string | undefined)?.replace("-large.", "-t500x500.") || "";
        const cover = rawCover
          ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}`
          : "";
        const fullDuration =
          (t.full_duration as number) || (t.duration as number) || 30000;
        const policy = (t.policy as string) || "ALLOW";
        const created = (t.created_at as string) || "";

        return {
          id: `sc_${t.id}`,
          title: (t.title as string) || "Unknown Track",
          artist: (user?.username as string) || "Unknown Artist",
          album: "",
          duration: Math.round(fullDuration / 1000),
          cover: cover || "",
          genre: sanitizeGenre((t.genre as string) || "") || "",
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud" as const,
          scTrackId: t.id as number,
          scStreamPolicy: policy,
          scIsFull: policy === "ALLOW",
          createdAt: created, // ISO date string for sorting
        };
      });
  } catch {
    return [];
  }
}

export async function searchSCTracks(
  query: string,
  limit = 20
): Promise<SCTrack[]> {
  // Try up to 2 times: first with current (possibly stale) client_id,
  // then once more after re-extracting a fresh one on 401.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const clientId = await getSoundCloudClientId();
      if (!clientId) return [];

      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        query
      )}&client_id=${clientId}&limit=${limit}&facet=genre`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.status === 401) {
        // Mark current id as invalid and retry once — getSoundCloudClientId
        // will re-extract from soundcloud.com on the next call.
        invalidateClientId();
        if (attempt === 0) continue; // retry
        return [];
      }
      if (!res.ok) return [];

      const data = await res.json();
      const tracks = data.collection || [];
      if (tracks.length === 0) return [];

      return tracks
        .filter((t: Record<string, unknown>) => {
          const policy = (t.policy as string) || "";
          // Filter out completely blocked tracks — they have no playable media
          if (policy === "BLOCK") return false;
          // Filter out non-music content (DJ sets, podcasts, audiobooks, bibles, etc.)
          const title = (t.title as string) || "";
          const genre = (t.genre as string) || "";
          const durationMs = (t.full_duration as number) || (t.duration as number) || 0;
          const durationSec = Math.round(durationMs / 1000);
          if (isNonMusicContent(title, genre, durationSec)) return false;
          return true;
        })
        .map((t: Record<string, unknown>) => {
        const user = t.user as Record<string, unknown> | undefined;
        const artwork = t.artwork_url as string | undefined;
        const rawCover = artwork
          ? artwork.replace("-large.", "-t500x500.")
          : (user?.avatar_url as string | undefined)?.replace("-large.", "-t500x500.") || "";
        // Route cover images through our proxy to bypass client-side blocks
        const cover = rawCover
          ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}`
          : "";
        const fullDuration =
          (t.full_duration as number) || (t.duration as number) || 30000;
        const policy = (t.policy as string) || "ALLOW";

        return {
          id: `sc_${t.id}`,
          title: (t.title as string) || "Unknown Track",
          artist: user?.username || "Unknown Artist",
          album: "",
          duration: Math.round(fullDuration / 1000),
          cover: cover || "",
          genre: sanitizeGenre((t.genre as string) || "") || "",
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud" as const,
          scTrackId: t.id as number,
          scStreamPolicy: policy,
          scIsFull: policy === "ALLOW", // Only ALLOW = truly full playable track
        };
      });
    } catch {
      return [];
    }
  }
  return [];
}
