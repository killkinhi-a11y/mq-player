/**
 * FINAL RELEVANCE GATE (V2 PART 6) — the last word before the queue.
 *
 *   profile → seed → candidates → hard filters → scoring → diversity →
 *   exploration → ranking → **THIS GATE** → queue
 *
 * PHILOSOPHY (PART 5): RELEVANCE > EXPLORATION. Better 5 perfectly relevant
 * tracks than 5 good ones + 1 piece of garbage. The gate is the answer to
 * "why did this random Hindi rap end up in my wave".
 *
 * A candidate enters the wave ONLY when:
 *   1. it holds at least one POSITIVE ANCHOR — a real, checkable link to
 *      THIS user (artist affinity, genre affinity, track affinity, session
 *      context, favorite artist/genre, seed channel, bridge-genre anchor);
 *   2. it carries NO HARD NEGATIVE — foreign cultural cluster without any
 *      user history for it, suppressed artist (less_like_this), suppressed
 *      cultural cluster, or a disliked artist.
 *
 * Relaxation ladder (§35 graceful degradation — never an infinite loader):
 *   rung 0 — strict: anchor required + no hard negative. Used when the
 *            profile is RICH (enough taste signal to be picky).
 *   rung 1 — cold profile: anchor-less candidates allowed (a brand-new user
 *            must still get music), but hard negatives STILL block. This is
 *            personalization, not a leash.
 *   rung 2 — degenerate pool (only when 0+1 produced NOTHING): best-effort
 *            fill from candidates without hard negatives. Hard negatives
 *            still block — a foreign cluster never slips in through here.
 *
 * The gate NEVER consults quality priors (playability/cover/popularity):
 * those describe the FILE, not the FIT. A perfectly encoded irrelevant track
 * is still irrelevant.
 *
 * Every verdict ships with debug metadata (PART 11): sub-scores, the anchor
 * that held (or the negative that blocked) and a human-readable reason.
 */

import type {
  ScoredCandidate,
  WaveMemory,
  WaveProfile,
  WaveRelevanceDebug,
  WaveTrackMinimal,
} from "./types";
import type { WaveConfig } from "./config";
import { mergedAffinity, normArtist, normGenre } from "./profile";
import { isAdjacentToUserGenre } from "./scoring";
import { DEFAULT_CULTURAL_SPACE, trackCluster } from "./clusters";

export interface GateContext {
  profile: WaveProfile;
  seed: import("./types").WaveSeed | null;
  memory: WaveMemory;
  config: WaveConfig;
  now: number;
  /** Precomputed merged affinity (perf — shared with scoring). */
  affinity?: ReturnType<typeof mergedAffinity>;
}

export interface GateVerdict {
  passed: boolean;
  anchor: string | null;
  /** Machine-readable hard-negative code (null when passed / soft-rejected). */
  blockedBy: "foreign_cluster" | "suppressed_cluster" | "suppressed_artist" | "disliked_artist" | null;
  /** Human-readable reason for the verdict (debug metadata, PART 11). */
  reason: string;
  debug: WaveRelevanceDebug;
}

/** How many distinct positive signals the merged profile actually has. */
export function profileRichness(profile: WaveProfile, config: WaveConfig, affinity?: ReturnType<typeof mergedAffinity>): number {
  const aff = affinity ?? mergedAffinity(profile, config);
  let n = 0;
  for (const v of Object.values(aff.artists)) if (v >= 0.15) n++;
  for (const v of Object.values(aff.genres)) if (v >= 0.15) n++;
  for (const v of Object.values(aff.tracks)) if (v >= 0.15) n++;
  return n;
}

/** True when the user has real history with this cultural cluster. */
export function isOwnCluster(profile: WaveProfile, cluster: string, config: WaveConfig): boolean {
  if (DEFAULT_CULTURAL_SPACE.has(cluster)) return true;
  return (profile.clusters?.[cluster] || 0) >= config.relevance.clusterMinSignals;
}

/**
 * Evaluate ONE candidate against the gate. Pure; deterministic.
 * `coldProfile` (rung 1 semantics) allows anchor-less candidates.
 */
export function evaluateRelevance<T extends WaveTrackMinimal>(
  c: ScoredCandidate<T>,
  ctx: GateContext,
  coldProfile: boolean,
): GateVerdict {
  const { config, profile, seed } = ctx;
  const R = config.relevance;
  const aff = ctx.affinity ?? mergedAffinity(profile, config);
  const track = c.track;
  const artist = normArtist(track.artist);
  const genre = normGenre(track.genre);
  const b = c.breakdown;
  const cluster = trackCluster(track);

  /* ── Sub-scores (PART 11 debug fields) — affinity signals only. ── */
  const artistScore = artist ? (aff.artists[artist] || 0) : 0;
  const genreScore = genre ? (aff.genres[genre] || 0) : 0;
  const trackScore = aff.tracks[track.id] || 0;
  const sessionArtist = artist ? (profile.session.artists[artist] || 0) : 0;
  const sessionGenre = genre ? (profile.session.genres[genre] || 0) : 0;
  const sessionScore = Math.max(sessionArtist, sessionGenre);

  const seedSimilarity =
    (b.seedSimilarityTrack || 0) + (b.seedSimilarityArtist || 0) +
    (b.seedArtistMatch || 0) + (b.seedGenreMatch || 0);
  const favoriteSignal = (b.favoriteArtist || 0) + (b.favoriteGenre || 0);
  const languageScore =
    (b.languageMatch || 0) + (b.clusterMatch || 0) + (b.culturalMismatch || 0);
  const explorationScore =
    (b.explorationAnchored || 0) + (b.exploration || 0) + (b.novelty || 0);
  const negativeScore = -(
    Math.abs(b.suppressed || 0) + Math.abs(b.suppressedAlbum || 0) +
    Math.abs(b.suppressedCluster || 0) + Math.abs(b.recentSkipPenalty || 0) +
    Math.abs(b.strongSkipPenalty || 0) + Math.abs(b.tasteArtistAversion || 0) +
    Math.abs(b.tasteGenreAversion || 0)
  );

  /* ── HARD NEGATIVES — block at every rung (except nothing: even rung 2). ── */
  const seedLinked =
    c.channel === "similar_track" ||
    c.channel === "similar_artist" ||
    (seed?.artist ? artist === normArtist(seed.artist) : false);

  const suppressedArtist = !!artist && profile.suppress.artists.includes(artist);
  const suppressedCluster = !!cluster && (profile.suppress.clusters || []).includes(cluster);
  const clusterIsOwn = cluster ? isOwnCluster(profile, cluster, config) : true;
  const foreignCluster =
    !!cluster && !clusterIsOwn && !DEFAULT_CULTURAL_SPACE.has(cluster) && !seedLinked;
  const dislikedArtist =
    !!artist && (profile.longTerm.artists[artist] || 0) <= R.dislikedArtistThreshold;

  /* ── POSITIVE ANCHORS — at least one must hold (rung 0).
   * V2 PART 10: a FRESH session negative (skip streak on this sound)
   * INVALIDATES the taste/genre anchors for that sound — stale long-term
   * affinity must never outvote three fresh skips. Seed links and known
   * tracks still anchor (the user explicitly chose them). ── */
  const anchorGenre = isAdjacentToUserGenre(genre, aff.genres, config, R.minAnchorGenreAffinity);
  const sessionNegative = sessionArtist <= -0.4 || sessionGenre <= -0.4;
  const anchors: Array<[string, boolean]> = [
    ["artist_affinity", !sessionNegative && artistScore >= R.minArtistAffinity],
    ["genre_affinity", !sessionNegative && genreScore >= R.minGenreAffinity],
    ["track_affinity", trackScore >= R.minTrackAffinity],
    ["favorite_artist", !sessionNegative && (profile.longTerm.artists[artist] || 0) >= 0.3],
    ["favorite_genre", !sessionNegative && (genre ? (profile.longTerm.genres[genre] || 0) >= 0.25 : false)],
    ["session_context", sessionScore >= R.minSessionAffinity],
    ["seed_channel", seedLinked],
    ["seed_genre", !!(seed?.genre && genre && genre === normGenre(seed.genre))],
    ["boosted", !!artist && profile.boost.artists.includes(artist)],
    ["anchored_exploration", c.exploration && !sessionNegative && !!anchorGenre],
  ];
  const held = anchors.find(([, ok]) => ok);
  const anchor = held ? held[0] : null;

  /* ── Verdict ── */
  let passed: boolean;
  let reason: string;
  let blockedBy: GateVerdict["blockedBy"] = null;
  if (foreignCluster) {
    passed = false;
    blockedBy = "foreign_cluster";
    reason = `кластер «${cluster}» не встречается в вашей истории — нерелевантный культурный контекст`;
  } else if (suppressedCluster) {
    passed = false;
    blockedBy = "suppressed_cluster";
    reason = `кластер «${cluster}» скрыт по «меньше такого» в этой сессии`;
  } else if (suppressedArtist) {
    passed = false;
    blockedBy = "suppressed_artist";
    reason = `артист ${track.artist} скрыт по «меньше такого» в этой сессии`;
  } else if (dislikedArtist) {
    passed = false;
    blockedBy = "disliked_artist";
    reason = `артист ${track.artist} в вашем дизлайк-листе`;
  } else if (anchor) {
    passed = true;
    reason = anchor;
  } else if (coldProfile) {
    // Rung 1 — cold profile: give music, not silence. Quality priors are NOT
    // an anchor, but with an empty profile every anchor-less candidate is
    // equally (un)known — the wave must start somewhere (§10).
    passed = true;
    reason = "cold_profile";
  } else {
    passed = false;
    reason = "нет связи с вашим вкусом, историей или контекстом";
  }

  const finalScore =
    artistScore * 3 + genreScore * 2.5 + trackScore * 2 + sessionScore * 2 +
    seedSimilarity / 100 + favoriteSignal / 100 + languageScore / 100 +
    explorationScore / 100 + negativeScore / 100;

  const debug: WaveRelevanceDebug = {
    score: c.score,
    artistScore: round2(artistScore),
    genreScore: round2(genreScore),
    trackScore: round2(trackScore),
    seedSimilarity: round2(seedSimilarity / 100),
    sessionScore: round2(sessionScore),
    languageScore: round2(languageScore / 100),
    explorationScore: round2(explorationScore / 100),
    negativeScore: round2(negativeScore / 100),
    finalScore: round2(finalScore),
    relevancePassed: passed,
    relevanceReason: reason,
    anchor: anchor ?? undefined,
  };

  return { passed, anchor, blockedBy, reason, debug };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface GateResult<T extends WaveTrackMinimal> {
  /** Candidates that passed, in input (ranked) order. */
  kept: ScoredCandidate<T>[];
  /** Rejected in order, with verdicts — observability + tests. */
  rejected: Array<{ candidate: ScoredCandidate<T>; verdict: GateVerdict }>;
  /** Relaxation rung that produced the output (0 strict, 1 cold, 2 degenerate). */
  rung: number;
}

/**
 * Run the gate over a ranked batch (V2 pipeline stage). Applies the
 * relaxation ladder and attaches relevance debug metadata to every kept
 * candidate (always computed — shipping it is the route's choice).
 */
export function applyRelevanceGate<T extends WaveTrackMinimal>(
  ranked: ScoredCandidate<T>[],
  ctx: GateContext,
): GateResult<T> {
  const { config, profile } = ctx;
  const affinity = ctx.affinity ?? mergedAffinity(profile, config);
  const richness = profileRichness(profile, config, affinity);
  const coldProfile = richness < config.relevance.coldProfileRichness;

  /* Rung 0/1 — one pass; hard negatives block, anchors required unless cold. */
  const kept: ScoredCandidate<T>[] = [];
  const rejected: Array<{ candidate: ScoredCandidate<T>; verdict: GateVerdict }> = [];
  for (const c of ranked) {
    const verdict = evaluateRelevance(c, { ...ctx, affinity }, coldProfile);
    if (verdict.passed) {
      kept.push({ ...c, relevance: verdict.debug });
    } else {
      // Attach the debug too — rejected candidates keep their metadata so
      // downstream stages (share-cap promotion) and tests can inspect them.
      rejected.push({ candidate: { ...c, relevance: verdict.debug }, verdict });
    }
  }

  if (kept.length > 0 || !config.relevance.degeneratePoolFallback) {
    return { kept, rejected, rung: coldProfile ? 1 : 0 };
  }

  /* Rung 2 — degenerate pool (§35): the gate left NOTHING. Fill from
   * anchor-less candidates that still have no hard negative. Hard negatives
   * (foreign cluster / suppressed / disliked) keep blocking even here. */
  const softFill: ScoredCandidate<T>[] = [];
  for (const { candidate, verdict } of rejected) {
    if (verdict.blockedBy) continue;
    softFill.push({ ...candidate, relevance: { ...verdict.debug, relevanceReason: "degenerate_pool_fallback" } });
  }
  if (softFill.length > 0) {
    return { kept: softFill, rejected, rung: 2 };
  }
  return { kept, rejected, rung: 2 };
}
