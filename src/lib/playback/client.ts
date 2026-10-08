/**
 * Client-side PlaybackResolver bridge.
 *
 *   Spotify Catalog DTO (from /api/spotify/*)
 *     ↓ resolveCatalogTrack()
 *   Playable Track (SoundCloud / Audius) + catalog attribution
 *     ↓ store.playTrack()
 *   existing audio engine / MQ player
 *
 * Also manages:
 *   - userSourcePreference ("всегда SoundCloud / Audius") — persisted locally,
 *     passed as `prefer` to every resolve call; the resolver still verifies
 *     availability, preference never forces a bad match;
 *   - manual source switch (force) preserving playback position;
 *   - local TTL cache of resolve results to avoid refetching on re-play.
 */

import type { Track } from "@/lib/musicApi";
import type { CatalogTrackDTO } from "@/lib/spotify/types";
import { dedupe } from "@/lib/net/requestRegistry";

/* ── Types (mirror server /api/resolve contract) ───────────────────── */

/** Minimal catalog track input — enough for resolve + playable build. */
export interface CatalogTrackInput {
  provider: "spotify" | "deezer";
  catalogId: string;
  title: string;
  artist: string;
  album?: string;
  albumImage?: string;
  durationSec: number;
  isrc?: string;
}

export interface ResolveCandidate {
  provider: "soundcloud" | "audius";
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artwork?: string;
  isPreview?: boolean;
  /** V3 §6 — full-length verdict; previews never auto-play. */
  isFullLength?: boolean;
  fullLengthReason?: "ok" | "provider-flagged-preview" | "short-duration" | "snip-ratio";
  confidence: number;
  score: number;
  version?: string;
  userPicked?: boolean;
}

export interface ResolveResponse {
  best: ResolveCandidate | null;
  alternatives: ResolveCandidate[];
  confidence: number;
  lowConfidence: boolean;
  cached: boolean;
  error?: string;
}

/* ── User source preference ────────────────────────────────────────── */

export type SourcePreference = "soundcloud" | "audius" | "auto";

const PREF_KEY = "mq:userTrackSourcePreference";

export function getUserSourcePreference(): SourcePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === "soundcloud" || v === "audius" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setUserSourcePreference(pref: SourcePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (pref === "auto") window.localStorage.removeItem(PREF_KEY);
    else window.localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* private mode — non-fatal */
  }
}

/* ── Local resolve cache (session-scope, small) ────────────────────── */

interface CacheEntry {
  best: ResolveCandidate | null;
  alternatives: ResolveCandidate[];
  at: number;
}
const localCache = new Map<string, CacheEntry>();
const LOCAL_TTL = 30 * 60 * 1000;

/* ── Resolve ───────────────────────────────────────────────────────── */

export interface ResolveOutcome {
  /** Playable track with attribution, or null when no confident match. */
  track: Track | null;
  /** All ranked candidates — for the "choose source" UI. */
  alternatives: ResolveCandidate[];
  /** True when candidates exist but none cleared the threshold. */
  lowConfidence: boolean;
  /** True on network/API failure — honest error state. */
  failed: boolean;
  catalog: CatalogTrackInput;
}

/**
 * Build a playable Track from a resolved candidate + catalog DTO.
 * The audio engine plays via `source` + `scTrackId` / audius id as usual;
 * attribution fields carry the catalog identity for badges/queue/history.
 */
export function buildPlayableTrack(
  catalog: CatalogTrackInput,
  cand: ResolveCandidate,
): Track {
  const isSc = cand.provider === "soundcloud";
  const base: Track = {
    // Stable composite id: catalog identity + playback source.
    id: `cat_${catalog.provider}_${catalog.catalogId}_${cand.provider}_${cand.sourceId}`,
    title: catalog.title,
    artist: catalog.artist,
    album: catalog.album || "",
    duration: cand.durationSec || catalog.durationSec,
    cover: catalog.albumImage || cand.artwork || "",
    genre: "",
    audioUrl: "",
    previewUrl: "",
    source: isSc ? "soundcloud" : "audius",
    catalogProvider: catalog.provider,
    catalogId: catalog.catalogId,
    playbackProvider: cand.provider,
    playbackId: cand.sourceId,
    _resolveConfidence: cand.confidence,
    versionTag: cand.version && cand.version !== "original" ? cand.version : undefined,
  };
  if (isSc) {
    base.scTrackId = Number(cand.sourceId);
    base.scIsFull = !cand.isPreview;
    base.scStreamPolicy = cand.isPreview ? "SNIP" : "ALLOW";
  }
  // V3 §6 — carry the full-length verdict onto the playable track so UI,
  // queue and history can trust it (honest «превью» disclosure if forced).
  if (cand.isFullLength === false) {
    base.scIsFull = false;
    base.scStreamPolicy = "SNIP";
  }
  return base;
}

/**
 * Resolve a catalog track to a playable source.
 * Never throws — all failures become honest `failed: true`.
 *
 * V3 §2/§23: identical concurrent resolves SHARE one in-flight request
 * (dedupe); `signal` lets the engine abort stale resolves on rapid A→B→C.
 */
export async function resolveCatalogTrack(
  catalog: CatalogTrackInput,
  opts?: { force?: { provider: "soundcloud" | "audius"; sourceId: string }; signal?: AbortSignal | null },
): Promise<ResolveOutcome> {
  const prefer = getUserSourcePreference();

  const cacheKey = `${catalog.provider}:${catalog.catalogId}:${prefer}:${opts?.force?.sourceId || ""}`;
  const cachedEntry = !opts?.force ? localCache.get(cacheKey) : null;
  if (cachedEntry && Date.now() - cachedEntry.at < LOCAL_TTL) {
    return {
      track: cachedEntry.best ? buildPlayableTrack(catalog, cachedEntry.best) : null,
      alternatives: cachedEntry.alternatives,
      lowConfidence: !cachedEntry.best,
      failed: false,
      catalog,
    };
  }

  // V3 §23 — in-flight dedup: two callers resolving the same catalog track
  // (e.g. engine load + queue prefetch) fire ONE network request.
  const data = await dedupe(
    `resolve:${cacheKey}`,
    async (signal) => {
      const composed = opts?.signal && signal
        ? (() => {
            // Combine caller signal + dedup signal — either aborts.
            const c = new AbortController();
            const onAbort = () => c.abort();
            opts.signal!.addEventListener("abort", onAbort, { once: true });
            signal.addEventListener("abort", onAbort, { once: true });
            return c.signal;
          })()
        : (opts?.signal || signal || undefined);
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            catalogProvider: catalog.provider,
            track: {
              catalogId: catalog.catalogId,
              title: catalog.title,
              artist: catalog.artist,
              album: catalog.album,
              durationSec: catalog.durationSec,
              isrc: catalog.isrc,
            },
            prefer: prefer !== "auto" ? prefer : undefined,
            force: opts?.force,
          }),
          signal: composed ?? AbortSignal.timeout(25000),
        });
        if (!res.ok) return null;
        return (await res.json()) as ResolveResponse;
      } catch {
        return null;
      }
    },
    { ttl: 0 },
  );

  if (!data) {
    return { track: null, alternatives: [], lowConfidence: false, failed: true, catalog };
  }

  if (!opts?.force) {
    localCache.set(cacheKey, {
      best: data.best,
      alternatives: data.alternatives,
      at: Date.now(),
    });
    if (localCache.size > 120) localCache.clear();
  }

  return {
    track: data.best ? buildPlayableTrack(catalog, data.best) : null,
    alternatives: data.alternatives || [],
    lowConfidence: !!data.lowConfidence,
    failed: false,
    catalog,
  };
}

/**
 * Fetch alternatives for an already-playing track (source switch UI).
 * Uses the local cache when warm; server match cache makes this cheap.
 */
export async function fetchAlternatives(
  provider: "spotify" | "deezer",
  catalogId: string,
  catalog: { title: string; artist: string; album?: string; durationSec: number },
): Promise<ResolveCandidate[]> {
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogProvider: provider,
        track: {
          catalogId,
          title: catalog.title,
          artist: catalog.artist,
          album: catalog.album,
          durationSec: catalog.durationSec,
        },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as ResolveResponse;
    return data.alternatives || [];
  } catch {
    return [];
  }
}

/** Clear the local resolve cache (e.g. after user changes source preference). */
export function clearLocalResolveCache(): void {
  localCache.clear();
}

/**
 * Spotify catalog DTO → queue Track (source "spotify", unresolved).
 * The audio engine resolves it to a playable source (SoundCloud / Audius)
 * lazily when it becomes current — catalog metadata (title, artwork, album)
 * is already fully populated from Spotify.
 */
export function catalogToTrack(dto: CatalogTrackDTO): Track {
  return {
    id: `${dto.provider === "deezer" ? "dz" : "sp"}_${dto.catalogId}`,
    title: dto.title,
    artist: dto.artist,
    album: dto.album || "",
    duration: dto.durationSec,
    cover: dto.albumImage || "",
    genre: "",
    audioUrl: "",
    previewUrl: "",
    // Unresolved catalog track: the engine resolves it at play time.
    // source "spotify" is the historical lazy-resolve marker for ANY
    // catalog provider — attribution lives in catalogProvider/catalogId.
    source: "spotify",
    catalogProvider: dto.provider,
    catalogId: dto.catalogId,
    catalogArtistId: dto.artistId,
    // V2 §7/§16 — official playback URI (Spotify DTOs only): lets the
    // engine try the Web Playback SDK BEFORE the PlaybackResolver runs.
    ...(dto.provider === "spotify" && dto.uri ? { spotifyUri: dto.uri, spotifyTrackId: dto.catalogId } : {}),
  };
}
