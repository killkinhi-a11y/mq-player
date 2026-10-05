/**
 * Shared handler for /api/wave and /api/wave/next.
 *
 * Full pipeline (§2):
 *   resolve user (server-side) → merge client signals + server taste
 *   → fetch candidates from channels → pure engine (score/diversity/explore)
 *   → user-scoped cache → response with honest reasons + observability meta.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SCTrack } from "@/lib/soundcloud";
import {
  getWaveRecommendations,
  buildWaveProfile,
  createWaveMemory,
  countClusterAffinity,
  detectCulturalCluster,
  type WaveSignals,
  type WaveProfile,
  type WaveEvent,
} from "@/lib/wave";
import { WAVE_CONFIG } from "@/lib/wave/config";
import {
  resolveWaveUser,
  fetchWaveCandidates,
  getServerTaste,
  waveCacheGet,
  waveCacheSet,
  waveCacheKey,
  scoredToTrackPayload,
} from "@/lib/wave/server";

export interface WaveHandlerResult {
  sessionId: string;
  seed: import("./types").WaveSeed | null;
  tracks: Array<Record<string, unknown>>;
  reasons: string[];
  meta: Record<string, unknown>;
  cached?: boolean;
}

/** Deterministic profile-version string for cache keys (§22). */
function profileVersion(signals: WaveSignals, serverTaste: { artists: Record<string, number>; genres: Record<string, number> }): string {
  const artistKeys = Object.keys(serverTaste.artists).sort().join(",");
  const genreKeys = Object.keys(serverTaste.genres).sort().join(",");
  const eventCount = (signals.sessionEvents || []).length;
  return `v1.${(signals.likedArtists || []).length}.${(signals.historyScIds || []).length}.${eventCount}.${artistKeys.length}.${genreKeys.length}`;
}

/** Context hash — everything that must differ → different cache entry. */
function contextHash(signals: WaveSignals): string {
  const parts = [
    (signals.excludeIds || []).length,
    (signals.excludeScIds || []).length,
    (signals.recentWaveArtists || []).slice(0, 10).join(","),
    (signals.recentWaveGenres || []).slice(0, 6).join(","),
    (signals.recentWaveTrackIds || []).length,
    (signals.sessionEvents || []).slice(-6).map((e) => `${e.type}:${e.trackId}`).join(","),
  ];
  return parts.join("|");
}

/**
 * Merge client session events + server-side taste store into the profile
 * the engine scores with (§29 — server store supplements, never replaces,
 * the client profile).
 *
 * V2 (PART 8/9): history artists/genres now feed the RECENT layer (the last
 * 10–20 plays define the live mood — weight 1.0 vs medium 0.6), and
 * likedTexts/historyTexts build the personalized cultural-cluster map.
 */
function buildMergedProfile(signals: WaveSignals, serverTaste: ReturnType<typeof getServerTaste>): WaveProfile {
  const sessionEvents = signals.sessionEvents || [];
  const profile = buildWaveProfile(
    {
      likedTracksData: [],
      history: [],
      tasteGenres: Object.fromEntries((signals.tasteGenres || []).map((g) => [g, 100])),
      tasteArtists: Object.fromEntries((signals.tasteArtists || []).map((a) => [a, 100])),
      sessionEvents,
      // V2: compact texts → cultural cluster affinity (PART 8).
      likedTexts: signals.likedTexts,
      historyTexts: signals.historyTexts,
    },
    WAVE_CONFIG,
  );

  // Layer the client's compact signals into the appropriate layers.
  const longArtists: Record<string, number> = { ...profile.longTerm.artists };
  for (const a of signals.likedArtists || []) {
    const key = a.toLowerCase().trim();
    if (key) longArtists[key] = Math.max(longArtists[key] || 0, 0.5);
  }
  const longGenres: Record<string, number> = { ...profile.longTerm.genres };
  for (const g of signals.likedGenres || []) {
    const key = g.toLowerCase().trim();
    if (key) longGenres[key] = Math.max(longGenres[key] || 0, 0.35);
  }
  for (const a of signals.dislikedArtists || []) {
    const key = a.toLowerCase().trim();
    if (key) longArtists[key] = Math.min(longArtists[key] || 0, -0.5);
  }
  // V2 (PART 9): the first 8 history artists/genres are the LIVE context →
  // recent layer; the tail goes to medium as before.
  const recentArtists: Record<string, number> = { ...profile.recent.artists };
  const recentGenres: Record<string, number> = { ...profile.recent.genres };
  const mediumArtists: Record<string, number> = { ...profile.mediumTerm.artists };
  const mediumGenres: Record<string, number> = { ...profile.mediumTerm.genres };
  (signals.historyArtists || []).forEach((a, i) => {
    const key = a.toLowerCase().trim();
    if (!key) return;
    if (i < 8) recentArtists[key] = Math.max(recentArtists[key] || 0, 0.4);
    else mediumArtists[key] = Math.max(mediumArtists[key] || 0, 0.3);
  });
  (signals.historyGenres || []).forEach((g, i) => {
    const key = g.toLowerCase().trim();
    if (!key) return;
    if (i < 8) recentGenres[key] = Math.max(recentGenres[key] || 0, 0.3);
    else mediumGenres[key] = Math.max(mediumGenres[key] || 0, 0.25);
  });

  // V2 (PART 8): cultural clusters from compact texts (likes weigh ×2).
  const clusters: Record<string, number> = { ...profile.clusters };
  for (const [c, n] of Object.entries(countClusterAffinity(signals.likedTexts || [], 2))) {
    clusters[c] = (clusters[c] || 0) + n;
  }
  for (const [c, n] of Object.entries(countClusterAffinity(signals.historyTexts || [], 1))) {
    clusters[c] = (clusters[c] || 0) + n;
  }
  // Genre-declared clusters (k-pop slider, bollywood likes…).
  for (const g of [...(signals.tasteGenres || []), ...(signals.likedGenres || []), ...(signals.historyGenres || [])]) {
    const cluster = detectGenreCluster(g);
    if (cluster) clusters[cluster] = (clusters[cluster] || 0) + 1;
  }

  // Server-side store → session layer supplement (anonymous persistence).
  const sessionArtists: Record<string, number> = { ...profile.session.artists };
  for (const [a, v] of Object.entries(serverTaste.artists)) {
    sessionArtists[a] = Math.max(-1, Math.min(1, (sessionArtists[a] || 0) + v * 0.5));
  }
  const sessionGenres: Record<string, number> = { ...profile.session.genres };
  for (const [g, v] of Object.entries(serverTaste.genres)) {
    sessionGenres[g] = Math.max(-1, Math.min(1, (sessionGenres[g] || 0) + v * 0.5));
  }

  const boost = {
    artists: [...new Set([...profile.boost.artists, ...serverTaste.boostArtists])],
    genres: [...profile.boost.genres],
  };
  const suppress = {
    artists: [...new Set([...profile.suppress.artists, ...serverTaste.suppressArtists])],
    genres: [...profile.suppress.genres],
    albums: [...profile.suppress.albums],
    clusters: [...profile.suppress.clusters],
  };

  const likedCount = (signals.likedScIds || []).length + (signals.likedArtists || []).length;
  const historyCount = (signals.historyScIds || []).length + (signals.historyArtists || []).length;
  const confidence = Math.min(
    1,
    (likedCount * 2 + historyCount + sessionEvents.length * 0.5) / WAVE_CONFIG.coldStart.minSignalsForConfidence,
  );

  return {
    ...profile,
    longTerm: { ...profile.longTerm, artists: longArtists, genres: longGenres },
    mediumTerm: { ...profile.mediumTerm, artists: mediumArtists, genres: mediumGenres },
    recent: { ...profile.recent, artists: recentArtists, genres: recentGenres },
    session: { artists: sessionArtists, genres: sessionGenres, tracks: profile.session.tracks },
    clusters,
    boost,
    suppress,
    confidence,
    language: signals.language || profile.language,
    recentTracks: signals.recentWaveTrackIds || profile.recentTracks,
  };
}

/** Genre-only cluster detection (compact server path). */
function detectGenreCluster(genre: string): string | null {
  return detectCulturalCluster(null, null, genre);
}

/**
 * V2 (PART 11): a compact sample of gate-REJECTED candidates for the debug
 * meta — id, title, artist, the blocking reason and the missing anchor.
 * Lets us answer “ПОЧЕМУ этот странный трек не попал в Волну” — and, by
 * diffing with served tracks, why another one DID.
 */
function gateRejectedSample(
  result: ReturnType<typeof getWaveRecommendations>,
): Array<Record<string, unknown>> {
  return (result.gate || []).slice(0, 12).map(({ candidate, verdict }) => ({
    id: candidate.track.id,
    title: candidate.track.title,
    artist: candidate.track.artist,
    blockedBy: verdict.blockedBy,
    reason: verdict.reason,
    anchor: verdict.anchor,
    score: Math.round(candidate.score),
    finalScore: candidate.relevance?.finalScore ?? null,
  }));
}

/** Rebuild a lightweight wave memory from the client's compact signals. */
function memoryFromSignals(signals: WaveSignals) {
  const now = Date.now();
  let memory = createWaveMemory();
  for (const id of (signals.recentWaveTrackIds || []).slice(0, WAVE_CONFIG.memory.maxTracks)) {
    memory = {
      ...memory,
      tracks: [{ value: id, at: now }, ...memory.tracks],
    };
  }
  for (const a of (signals.recentWaveArtists || []).slice(0, WAVE_CONFIG.memory.maxArtists)) {
    memory = { ...memory, artists: [{ value: a.toLowerCase().trim(), at: now }, ...memory.artists] };
  }
  for (const g of (signals.recentWaveGenres || []).slice(0, WAVE_CONFIG.memory.maxGenres)) {
    memory = { ...memory, genres: [{ value: g.toLowerCase().trim(), at: now }, ...memory.genres] };
  }
  return memory;
}

export interface RunWaveOptions {
  /** Existing session id (next batch) or null (fresh start). */
  sessionId: string | null;
  signals: WaveSignals;
  bodyAnonId?: string;
}

/**
 * Run the full wave pipeline for a request. Throws nothing — API failures
 * degrade to an empty track list with a graceful meta (§35).
 */
export async function runWave(req: NextRequest, opts: RunWaveOptions): Promise<NextResponse> {
  const { signals, sessionId } = opts;
  const user = await resolveWaveUser(req, opts.bodyAnonId);
  if (!user) {
    return NextResponse.json(
      { error: "Требуется анонимный идентификатор или вход" },
      { status: 401 },
    );
  }

  const seedKey = signals.seed
    ? `${signals.seed.kind}:${signals.seed.scTrackId || signals.seed.artist || signals.seed.genre || "taste"}`
    : "taste";
  const pv = (() => {
    const serverTaste = getServerTaste(user.userId);
    return profileVersion(signals, serverTaste);
  })();
  const ctxHash = contextHash(signals);
  const cacheKey = waveCacheKey(user.userId, seedKey, pv, ctxHash);

  const cached = waveCacheGet<WaveHandlerResult>(cacheKey);
  if (cached && cached.tracks.length > 0) {
    return NextResponse.json({ ...cached, sessionId: sessionId || cached.sessionId, cached: true });
  }

  // ── Server taste supplement (§29) ──
  const serverTaste = getServerTaste(user.userId);

  // ── Candidate generation (§5) — all channels, best-effort ──
  const { candidates, channelStats } = await fetchWaveCandidates({ signals });

  // Graceful degradation: no candidates at all (API down / empty catalog §35).
  if (candidates.length === 0) {
    return NextResponse.json({
      sessionId: sessionId || "local_empty",
      seed: signals.seed || null,
      tracks: [],
      reasons: [],
      meta: {
        candidate_count: 0,
        filtered_count: 0,
        ranked_count: 0,
        exploration_count: 0,
        duplicate_count: 0,
        artist_fatigue_count: 0,
        generation_ms: 0,
        graceful: "no_candidates",
        channels: channelStats,
      },
    });
  }

  // ── Pure engine (§23 deterministic when randomSeed provided) ──
  const profile = buildMergedProfile(signals, serverTaste);
  const memory = memoryFromSignals(signals);

  // Exclude: seed itself, queue, dislikes (via excludeIds) + sc-id based.
  const excludeIds = new Set<string>([
    ...(signals.excludeIds || []),
    ...(signals.seed?.trackId ? [signals.seed.trackId] : []),
  ]);
  const excludeScIds = new Set((signals.excludeScIds || []));
  const filteredCandidates = candidates.filter((c) => {
    if (c.track.scTrackId && excludeScIds.has(c.track.scTrackId)) return false;
    return true;
  });

  const result = getWaveRecommendations<SCTrack>({
    seed: signals.seed || null,
    profile,
    candidates: filteredCandidates,
    memory,
    excludeIds: [...excludeIds],
    randomSeed: signals.randomSeed,
    batchSize: WAVE_CONFIG.output.batchSize,
  });

  // ── Response (§29 shape) ──
  const debug = signals.debug === true;
  const tracks = result.tracks.map((c) =>
    scoredToTrackPayload(debug ? c : { ...c, relevance: undefined }),
  );
  const reasons = result.tracks.map((c) => c.reason);

  const payload: WaveHandlerResult = {
    sessionId: sessionId || "local_" + Date.now().toString(36),
    seed: signals.seed || null,
    tracks,
    reasons,
    meta: {
      ...result.meta,
      channels: channelStats,
      exploration_rate:
        result.meta.ranked_count > 0
          ? Number((result.meta.exploration_count / result.tracks.length).toFixed(2))
          : 0,
      // V2 (PART 11): gate observability — WHO was rejected and WHY (dev).
      ...(debug
        ? { gate_rejected: gateRejectedSample(result) }
        : {}),
    },
  };

  if (tracks.length > 0) {
    waveCacheSet(cacheKey, payload);
  }

  return NextResponse.json(payload);
}

/** All valid wave event types (mirrors types.ts WaveEventType). */
const VALID_EVENT_TYPES = new Set<string>([
  "play_started", "play_progress", "play_completed", "track_replayed",
  "track_skipped", "track_liked", "track_unliked", "track_added_to_playlist",
  "track_added_to_queue", "wave_started", "wave_seed_changed",
  "more_like_this", "less_like_this", "not_interested",
]);

/** Parse + clamp a WaveSignals object from a JSON body (defensive). */
export function parseSignals(body: Record<string, unknown>): WaveSignals {
  const strArr = (v: unknown, max: number): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v.filter((x): x is string => typeof x === "string").slice(0, max);
  };
  const numArr = (v: unknown, max: number): number[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).slice(0, max);
  };
  const events = Array.isArray(body.sessionEvents)
    ? (body.sessionEvents as WaveEvent[]).filter(
        (e) => e && typeof e.type === "string" && VALID_EVENT_TYPES.has(e.type) && typeof e.trackId === "string",
      ).slice(-WAVE_CONFIG.feedback.maxSessionEvents)
    : undefined;
  const seed =
    body.seed && typeof body.seed === "object" && "kind" in body.seed
      ? (body.seed as WaveSignals["seed"])
      : undefined;
  const language =
    body.language === "russian" || body.language === "english" || body.language === "mixed"
      ? body.language
      : undefined;
  return {
    likedArtists: strArr(body.likedArtists, 10),
    likedGenres: strArr(body.likedGenres, 10),
    dislikedArtists: strArr(body.dislikedArtists, 10),
    likedScIds: numArr(body.likedScIds, 5),
    historyScIds: numArr(body.historyScIds, 12),
    historyArtists: strArr(body.historyArtists, 12),
    historyGenres: strArr(body.historyGenres, 12),
    tasteGenres: strArr(body.tasteGenres, 6),
    tasteArtists: strArr(body.tasteArtists, 5),
    language,
    sessionEvents: events,
    excludeIds: strArr(body.excludeIds, 150),
    excludeScIds: numArr(body.excludeScIds, 150),
    recentWaveArtists: strArr(body.recentWaveArtists, 25),
    recentWaveGenres: strArr(body.recentWaveGenres, 15),
    recentWaveTrackIds: strArr(body.recentWaveTrackIds, 60),
    seed,
    // V2 (PART 8): compact texts → cultural cluster affinity. Each entry is
    // "title artist" ≤ 120 chars — no PII beyond what the music already is.
    likedTexts: strArr(body.likedTexts, 12)?.map((t) => t.slice(0, 120)),
    historyTexts: strArr(body.historyTexts, 16)?.map((t) => t.slice(0, 120)),
    randomSeed: typeof body.randomSeed === "number" ? body.randomSeed : undefined,
    debug: body.debug === true,
  };
}
