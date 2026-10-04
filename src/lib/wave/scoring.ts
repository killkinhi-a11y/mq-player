/**
 * Wave candidate scoring (§7).
 *
 * score =
 *   tasteAffinity + seedSimilarity + artistAffinity + genreAffinity
 *   + completionAffinity + recentPositiveSignal + explorationBonus
 *   + noveltyBonus
 *   − recentTrackPenalty − artistFatigue − genreFatigue
 *   − repeatedArtistPenalty − recentSkipPenalty
 *
 * Every contribution is recorded in `breakdown` so reasons stay HONEST
 * (§15, §36): the chosen reason is derived from the signals that actually
 * lifted the score — never synthesized.
 */

import type {
  CandidateChannel,
  ScoredCandidate,
  TasteLayer,
  WaveCandidate,
  WaveMemory,
  WaveProfile,
  WaveReason,
  WaveSeed,
  WaveTrackMinimal,
} from "./types";
import type { WaveConfig } from "./config";
import type { WaveRng } from "./rng";
import { mergedAffinity, normArtist, normGenre } from "./profile";
import { artistAppearanceCount } from "./memory";

export interface ScoreContext {
  profile: WaveProfile;
  seed: WaveSeed | null;
  memory: WaveMemory;
  config: WaveConfig;
  rng: WaveRng;
  /** Track ids recently played outside the wave (client history slice). */
  recentHistoryTrackIds?: Set<string>;
  /** Artists the user skipped recently (from trackFeedback/session). */
  skippedArtists?: Set<string>;
  skippedGenres?: Set<string>;
  /** Artist counts already committed inside the batch being built. */
  batchArtistCounts?: Map<string, number>;
  language?: "russian" | "english" | "mixed";
  now: number;
  /** Engine-internal: precomputed merged affinity (perf — computed once per batch). */
  _affinity?: ReturnType<typeof mergedAffinity>;
}

/** Detect track language (same heuristic as the profile builder). */
function trackLanguage(track: WaveTrackMinimal): "russian" | "english" | "other" {
  const text = `${track.title || ""} ${track.artist || ""}`;
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cyr + lat;
  if (total === 0) return "other";
  if (cyr / total > 0.4) return "russian";
  if (lat / total > 0.6) return "english";
  return "other";
}

/**
 * Score ONE candidate. Pure given (candidate, ctx) — the only randomness
 * is the seeded jitter drawn from ctx.rng (deterministic mode, §23).
 */
export function scoreCandidate<T extends WaveTrackMinimal>(
  candidate: WaveCandidate<T>,
  ctx: ScoreContext,
): ScoredCandidate<T> {
  const { config, profile, seed, memory, rng } = ctx;
  const S = config.scoring;
  const track = candidate.track;
  const artist = normArtist(track.artist);
  const genre = normGenre(track.genre);
  const affinity = ctx._affinity ?? mergedAffinity(profile, config);
  const breakdown: Record<string, number> = {};

  /* ── Taste affinity (merged 4-layer profile) ── */
  const artistAff = artist ? (affinity.artists[artist] || 0) : 0;
  const genreAff = genre ? (affinity.genres[genre] || 0) : 0;
  const trackAff = affinity.tracks[track.id] || 0;
  if (artistAff > 0) breakdown.tasteArtistAffinity = artistAff * S.tasteArtistAffinity;
  if (genreAff > 0) breakdown.tasteGenreAffinity = genreAff * S.tasteGenreAffinity;
  if (trackAff > 0) breakdown.tasteTrackAffinity = trackAff * S.tasteTrackAffinity;
  if (artistAff < 0) breakdown.tasteArtistAversion = artistAff * S.tasteArtistAffinity;
  if (genreAff < 0) breakdown.tasteGenreAversion = genreAff * S.tasteGenreAffinity;

  /* ── Seed similarity (channel-based, honest attribution) ── */
  const seedArtist = normArtist(seed?.artist);
  const seedGenre = normGenre(seed?.genre);
  if (candidate.channel === "similar_track") breakdown.seedSimilarityTrack = S.seedSimilarityTrack;
  if (candidate.channel === "similar_artist") breakdown.seedSimilarityArtist = S.seedSimilarityArtist;
  if (seedArtist && artist === seedArtist) breakdown.seedArtistMatch = S.seedSimilarityArtist * 0.4;
  if (seedGenre && genre && genre === seedGenre) breakdown.seedGenreMatch = S.seedGenreMatch;

  /* ── Explicit favorites (hard signals) ── */
  if (artist && profile.longTerm.artists[artist] >= 0.3) breakdown.favoriteArtist = S.favoriteArtistBonus;
  if (genre && profile.longTerm.genres[genre] >= 0.25) breakdown.favoriteGenre = S.favoriteGenreBonus;

  /* ── Completion affinity (§4 — artists the user finishes) ── */
  if (artist && artistAff > 0.15) {
    const mediumArtist = profile.mediumTerm.artists[artist] || 0;
    if (mediumArtist > 0.3) breakdown.completionAffinity = S.completionAffinity * Math.min(1, mediumArtist);
  }

  /* ── Recent positive session signal (§11) ── */
  const sessionArtist = artist ? (profile.session.artists[artist] || 0) : 0;
  if (sessionArtist > 0.2) breakdown.recentPositiveSignal = sessionArtist * S.completionAffinity;

  /* ── more_like_this boost (§17 — stronger than a like) ── */
  const boostedArtist = artist && profile.boost.artists.includes(artist);
  const boostedGenre = genre && profile.boost.genres.includes(genre);
  if (boostedArtist) breakdown.boosted = S.boostedBonus;
  else if (boostedGenre) breakdown.boosted = S.boostedBonus * 0.6;

  /* ── less_like_this / not_interested suppression (§18) ── */
  const suppressedArtist = artist && profile.suppress.artists.includes(artist);
  const suppressedGenre = genre && profile.suppress.genres.includes(genre);
  if (suppressedArtist) breakdown.suppressed = -S.suppressedPenalty;
  else if (suppressedGenre) breakdown.suppressed = -S.suppressedPenalty * 0.6;

  /* ── Novelty + exploration (§9, §38) ── */
  const seenArtist =
    artist &&
    (artist in affinity.artists ||
      profile.recentArtists.includes(artist) ||
      memory.artists.some((e) => e.value === artist));
  const isExplorationChannel = candidate.channel === "exploration";
  if (!seenArtist) breakdown.novelty = S.noveltyBonus;
  if (isExplorationChannel) breakdown.exploration = S.explorationBonus;

  /* ── Quality priors ── */
  if (track.scIsFull) breakdown.playability = S.playabilityBonus;
  if (track.cover) breakdown.cover = S.coverBonus;
  if (ctx.language && ctx.language !== "mixed") {
    const tl = trackLanguage(track);
    if (tl === ctx.language) breakdown.languageMatch = S.languageMatch;
  }
  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 360) breakdown.durationSweetSpot = S.durationSweetSpot;
  if (track.playbackCount && track.playbackCount > 100000) breakdown.popularity = S.popularityBonus;

  /* ── Fatigue / penalties (§8) ── */
  // Track already played by the wave → near-hard penalty (dup protection).
  const recentlyPlayed = memory.tracks.some((e) => e.value === track.id);
  if (recentlyPlayed) breakdown.recentTrackPenalty = -S.recentTrackPenalty;
  // Played outside the wave recently (client history) → softer penalty.
  else if (ctx.recentHistoryTrackIds?.has(track.id)) breakdown.recentTrackPenalty = -S.recentTrackPenalty * 0.5;

  const appearances = artist ? artistAppearanceCount(memory, artist, config.fatigue.artistRecentWindow) : 0;
  if (appearances > 0) breakdown.artistFatigue = -S.artistFatigue * appearances;
  // Liked artists fatigue slower (favourites stay strong — §8 note).
  if (appearances > 0 && artist && (profile.longTerm.artists[artist] || 0) >= 0.5) {
    breakdown.artistFatigue *= 0.35;
  }

  const genreAppearances = genre ? memory.genres.slice(0, config.fatigue.artistRecentWindow).filter((e) => e.value === genre).length : 0;
  if (genreAppearances >= 2) breakdown.genreFatigue = -S.genreFatigue * (genreAppearances - 1);

  const batchCount = artist ? (ctx.batchArtistCounts?.get(artist) || 0) : 0;
  if (batchCount >= 1) breakdown.repeatedArtistPenalty = -S.repeatedArtistPenalty * batchCount;

  if (artist && ctx.skippedArtists?.has(artist)) breakdown.recentSkipPenalty = -S.recentSkipPenalty;
  if (genre && ctx.skippedGenres?.has(genre)) breakdown.recentSkipPenalty = -S.recentSkipPenalty * 0.7;
  // Very early skips recorded this session → extra-strong penalty (§4).
  const earlySkipped = artist && (profile.suppress.artists.includes(artist) || (sessionArtist < -0.3));
  if (earlySkipped) breakdown.strongSkipPenalty = -S.strongSkipPenalty * 0.5;

  /* ── Seeded jitter (variety, deterministic §23) ── */
  if (S.maxJitter > 0) breakdown.jitter = rng.next() * 2 * S.maxJitter - S.maxJitter;

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    track,
    score,
    reason: selectReason(candidate, breakdown, ctx),
    channel: candidate.channel,
    seedRef: candidate.seedRef,
    exploration: isExplorationChannel,
    breakdown,
  };
}

/**
 * Honest reason selection (§15, §36): map the candidate to the reason that
 * reflects the REAL dominant signal. Channel provides the base
 * attribution; a stronger concrete signal can override it, but we never
 * invent reasons that have no signal behind them.
 */
function selectReason<T extends WaveTrackMinimal>(
  candidate: WaveCandidate<T>,
  breakdown: Record<string, number>,
  ctx: ScoreContext,
): WaveReason {
  const channel: Record<CandidateChannel, WaveReason> = {
    similar_track: "similar_track",
    similar_artist: "similar_artist",
    taste: "taste_profile",
    recent_favorites: "favorite_artist",
    recent_listening: "recent_listening",
    exploration: "exploration",
  };
  let reason = channel[candidate.channel];

  // Overrides — only when the concrete signal is actually present.
  if (breakdown.boosted) {
    // more_like_this → the closest sound (§17)
    reason = breakdown.seedSimilarityTrack ? "similar_track" : "taste_profile";
  } else if (breakdown.favoriteArtist && (breakdown.favoriteArtist || 0) >= ctx.config.scoring.favoriteArtistBonus) {
    reason = "favorite_artist";
  } else if (reason === "taste_profile" &&
    !(breakdown.tasteArtistAffinity > 0) &&
    (breakdown.tasteGenreAffinity || 0) > 0
  ) {
    reason = "favorite_genre";
  } else if (candidate.channel === "recent_favorites" && !(breakdown.favoriteArtist > 0)) {
    reason = "similar_track"; // related to a liked track — honest wording
  } else if (reason === "exploration" && breakdown.favoriteArtist) {
    reason = "favorite_artist"; // exploration channel surfaced a favourite
  }
  return reason;
}

/**
 * Effective exploration rate for the profile (§9):
 * low confidence (cold start) → coldStartRate; confident → baseRate.
 */
export function effectiveExplorationRate(profile: WaveProfile, config: WaveConfig): number {
  const { baseRate, coldStartRate, confidenceThreshold } = config.exploration;
  const c = Math.min(1, Math.max(0, profile.confidence));
  if (c >= confidenceThreshold) return baseRate;
  const t = c / Math.max(0.01, confidenceThreshold);
  return coldStartRate + (baseRate - coldStartRate) * t;
}

export type { TasteLayer };
