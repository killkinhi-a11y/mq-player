/**
 * SoundCloud search utility — uses pre-cached client IDs.
 *
 * Live extraction (scraping soundcloud.com JS bundles) has been removed
 * because it causes OOM in containerized environments (>3MB JS bundles).
 * Instead we use a pool of known client IDs validated at startup.
 */

/* ------------------------------------------------------------------ */
/*  Client ID pool — rotated on 401 errors                            */
/* ------------------------------------------------------------------ */
const CLIENT_IDS = [
  "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa", // Fresh: extracted from SC website (2025-05)
  "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
];

let activeIndex = 0;
let validatedId: string | null = null;

/**
 * Get a working client_id.
 * Returns immediately — NO external fetch (was causing OOM in standalone).
 * If the ID is bad, the actual API call will 401 → invalidateClientId()
 * rotates to the next one on the next request.
 */
export async function getSoundCloudClientId(): Promise<string | null> {
  if (validatedId) return validatedId;
  validatedId = CLIENT_IDS[activeIndex];
  return validatedId;
}

/**
 * Mark current client_id as invalid (e.g. on 401).
 * Next call will try the next ID.
 */
export function invalidateClientId(): void {
  activeIndex = (activeIndex + 1) % CLIENT_IDS.length;
  validatedId = null;
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
    "1Gbi6DBGBMULQH8MuhNvI1HzL9AiX2Pa",
    "qYUIEFbSZdXPABQbuHA2Tv8C9ndesHim",
    "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
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
          genre: (t.genre as string) || "",
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
      invalidateClientId();
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
        genre: (t.genre as string) || "",
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
