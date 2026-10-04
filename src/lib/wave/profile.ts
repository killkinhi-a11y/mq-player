/**
 * Wave taste profile (§3, §19, §20, §28).
 *
 * EXTENDS the existing MQ taste infrastructure (lib/tasteProfile.ts —
 * sanitizeGenre, language detection) rather than duplicating it. The
 * existing extractTasteProfile stays untouched for its consumers; the
 * Wave profile is a richer, four-layer structure built from the same
 * store signals.
 *
 * Layers (§20 — recency separation):
 *   longTerm   — explicit likes, taste sliders, disliked artists
 *   mediumTerm — history[0..100], playCount-weighted, 14d half-life
 *   recent     — history[0..25], 2d half-life
 *   session    — live wave events only (highest weight at scoring time)
 *
 * All values are normalized to −1..1. Session weight > recent > medium >
 * long (see mergedAffinity) but the long-term layer is never dropped.
 */

import { sanitizeGenre } from "@/lib/tasteProfile";
import type { Track } from "@/lib/musicApi";
import type { TasteLayer, WaveEvent, WaveProfile, WaveProfileInput } from "./types";
import type { WaveConfig } from "./config";
import { eventSignal } from "./events";

const EMPTY_LAYER: TasteLayer = { artists: {}, genres: {}, tracks: {} };

function cloneLayer(l: TasteLayer): TasteLayer {
  return { artists: { ...l.artists }, genres: { ...l.genres }, tracks: { ...l.tracks } };
}

/** Clamp to −1..1 — all layer values live in this range. */
export function clampAffinity(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(-1, v));
}

function bump(layer: TasteLayer, kind: "artists" | "genres" | "tracks", key: string, delta: number) {
  if (!key) return;
  layer[kind][key] = clampAffinity((layer[kind][key] || 0) + delta);
}

/** Exponential recency decay: 1.0 now → 0.5 at halfLifeMs. */
function recencyWeight(playedAt: number, now: number, halfLifeMs: number): number {
  if (!Number.isFinite(playedAt) || playedAt <= 0) return 0.5;
  const age = Math.max(0, now - playedAt);
  return Math.pow(0.5, age / halfLifeMs);
}

/** Normalize an artist name for matching (lowercase, trimmed). */
export function normArtist(a: string | undefined | null): string {
  return (a || "").toLowerCase().trim();
}

/** Normalize a genre via the existing sanitizer (single source of truth). */
export function normGenre(g: string | undefined | null): string | null {
  return sanitizeGenre(g);
}

/**
 * Build the full four-layer profile from store signals + session events.
 * Pure: no side effects, deterministic given inputs (Date.now only used
 * when `now` is not provided — callers pass `now` for determinism).
 */
export function buildWaveProfile(input: WaveProfileInput, config: WaveConfig): WaveProfile {
  const now = input.now ?? Date.now();
  const history = Array.isArray(input.history) ? input.history : [];
  const liked = Array.isArray(input.likedTracksData) ? input.likedTracksData : [];
  const disliked = Array.isArray(input.dislikedTracksData) ? input.dislikedTracksData : [];
  const favoriteArtists = (input.favoriteArtists || []).map((a) => normArtist(a.username)).filter(Boolean);

  /* ── Long-term layer: explicit signals (stable, §28) ── */
  const longTerm: TasteLayer = { artists: {}, genres: {}, tracks: {} };
  for (const t of liked) {
    const artist = normArtist(t.artist);
    const genre = normGenre(t.genre);
    const trackId = t.id;
    if (artist) bump(longTerm, "artists", artist, 0.35);
    if (genre) bump(longTerm, "genres", genre, 0.25);
    if (trackId) bump(longTerm, "tracks", trackId, 0.6);
  }
  // Taste sliders (0..100) → 0..1, like threshold matches the existing profile
  for (const [g, v] of Object.entries(input.tasteGenres || {})) {
    const genre = normGenre(g);
    if (genre && v >= 20) bump(longTerm, "genres", genre, Math.min(1, v / 100) * 0.5);
  }
  for (const [a, v] of Object.entries(input.tasteArtists || {})) {
    const artist = normArtist(a);
    if (artist && v >= 20) bump(longTerm, "artists", artist, Math.min(1, v / 100) * 0.5);
  }
  for (const artist of favoriteArtists) {
    bump(longTerm, "artists", artist, 0.5);
  }
  // Dislikes are strong long-term negatives
  for (const t of disliked) {
    const artist = normArtist(t.artist);
    const genre = normGenre(t.genre);
    if (artist) bump(longTerm, "artists", artist, -0.5);
    if (genre) bump(longTerm, "genres", genre, -0.35);
    if (t.id) bump(longTerm, "tracks", t.id, -0.8);
  }

  /* ── Medium-term layer: history depth, playCount-weighted (14d half-life) ── */
  const mediumTerm: TasteLayer = { artists: {}, genres: {}, tracks: {} };
  for (const h of history.slice(0, 100)) {
    const w = recencyWeight(h.playedAt, now, 14 * 24 * 60 * 60 * 1000) * Math.min(3, Math.max(1, h.playCount || 1)) * 0.18;
    const artist = normArtist(h.track?.artist);
    const genre = normGenre(h.track?.genre);
    if (artist) bump(mediumTerm, "artists", artist, w);
    if (genre) bump(mediumTerm, "genres", genre, w * 0.8);
    if (h.track?.id) bump(mediumTerm, "tracks", h.track.id, w * 0.7);
  }

  /* ── Recent layer: last 25 plays, 2d half-life — what's hot right now ── */
  const recent: TasteLayer = { artists: {}, genres: {}, tracks: {} };
  for (const h of history.slice(0, 25)) {
    const w = recencyWeight(h.playedAt, now, 2 * 24 * 60 * 60 * 1000) * 0.35;
    const artist = normArtist(h.track?.artist);
    const genre = normGenre(h.track?.genre);
    if (artist) bump(recent, "artists", artist, w);
    if (genre) bump(recent, "genres", genre, w * 0.8);
    if (h.track?.id) bump(recent, "tracks", h.track.id, w * 0.6);
  }

  /* ── Feedback layer integration: trackFeedback skips/completes (§4) ── */
  // trackFeedback is long-living per-track data → folds into longTerm.
  for (const [trackId, fb] of Object.entries(input.trackFeedback || {})) {
    const total = (fb.skips || 0) + (fb.completes || 0);
    if (total < 1) continue;
    // Skip positions < 10% count extra-negative (early skips).
    const earlySkips = (fb.skipPositions || []).filter((p) => p < 15).length;
    const net = (fb.completes || 0) - (fb.skips || 0) - earlySkips * 0.5;
    const strength = Math.min(1, Math.abs(net) / Math.max(2, total));
    bump(longTerm, "tracks", trackId, net >= 0 ? strength * 0.4 : -strength * 0.5);
  }

  /* ── Session layer: live wave events (§11, §19) ── */
  const session = buildSessionLayer(input.sessionEvents || [], config);

  /* ── Derived fields ── */
  const recentArtists: string[] = [];
  for (const h of history.slice(0, 15)) {
    const a = normArtist(h.track?.artist);
    if (a && !recentArtists.includes(a)) recentArtists.push(a);
  }
  const recentTracks = history.slice(0, 20).map((h) => h.track?.id).filter(Boolean) as string[];

  // Language — reuse the existing heuristic (cyrillic vs latin ratio).
  const language = detectLanguageFromTracks([...liked.slice(0, 30), ...history.slice(0, 30).map((h) => h.track)]);

  /* ── Confidence → exploration rate (§9, §10) ── */
  const signalCount = liked.length * 2 + history.length + (input.sessionEvents || []).length * 0.5;
  const confidence = Math.min(1, signalCount / config.coldStart.minSignalsForConfidence);

  return {
    longTerm,
    mediumTerm,
    recent: { ...recent },
    session,
    recentArtists,
    recentTracks,
    language,
    confidence,
    boost: { artists: [], genres: [] },
    suppress: { artists: [], genres: [] },
  };
}

/** Session taste layer from live events — most recent events weigh more. */
export function buildSessionLayer(events: WaveEvent[], config: WaveConfig): TasteLayer {
  const layer: TasteLayer = { artists: {}, genres: {}, tracks: {} };
  // Iterate oldest → newest so later events accumulate on top; cap the log.
  for (const ev of events.slice(-config.feedback.maxSessionEvents)) {
    const signal = eventSignal(ev, config);
    if (!signal) continue;
    const signed = signal.kind === "negative" ? -signal.strength : signal.strength;
    const artist = normArtist(ev.artist);
    const genre = normGenre(ev.genre);
    if (artist) bump(layer, "artists", artist, signed);
    if (genre) bump(layer, "genres", genre, signed * 0.8);
    if (ev.trackId) bump(layer, "tracks", ev.trackId, signed * 0.7);
  }
  return layer;
}

/**
 * Apply one live event to a profile immutably (real-time personalization,
 * §11). Returns a NEW profile — the input is never mutated.
 */
export function applySessionEvent(profile: WaveProfile, event: WaveEvent, config: WaveConfig): WaveProfile {
  const session = cloneLayer(profile.session);
  const signal = eventSignal(event, config);
  if (signal) {
    const signed = signal.kind === "negative" ? -signal.strength : signal.strength;
    const artist = normArtist(event.artist);
    const genre = normGenre(event.genre);
    if (artist) bump(session, "artists", artist, signed);
    if (genre) bump(session, "genres", genre, signed * 0.8);
    if (event.trackId) bump(session, "tracks", event.trackId, signed * 0.7);
  }

  const boost = { artists: [...profile.boost.artists], genres: [...profile.boost.genres] };
  const suppress = { artists: [...profile.suppress.artists], genres: [...profile.suppress.genres] };
  const artist = normArtist(event.artist);
  const genre = normGenre(event.genre);

  if (event.type === "more_like_this") {
    // §17 — stronger than a like: boost artist + genre, keep bounded.
    if (artist && !boost.artists.includes(artist)) boost.artists.push(artist);
    if (genre && !boost.genres.includes(genre)) boost.genres.push(genre);
  }
  if (event.type === "less_like_this" || event.type === "not_interested") {
    // §18 — suppress the feature cluster, never destroy long-term taste.
    if (artist && !suppress.artists.includes(artist)) suppress.artists.push(artist);
    if (genre && !suppress.genres.includes(genre)) suppress.genres.push(genre);
  }

  return { ...profile, session, boost, suppress };
}

/**
 * Layer weights (§20): session > recent > medium > long.
 * Session gets the extra multiplier from config (§19 — "session taste has
 * higher weight than long-term").
 */
export function layerWeights(config: WaveConfig): { longTerm: number; mediumTerm: number; recent: number; session: number } {
  return {
    longTerm: 0.5,
    mediumTerm: 0.6,
    recent: 1.0,
    session: config.scoring.sessionAffinityMultiplier,
  };
}

/**
 * Merge all layers into one effective affinity map per kind.
 * Values stay in −1..1. This is what scoring reads.
 */
export function mergedAffinity(profile: WaveProfile, config: WaveConfig): {
  artists: Record<string, number>;
  genres: Record<string, number>;
  tracks: Record<string, number>;
} {
  const w = layerWeights(config);
  const out = {
    artists: {} as Record<string, number>,
    genres: {} as Record<string, number>,
    tracks: {} as Record<string, number>,
  };
  const merge = (kind: keyof TasteLayer) => {
    const layers: Array<[TasteLayer, number]> = [
      [profile.longTerm, w.longTerm],
      [profile.mediumTerm, w.mediumTerm],
      [profile.recent, w.recent],
      [profile.session, w.session],
    ];
    for (const [layer, weight] of layers) {
      for (const [key, value] of Object.entries(layer[kind])) {
        out[kind][key] = clampAffinity((out[kind][key] || 0) + value * weight);
      }
    }
  };
  merge("artists");
  merge("genres");
  merge("tracks");
  return out;
}

/** Language preference from track texts (same heuristic as lib/tasteProfile). */
export function detectLanguageFromTracks(tracks: Array<Track | undefined>): "russian" | "english" | "mixed" {
  let russian = 0;
  let english = 0;
  for (const t of tracks) {
    if (!t) continue;
    const text = `${t.title || ""} ${t.artist || ""}`;
    const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
    const lat = (text.match(/[a-zA-Z]/g) || []).length;
    const total = cyr + lat;
    if (total === 0) continue;
    if (cyr / total > 0.4) russian++;
    else if (lat / total > 0.6) english++;
  }
  if (russian > 5 && russian > english) return "russian";
  if (english > 5 && english > russian) return "english";
  return "mixed";
}

export { EMPTY_LAYER };
