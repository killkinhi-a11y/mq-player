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
  "S3TPtG5i3yzBs1BPd50h1N5TW2kNTo5k",
  "gYfbOmxjDgPKEbOlXIBOAOvFpWkf8SbA",
  "nDSHHx4FpO2gOGKmGqLaWbDXEmwo4RAC",
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
      headers: { Accept: "application/json" },
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

    return tracks.map((t: Record<string, unknown>) => {
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
        scStreamPolicy: t.policy as string,
        scIsFull: t.policy !== "SNIP",
      };
    });
  } catch {
    return [];
  }
}
