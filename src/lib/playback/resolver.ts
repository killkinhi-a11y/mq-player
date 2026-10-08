/**
 * PlaybackResolver — catalog track → best playable audio candidate.
 *
 * ARCHITECTURE (v2 multi-provider music engine):
 *
 *   Catalog Provider (Spotify)          ← metadata, artwork, album context
 *   ↓ NormalizedTrack
 *   PlaybackResolver (this file)        ← candidate search + scoring
 *   ↓ PlaybackCandidate
 *   Audio Provider (SoundCloud / Audius)← real stream
 *   ↓ existing Audio Engine / MQ player ← playback
 *
 * The resolver NEVER fabricates a match. Every candidate comes from a real
 * provider search; every score component is derived from verifiable signals
 * (ISRC, normalized title/artist, duration, album, version markers).
 * Candidates below the confidence threshold are rejected — playing the
 * wrong track is worse than playing nothing.
 *
 * SCORING (V3 §5 — user-mandated weights, 0…100 raw → 0…1 confidence):
 *   ISRC exact match.................... +100  (guaranteed identity)
 *   Exact normalized title.............. +40
 *   Exact normalized artist............. +40
 *   Duration within 3s.................. +20   (2s..5s: +12; ≤8s: +6)
 *   Album name match.................... +10
 *   Version MATCHES catalog non-original. +10  (user asked Live → Live ✓)
 *   Version mismatch penalties (V3 §5 — MANDATED):
 *     karaoke / cover / AI cover /
 *     reaction......................... −100  (never auto-pick)
 *     slowed / reverb / sped up........ −70
 *     live.............................. −60
 *     remix / instrumental.............. −50
 *     acoustic.......................... −50
 *     radio edit........................ −30
 *     remaster / extended / edit....... −15
 *
 * FULL-LENGTH RULE (V3 §3/§6 — ABSOLUTE):
 *   Preview-only candidates (SNIP / ~30s / teaser) are REJECTED from the
 *   auto-play `best`. They remain in `alternatives` with isFullLength:false
 *   for the source sheet's honest «превью» disclosure, but the normal Play
 *   path can never select them. A preview is NOT a playback provider.
 *
 * CONFIDENCE = clamp(score / 100, 0, 1). AUTO-PLAY threshold: 0.60.
 * Alternatives are always returned so the UI can offer source choice.
 */

import { detectVersion, exactTitle, normalizeText, tokenSimilarity, type TrackVersion } from "./versions";
import { validateFullLength, type FullLengthVerdict } from "./fullLength";

/* ── Types ─────────────────────────────────────────────────────────── */

/**
 * Token-subset title containment: every token of the catalog title is
 * present in the candidate title (uploads named "Artist - Title" or
 * "Title feat. X" contain the catalog core). Extra-token cap keeps
 * mega-mixes out.
 */
function titleCoreContained(catalogTitle: string, candidateTitle: string, maxExtra = 2): boolean {
  const a = normalizeText(catalogTitle).split(" ").filter(Boolean);
  const b = new Set(normalizeText(candidateTitle).split(" ").filter(Boolean));
  if (a.length === 0 || b.size === 0) return false;
  for (const t of a) if (!b.has(t)) return false;
  return b.size - a.length <= maxExtra;
}

/** A catalog track from any metadata provider (Spotify, …). */
export interface CatalogTrack {
  /** Provider track id (e.g. Spotify base62 id). */
  catalogId: string;
  title: string;
  artist: string;
  /** Primary artist only — used for exact artist matching. */
  album?: string;
  durationSec: number;
  /** International Standard Recording Code, when exposed by the provider. */
  isrc?: string;
  /** Version detected on the CATALOG side (usually "original"). */
  version?: TrackVersion;
}

/** A playable candidate from an audio provider. */
export interface PlaybackCandidate {
  provider: "soundcloud" | "audius";
  /** Provider-native track id (scTrackId / audius id — no prefix). */
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artwork?: string;
  /** Preview-only stream (SoundCloud SNIP policy). */
  isPreview?: boolean;
  isrc?: string;
  popularity?: number;
}

export interface ScoredCandidate extends PlaybackCandidate {
  score: number;
  confidence: number;
  /** V3 §6: full-length validation verdict — previews never auto-play. */
  isFullLength: boolean;
  /** Machine reason of the verdict (ok / provider-flagged-preview / …). */
  fullLengthReason: FullLengthVerdict["reason"];
  breakdown: {
    isrc: number;
    title: number;
    artist: number;
    duration: number;
    album: number;
    versionBonus: number;
    versionPenalty: number;
  };
  version: TrackVersion;
}

export interface ResolveResult {
  /** Best candidate above threshold, or null. */
  best: ScoredCandidate | null;
  /** All candidates sorted by score desc (best first), max 8. */
  alternatives: ScoredCandidate[];
  /** Confidence of `best` (0 when no best). */
  confidence: number;
  /** True when at least one candidate existed but none cleared threshold. */
  lowConfidence: boolean;
}

/* ── Scoring ───────────────────────────────────────────────────────── */

/** Raw score component weights. */
export const WEIGHTS = {
  isrc: 100,
  title: 40,
  artist: 40,
  duration: 20,
  album: 10,
} as const;

/** Version mismatch penalties (V3 §5 — user-mandated values). */
export const VERSION_PENALTIES: Record<TrackVersion, number> = {
  karaoke: -100,
  cover: -100,
  ai_cover: -100,
  reaction: -100,
  slowed: -70,
  reverb: -70,
  sped_up: -70,
  live: -60,
  remix: -50,
  instrumental: -50,
  acoustic: -50,
  radio_edit: -30,
  edit: -15,
  extended: -15,
  remaster: -15,
  original: 0,
};

/** V3 §5: bonus when the candidate MATCHES a non-original catalog version. */
export const VERSION_MATCH_BONUS = 10;

/** Candidates must clear this confidence to be auto-played. */
export const AUTO_PLAY_THRESHOLD = 0.6;

/**
 * Score ONE candidate against a catalog track.
 * Pure function — no network, no side effects.
 */
export function scoreCandidate(catalog: CatalogTrack, candidate: PlaybackCandidate): ScoredCandidate {
  const breakdown = {
    isrc: 0,
    title: 0,
    artist: 0,
    duration: 0,
    album: 0,
    versionBonus: 0,
    versionPenalty: 0,
  };

  // ISRC — strongest possible identity signal.
  if (catalog.isrc && candidate.isrc) {
    const a = catalog.isrc.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const b = candidate.isrc.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (a && a === b) breakdown.isrc = WEIGHTS.isrc;
  }

  // Title — exact normalized match, token-core containment ("Artist - Title"
  // upload naming), else token similarity ratio.
  const titleSim = tokenSimilarity(catalog.title, candidate.title);
  if (exactTitle(catalog.title, candidate.title)) {
    breakdown.title = WEIGHTS.title;
  } else if (titleCoreContained(catalog.title, candidate.title)) {
    // The catalog core is fully contained with ≤2 extra tokens — the
    // common SoundCloud naming pattern ("Travis Scott - Goosebumps").
    breakdown.title = Math.round(WEIGHTS.title * 0.85);
  } else if (titleSim >= 0.85) {
    breakdown.title = Math.round(WEIGHTS.title * 0.75); // near-exact (extra word)
  } else if (titleSim >= 0.65) {
    breakdown.title = Math.round(WEIGHTS.title * 0.5);
  }

  // Artist — exact normalized match of primary artist, else similarity.
  const artistSim = tokenSimilarity(catalog.artist, candidate.artist);
  if (exactTitle(catalog.artist, candidate.artist)) {
    breakdown.artist = WEIGHTS.artist;
  } else if (artistSim >= 0.8) {
    breakdown.artist = Math.round(WEIGHTS.artist * 0.7);
  } else if (artistSim >= 0.6) {
    breakdown.artist = Math.round(WEIGHTS.artist * 0.4);
  }

  // Duration — only meaningful when both durations are known.
  if (catalog.durationSec > 0 && candidate.durationSec > 0) {
    const diff = Math.abs(catalog.durationSec - candidate.durationSec);
    if (diff <= 3) breakdown.duration = WEIGHTS.duration;
    else if (diff <= 5) breakdown.duration = 12;
    else if (diff <= 8) breakdown.duration = 6;
    else if (diff > 60) breakdown.duration = -10; // way off — probably wrong cut
  }

  // Album (optional signal).
  if (catalog.album && candidate.album && normalizeText(catalog.album) === normalizeText(candidate.album)) {
    breakdown.album = WEIGHTS.album;
  }

  // Version scoring — V3 §5. When the CATALOG track is the ORIGINAL, an
  // alternate-version candidate gets the mandated penalty. When the catalog
  // track IS a specific alternate (user opened a "Live" version from the
  // catalog), a MATCHING candidate earns +10 and a mismatch gets −15.
  const catalogVersion = catalog.version ?? detectVersion(catalog.title, catalog.album).version;
  const candVersion = detectVersion(candidate.title, candidate.album).version;
  if (catalogVersion === "original" && candVersion !== "original") {
    breakdown.versionPenalty = VERSION_PENALTIES[candVersion];
  } else if (catalogVersion !== "original") {
    breakdown.versionBonus = candVersion === catalogVersion ? VERSION_MATCH_BONUS : 0;
    if (candVersion !== catalogVersion) breakdown.versionPenalty = -15;
  }

  // V3 §3/§6 — FULL-LENGTH VALIDATION. A preview is not a playback source:
  // it can never be the auto-played `best` (see rankCandidates). It stays
  // in alternatives with an honest verdict for the source sheet.
  const verdict = validateFullLength(catalog, candidate);

  let score = breakdown.isrc + breakdown.title + breakdown.artist + breakdown.duration + breakdown.album;
  score += breakdown.versionBonus + breakdown.versionPenalty;

  // Popularity tiebreaker (0…4 pts) — among equal scores, the more-played
  // upload is likelier the canonical one. Never decisive on its own.
  if (candidate.popularity && candidate.popularity > 0) {
    const pop = Math.log10(Math.max(1, candidate.popularity));
    score += Math.max(0, Math.min(4, pop));
  }

  return {
    ...candidate,
    score: Math.round(score),
    confidence: Math.max(0, Math.min(1, score / 100)),
    isFullLength: verdict.isFullLength,
    fullLengthReason: verdict.reason,
    breakdown,
    version: candVersion,
  };
}

/**
 * Rank candidates against a catalog track.
 * V3 §6: `best` is chosen ONLY among FULL-LENGTH candidates above the
 * threshold — previews are structurally excluded from auto-play.
 * Returns best + alternatives (previews included, flagged, for the sheet).
 */
export function rankCandidates(catalog: CatalogTrack, candidates: PlaybackCandidate[]): ResolveResult {
  const scored = candidates
    .map((c) => scoreCandidate(catalog, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (scored.length === 0) {
    return { best: null, alternatives: [], confidence: 0, lowConfidence: false };
  }

  // Full-length candidates only — the normal play path never picks a preview.
  const fullLength = scored.filter((c) => c.isFullLength);
  const best = fullLength[0];
  const ok = !!best && best.confidence >= AUTO_PLAY_THRESHOLD;
  return {
    best: ok ? best : null,
    alternatives: scored,
    confidence: best ? best.confidence : scored[0].confidence,
    lowConfidence: !ok,
  };
}

/* ── Match cache ───────────────────────────────────────────────────── */

export interface MatchCacheEntry {
  /** Resolved best candidate (null when no confident match). */
  best: ScoredCandidate | null;
  /** Raw resolve result for alternatives. */
  result: ResolveResult;
  /** ISO timestamp of resolution. */
  resolvedAt: string;
  /** Provider the match came from. */
  source: string;
  /** Cache key (catalogProvider:catalogId). */
  key: string;
  /** Expiry (epoch ms). */
  expiresAt: number;
}

const MATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — ids are stable
const MAX_CACHE = 500;

const matchCache = new Map<string, MatchCacheEntry>();

export function matchCacheKey(catalogProvider: string, catalogId: string): string {
  return `${catalogProvider}:${catalogId}`;
}

export function getCachedMatch(catalogProvider: string, catalogId: string): MatchCacheEntry | null {
  const key = matchCacheKey(catalogProvider, catalogId);
  const e = matchCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    matchCache.delete(key);
    return null;
  }
  return e;
}

export function setCachedMatch(
  catalogProvider: string,
  catalogId: string,
  best: ScoredCandidate | null,
  result: ResolveResult,
  source: string,
): MatchCacheEntry {
  const key = matchCacheKey(catalogProvider, catalogId);
  const entry: MatchCacheEntry = {
    best,
    result,
    resolvedAt: new Date().toISOString(),
    source,
    key,
    expiresAt: Date.now() + MATCH_TTL_MS,
  };
  // Simple LRU trim.
  if (matchCache.size >= MAX_CACHE) {
    const oldest = matchCache.keys().next().value;
    if (oldest) matchCache.delete(oldest);
  }
  matchCache.set(key, entry);
  return entry;
}

export function clearMatchCache(): void {
  matchCache.clear();
}

export function matchCacheSize(): number {
  return matchCache.size;
}
