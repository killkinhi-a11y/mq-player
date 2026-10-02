/**
 * PUBLIC Yandex playlist import — stateless matching core.
 *
 * Reuses the OAuth engine's matching functions verbatim (searchQueries +
 * matchTrack from src/lib/yandex/matching.ts + searchSCTracks transport).
 * The ONLY difference from the engine's matchChunk is state placement: the
 * OAuth job keeps state in the YandexImportJob DB row, while the PUBLIC flow
 * keeps it in the browser and POSTs slices of tracks here. Same scoring,
 * same thresholds, same "never silently import the wrong song" contract.
 *
 * Server-side only (searchSCTracks hits SoundCloud directly — the client
 * never talks to Yandex or SoundCloud upstreams).
 */

import type { Track } from "@/lib/musicApi";
import { searchSCTracks } from "@/lib/soundcloud";
import { matchTrack, searchQueries, type MatchResult } from "./matching";
import type { YandexTrackMeta } from "./types";

/** Preview/import cap for public URL imports (keeps payloads + runtimes bounded). */
export const PUBLIC_MAX_TRACKS = 200;
/** Max tracks the client may POST per matching request. */
export const PUBLIC_MATCH_CHUNK = 12;
/** Parallel SoundCloud searches (same as the OAuth engine). */
const SEARCH_CONCURRENCY = 3;
/** Candidates per query (same as the OAuth engine). */
const SEARCH_LIMIT = 6;

/** One matched Yandex track — serializable result entry for the client. */
export interface PublicMatchEntry {
  position: number;
  sourceTrackId: string;
  sourceAlbumId: string | null;
  yandexTitle: string;
  yandexArtists: string[];
  yandexDurationSec: number;
  status: "matched" | "ambiguous" | "unmatched";
  score?: number;
  exact?: boolean;
  mqTrack?: Track | null;
  candidates?: Track[];
}

/** Keep only the fields MQ needs (mirror of the engine's slimTrack). */
export function slimPublicTrack(t: Track): Track {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album || "",
    duration: t.duration || 0,
    cover: t.cover || "",
    genre: t.genre || "",
    audioUrl: t.audioUrl || "",
    previewUrl: "",
    source: "soundcloud" as const,
    scTrackId: t.scTrackId,
    scStreamPolicy: t.scStreamPolicy,
    scIsFull: t.scIsFull,
  };
}

/** Is this a plausible YandexTrackMeta object from a client? */
export function isYandexTrackMeta(v: unknown): v is YandexTrackMeta {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.position === "number" &&
    typeof t.trackId === "string" &&
    t.trackId.length > 0 &&
    typeof t.title === "string" &&
    Array.isArray(t.artists)
  );
}

/**
 * Match ONE slice of Yandex tracks against MQ's SoundCloud catalog.
 * Duplicated source tracks inside the slice reuse the first decision
 * (same dedupe semantics as the engine's matchChunk).
 */
export async function matchPublicChunk(tracks: YandexTrackMeta[]): Promise<PublicMatchEntry[]> {
  const entries: PublicMatchEntry[] = tracks.map((t) => ({
    position: t.position,
    sourceTrackId: t.trackId,
    sourceAlbumId: t.albumId ?? null,
    yandexTitle: t.title,
    yandexArtists: Array.isArray(t.artists) ? t.artists : [],
    yandexDurationSec: Math.round((t.durationMs || 0) / 1000),
    status: "unmatched" as const,
  }));

  const queryCache = new Map<string, Track[]>();
  const doneByKey = new Map<string, PublicMatchEntry>();

  for (let i = 0; i < entries.length; i += SEARCH_CONCURRENCY) {
    const slice = entries.slice(i, i + SEARCH_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (entry) => {
        // Duplicate of an already-decided track → same decision, no new search.
        const dupKey = `${entry.sourceTrackId}:${entry.sourceAlbumId ?? ""}`;
        const prior = doneByKey.get(dupKey);
        if (prior) return { entry, candidates: [] as Track[], prior };

        const meta: YandexTrackMeta = {
          position: entry.position,
          trackId: entry.sourceTrackId,
          albumId: entry.sourceAlbumId,
          title: entry.yandexTitle,
          artists: entry.yandexArtists,
          albumTitle: "",
          albumIdFull: null,
          durationMs: entry.yandexDurationSec * 1000,
          available: true,
        };
        let candidates: Track[] = [];
        for (const q of searchQueries(meta)) {
          const cached = queryCache.get(q);
          if (cached) {
            candidates = cached;
            break;
          }
          try {
            const found = await searchSCTracks(q, SEARCH_LIMIT);
            queryCache.set(q, found);
            if (found.length) {
              candidates = found;
              break;
            }
          } catch {
            // search failure → empty candidates for this query variant
          }
        }
        return { entry, candidates, prior: undefined as PublicMatchEntry | undefined };
      })
    );

    for (const r of results) {
      if (r.prior) {
        // Reuse the duplicate's decision.
        r.entry.status = r.prior.status;
        r.entry.score = r.prior.score;
        r.entry.exact = r.prior.exact;
        r.entry.mqTrack = r.prior.mqTrack ? { ...r.prior.mqTrack } : null;
        if (r.prior.status === "ambiguous") r.entry.candidates = r.prior.candidates?.map((c) => ({ ...c }));
        continue;
      }
      const meta: YandexTrackMeta = {
        position: r.entry.position,
        trackId: r.entry.sourceTrackId,
        albumId: r.entry.sourceAlbumId,
        title: r.entry.yandexTitle,
        artists: r.entry.yandexArtists,
        albumTitle: "",
        albumIdFull: null,
        durationMs: r.entry.yandexDurationSec * 1000,
        available: true,
      };
      const result: MatchResult = matchTrack(meta, r.candidates);
      r.entry.status = result.status;
      r.entry.score = result.best?.score;
      r.entry.exact = result.exact;
      r.entry.mqTrack = result.status === "matched" && result.best ? slimPublicTrack(result.best.track) : null;
      if (result.status === "ambiguous") {
        r.entry.candidates = (result.candidates ?? []).slice(0, 3).map((c) => slimPublicTrack(c.track));
      }
      if (!r.entry.mqTrack && result.status === "matched") {
        r.entry.status = "unmatched";
      }
      doneByKey.set(`${r.entry.sourceTrackId}:${r.entry.sourceAlbumId ?? ""}`, r.entry);
    }
  }

  return entries;
}
