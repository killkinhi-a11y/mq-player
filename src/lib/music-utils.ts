/**
 * Shared music utility functions and constants.
 *
 * Extracted from:
 *   - src/app/api/music/radio/route.ts
 *   - src/app/api/music/recommendations/route.ts
 *
 * These are the IDENTICAL implementations used by both routes.
 */

import { type SCTrack, getSoundCloudClientId } from "@/lib/soundcloud";

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

/** Keywords used to detect religious/spam noise in track titles. */
export const NOISE_KEYWORDS = [
  "bible", "christian", "gospel", "worship", "praise", "sermon",
  "jesus", "lord", "hymn", "church", "scripture", "psalm",
  "devotional", "prayer song", "faith", "religious", "spiritual music",
];

/** Regex pattern for extracting hashtag-style genre tags from titles. */
export const HASHTAG_GENRE_PATTERN = /#(\w+(\s+\w+)*)/g;

/** Known genre hashtags commonly used in spam title stuffing. */
export const KNOWN_GENRE_HASHTAGS = [
  "deephouse", "deep house", "tech house", "techhouse",
  "soulful house", "club house", "progressive house",
  "tropical house", "future house", "afro house",
  "melodic house", "jackin house", "acid house",
];

// ══════════════════════════════════════════════════════════════════════════════
// CACHE UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve a cached value if it exists and has not expired.
 */
export function getFromCache(
  key: string,
  cache: Map<string, { data: unknown; expiry: number }>,
): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

/**
 * Store a value in the cache with an expiry based on the provided TTL.
 * Evicts expired entries when the cache exceeds `maxCacheSize`.
 */
export function setCache(
  key: string,
  data: unknown,
  cache: Map<string, { data: unknown; expiry: number }>,
  maxCacheSize: number = 100,
  ttlMs: number = 4 * 60 * 1000,
): void {
  if (cache.size > maxCacheSize) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

// ══════════════════════════════════════════════════════════════════════════════
// GENRE NORMALIZATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize a genre string for consistent comparison.
 *
 * - Lowercases and trims whitespace
 * - Replaces " & " with " and "
 * - Normalizes R&B, hip-hop, drum and bass variants
 */
export function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .trim()
    .replace(/ & /g, " and ")
    .replace(/r&b/g, "rnb")
    .replace(/r 'n' b/gi, "rnb")
    .replace(/hip hop/g, "hip-hop")
    .replace(/drum 'n' bass/gi, "drum and bass")
    .replace(/d 'n' b/gi, "drum and bass");
}

// ══════════════════════════════════════════════════════════════════════════════
// ENERGY ESTIMATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate a track's energy level (0–1) based on title keywords, genre, and duration.
 *
 * Returns one of: 0, 0.25, 0.5, 0.75, 1
 */
export function estimateEnergy(track: SCTrack): number {
  const title = (track.title || "").toLowerCase();
  const genre = normalizeGenre(track.genre || "");
  const dur = track.duration || 0;

  const highKeywords = [
    "remix", "edit", "mix", "club", "bass boosted", "radio edit", "extended",
    "hard", "rush", "hype", "banger", "drop", "festival", "rave", "workout",
    "gym", "bootleg", "vip", "original mix",
  ];
  const lowKeywords = [
    "acoustic", "live", "unplugged", "piano", "lullaby", "reprise",
    "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi",
    "slow", "ballad",
  ];

  let s = 0;
  for (const kw of highKeywords) {
    if (title.includes(kw)) { s += 1; break; }
  }
  for (const kw of lowKeywords) {
    if (title.includes(kw)) { s -= 1; break; }
  }

  const highG = [
    "edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap",
    "reggaeton", "dance pop", "hardcore", "trance", "psytrance", "garage",
    "grime", "drill",
  ];
  const midG = [
    "house", "pop", "hip hop", "rap", "indie", "rock", "alternative",
    "synthwave", "afrobeats",
  ];
  const lowG = [
    "ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova",
    "downtempo", "jazz", "blues", "new age",
  ];

  if (highG.some((g) => genre.includes(g))) s += 2;
  else if (midG.some((g) => genre.includes(g))) s += 1;
  if (lowG.some((g) => genre.includes(g))) s -= 2;

  if (dur > 0) {
    if (dur < 150) s += 1;
    else if (dur > 360) s -= 1;
  }

  if (s >= 2) return 1;
  if (s <= -2) return 0;
  if (s >= 1) return 0.75;
  if (s <= -1) return 0.25;
  return 0.5;
}

// ══════════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect the primary language of a text string based on script analysis.
 *
 * Returns "russian" for Cyrillic-dominant text, "english" for Latin-dominant,
 * "latin" for mixed/other Latin-script text, or "other" if indeterminate.
 */
export function detectLanguage(text: string): "russian" | "english" | "latin" | "other" {
  if (!text) return "other";
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cyrillic + latin;
  if (total === 0) return "other";
  if (cyrillic / total > 0.4) return "russian";
  if (latin / total > 0.6) return "english";
  return "latin";
}

// ══════════════════════════════════════════════════════════════════════════════
// NOISE / SPAM FILTERING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a text string contains religious/spam noise keywords.
 */
export function hasNoiseKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detect if a track title uses hashtag genre stuffing that mismatches
 * the reference genres (i.e., the track is pretending to be a genre it isn't).
 *
 * Example: A track titled "#deephouse #techhouse loungy chill track"
 * when the reference genres are ["pop", "rock"] → returns true (mismatch).
 */
export function titleHashtagGenreMismatch(
  title: string,
  referenceGenres: string[],
): boolean {
  const hashtags: string[] = [];
  const matches = title.matchAll(HASHTAG_GENRE_PATTERN);
  for (const match of matches) {
    const tag = match[1].toLowerCase().trim();
    if (KNOWN_GENRE_HASHTAGS.includes(tag)) hashtags.push(tag);
  }
  if (hashtags.length === 0) return false;
  const refLower = referenceGenres.map((g) => normalizeGenre(g));
  for (const hg of hashtags) {
    const hgNorm = normalizeGenre(hg);
    if (
      !refLower.some(
        (tg) => tg === hgNorm || tg.includes(hgNorm) || hgNorm.includes(tg),
      )
    ) {
      return true;
    }
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// SOUNDCLOUD RELATED TRACKS FETCHER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch tracks related to a given SoundCloud track ID via the SC Related API.
 *
 * Returns up to 20 tracks, filtered to exclude blocked/non-track items,
 * mapped to the SCTrack format with cover art proxy URLs.
 */
export async function fetchSCTrackRelated(
  scTrackId: number,
): Promise<SCTrack[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return [];
    const url = `https://api-v2.soundcloud.com/tracks/${scTrackId}/related?client_id=${clientId}&limit=20&offset=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data) ? data : data.collection || [];
    return raw
      .filter((t: Record<string, unknown>) => {
        if ((t.kind as string) !== "track") return false;
        if ((t.policy as string) === "BLOCK") return false;
        return true;
      })
      .map((t: Record<string, unknown>) => {
        const user = t.user as Record<string, unknown> | undefined;
        const artwork = (t.artwork_url as string) || "";
        const rawCover = artwork
          ? artwork.replace("-large.", "-t500x500.")
          : ((user?.avatar_url as string) || "").replace("-large.", "-t500x500.") || "";
        const cover = rawCover
          ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}`
          : "";
        const fullDuration = (t.full_duration as number) || (t.duration as number) || 30000;
        const policy = (t.policy as string) || "ALLOW";
        return {
          id: `sc_${t.id}`,
          title: (t.title as string) || "Unknown",
          artist: user?.username || "Unknown",
          album: "",
          duration: Math.round(fullDuration / 1000),
          cover,
          genre: (t.genre as string) || "",
          audioUrl: "",
          previewUrl: "",
          source: "soundcloud" as const,
          scTrackId: t.id as number,
          scStreamPolicy: policy,
          scIsFull: policy === "ALLOW",
        };
      });
  } catch {
    return [];
  }
}
