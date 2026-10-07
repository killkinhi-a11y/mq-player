/**
 * Search duplicate merging — the same musical work found in several
 * providers (Spotify catalog + SoundCloud / Audius uploads) renders as ONE
 * canonical row. Catalog identity wins; the audio source is still resolved
 * per-track by the PlaybackResolver.
 *
 * Duplicate predicate (deliberately conservative — better one extra row
 * than a wrongly hidden result):
 *   1. every token of the catalog title is present in the candidate title
 *      (reordered "Travis Scott - Goosebumps" merges; "Sicko Mode" doesn't);
 *   2. candidate has at most 3 extra title tokens (mega-mix dumps don't merge);
 *   3. artist token similarity ≥ 0.8;
 *   4. same detected version (a LIVE/REMIX upload is a SEPARATE work — it
 *      keeps its own row; the resolver scores versions at play time).
 */

import type { Track } from "@/lib/musicApi";
import { catalogToTrack } from "@/lib/playback/client";
import { normalizeText, tokenSimilarity, detectVersion } from "@/lib/playback/versions";

export interface CatalogLite {
  provider: "spotify" | "deezer";
  catalogId: string;
  title: string;
  artist: string;
}

/** Token-subset title match (predicate parts 1–2). */
export function titleCoreContained(catalogTitle: string, candidateTitle: string): boolean {
  const a = new Set(normalizeText(catalogTitle).split(" ").filter(Boolean));
  const b = new Set(normalizeText(candidateTitle).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return false;
  let contained = 0;
  for (const t of a) {
    if (!b.has(t)) return false;
    contained++;
  }
  return contained === a.size && b.size - a.size <= 3;
}

/** Full duplicate predicate against one catalog track. */
export function isDuplicateOf(catalog: CatalogLite, candidate: { title: string; artist: string; album?: string }): boolean {
  if (!titleCoreContained(catalog.title, candidate.title)) return false;
  if (tokenSimilarity(catalog.artist, candidate.artist) < 0.8) return false;
  // Same version class — "Goosebumps" ≠ "Goosebumps - LIVE".
  const vCat = detectVersion(catalog.title).version;
  const vCand = detectVersion(candidate.title, candidate.album).version;
  return vCat === vCand;
}

/**
 * Merge Spotify catalog results with SoundCloud/Audius search results:
 * catalog tracks first, provider results deduped against them.
 */
export function mergeSearchResults(
  catalogDtos: Parameters<typeof catalogToTrack>[0][],
  providerTracks: Track[],
): Track[] {
  if (catalogDtos.length === 0) return providerTracks;
  const catalogTracks = catalogDtos.map(catalogToTrack);
  const deduped = providerTracks.filter(
    (t) => !catalogDtos.some((sp) => isDuplicateOf(sp, t)),
  );
  return [...catalogTracks, ...deduped];
}
