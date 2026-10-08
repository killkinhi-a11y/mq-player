/**
 * Skip Intelligence — V3 PHASE 24-25.
 *
 * THE principle (user §24): «УЧИТЫВАЙ ТО, ЧТО ПОЛЬЗОВАТЕЛЬ ПРОПУСКАЕТ.
 * Skip — важный recommendation signal.»
 *
 * Event model (§24 — every field the spec demands):
 *   trackId · artistId · albumId · provider · startedAt · skippedAt ·
 *   playedSeconds · duration · completionRatio · skipPosition
 *
 * Weight model (§25 — SECONDS-based, not just fractions):
 *   skip < 10 sec        → strong negative     (−1.0)
 *   10–30 sec            → negative            (−0.7)
 *   30–60 sec            → moderate negative   (−0.45)
 *   ≥60% listened        → weak negative       (−0.25)
 *   ≥90% listened        → almost neutral      (−0.1)
 *   100% (completion)    → positive            (+0.5)
 *   replay               → strong positive     (+0.8)
 *   favorite             → very strong positive (+1.0)
 *
 * Time decay (§25): older events lose weight — exponential half-life
 * (default 14 days): weight × 0.5^(age/halfLife).
 *
 * The model answers the §26 example: loves Travis Scott, but skips
 * Acoustic/Slow/Live variants → artist affinity stays positive while the
 * STYLE tag (versionTag) accumulates the negative. buildSkipProfile()
 * separates artist / genre / style / track penalty channels.
 *
 * Pure logic — no imports; localStorage handled by the store-facing helpers.
 */

/* ── Event model (§24) ──────────────────────────────────────────────── */

export interface SkipEventV3 {
  trackId: string;
  artistId?: string;
  albumId?: string;
  provider?: string;
  /** Catalog attribution (spotify/deezer) — honest signal source. */
  catalogProvider?: string;
  /** Playback attribution (soundcloud/audius/spotify-official). */
  playbackProvider?: string;
  startedAt: number;
  skippedAt: number;
  playedSeconds: number;
  duration: number;
  completionRatio: number;
  skipPosition: number;
  artist: string;
  genre?: string;
  /** Style tag from the resolver (live/acoustic/slowed/…). */
  versionTag?: string;
  kind: "skip" | "complete" | "replay" | "favorite" | "unfavorite";
}

/* ── Classification (§25) ───────────────────────────────────────────── */

export type SkipClass =
  | "strong_negative"
  | "negative"
  | "moderate_negative"
  | "weak_negative"
  | "almost_neutral";

/**
 * Classify a skip by SECONDS PLAYED first, completion second (§25).
 * Returns "completed" when the track effectively finished (≥99.5%),
 * null when the signal is unmeasurable.
 */
export function classifySkipSeconds(playedSeconds: number, duration: number): SkipClass | "completed" | null {
  if (!Number.isFinite(playedSeconds) || playedSeconds < 0) return null;
  const ratio = duration > 0 ? playedSeconds / duration : 0;
  if (ratio >= 0.995) return "completed";
  if (playedSeconds < 10) return "strong_negative";
  if (playedSeconds < 30) return "negative";
  if (playedSeconds < 60) return "moderate_negative";
  if (ratio >= 0.9) return "almost_neutral";
  if (ratio >= 0.6) return "weak_negative";
  if (ratio >= 0.3) return "moderate_negative"; // long listen that still ended early
  return "negative";
}

/** Raw signed weight per class (§25 table). */
export const CLASS_WEIGHTS: Record<SkipClass | "completed", number> = {
  strong_negative: -1.0,
  negative: -0.7,
  moderate_negative: -0.45,
  weak_negative: -0.25,
  almost_neutral: -0.1,
  completed: 0.5,
};

/** Positive events (§25). */
export const POSITIVE_WEIGHTS = {
  replay: 0.8,
  favorite: 1.0,
  unfavorite: -0.6,
  complete: 0.5,
} as const;

/* ── Time decay (§25) ───────────────────────────────────────────────── */

export const DEFAULT_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Exponential decay: 1.0 now → 0.5 at halfLife → 0.25 at 2×halfLife. */
export function timeDecay(eventAt: number, now: number, halfLifeMs = DEFAULT_HALF_LIFE_MS): number {
  if (!Number.isFinite(eventAt) || eventAt <= 0) return 0.5;
  const age = Math.max(0, now - eventAt);
  return Math.pow(0.5, age / halfLifeMs);
}

/** Decayed, clamped signed weight of ONE event. */
export function eventWeight(e: SkipEventV3, now = Date.now(), halfLifeMs = DEFAULT_HALF_LIFE_MS): number {
  const decay = timeDecay(e.skippedAt || e.startedAt, now, halfLifeMs);
  let raw = 0;
  switch (e.kind) {
    case "skip": {
      const cls = classifySkipSeconds(e.playedSeconds, e.duration);
      if (cls === null) return 0;
      raw = cls === "completed" ? POSITIVE_WEIGHTS.complete : CLASS_WEIGHTS[cls];
      break;
    }
    case "complete": raw = POSITIVE_WEIGHTS.complete; break;
    case "replay": raw = POSITIVE_WEIGHTS.replay; break;
    case "favorite": raw = POSITIVE_WEIGHTS.favorite; break;
    case "unfavorite": raw = POSITIVE_WEIGHTS.unfavorite; break;
  }
  return Math.max(-1, Math.min(1, raw * decay));
}

/* ── Skip profile (§26) ─────────────────────────────────────────────── */

export interface SkipProfile {
  /** Artist name (lowercased) → negative/positive affinity −1..1. */
  artists: Record<string, number>;
  /** Genre (lowercased) → affinity −1..1. */
  genres: Record<string, number>;
  /** STYLE tag (live/acoustic/slowed/…) → affinity −1..1. */
  styles: Record<string, number>;
  /** Track id → affinity −1..1. */
  tracks: Record<string, number>;
}

/**
 * Fold decayed event weights into a four-channel profile.
 * Channel separation is what makes «artist positive, style negative»
 * expressible (§26 Travis-Scott example): a skip on an acoustic version
 * hits `styles.acoustic` at full force but `artists.travis scott` at half.
 */
export function buildSkipProfile(events: SkipEventV3[], now = Date.now()): SkipProfile {
  const p: SkipProfile = { artists: {}, genres: {}, styles: {}, tracks: {} };
  for (const e of events) {
    const w = eventWeight(e, now);
    if (w === 0) continue;
    const artist = (e.artist || "").toLowerCase().trim();
    if (artist) {
      // §26 channel separation: a STYLE-tagged skip (live/acoustic/slowed…)
      // is a rejection of the VARIANT, not the artist — it barely touches
      // the artist channel (the style channel takes the hit at full force).
      // Untagged skips still weigh on the artist at half strength.
      const artistFactor = e.kind === "skip" && e.versionTag ? 0.15 : 0.5;
      p.artists[artist] = clampCh(p.artists[artist] || 0) + w * artistFactor;
    }
    const genre = (e.genre || "").toLowerCase().trim();
    if (genre) {
      const genreFactor = e.kind === "skip" && e.versionTag ? 0.2 : 0.4;
      p.genres[genre] = clampCh(p.genres[genre] || 0) + w * genreFactor;
    }
    if (e.versionTag) {
      const style = e.versionTag.toLowerCase().trim();
      p.styles[style] = clampCh(p.styles[style] || 0) + w * 0.9;
    }
    p.tracks[e.trackId] = clampCh(p.tracks[e.trackId] || 0) + w * 0.7;
  }
  for (const ch of ["artists", "genres", "styles", "tracks"] as const) {
    for (const k of Object.keys(p[ch])) p[ch][k] = clampCh(p[ch][k]);
  }
  return p;
}

function clampCh(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/* ── Candidate scoring hook (§27 smart queue) ───────────────────────── */

export interface CandidateSignals {
  trackId?: string;
  artist?: string;
  genre?: string;
  versionTag?: string;
}

/**
 * Skip-based score adjustment for a candidate track (smart queue §27).
 * Negative profile channels push candidates DOWN; positive artists/genres
 * pull UP (familiarity), scaled down by `discovery` (0..1) so the queue
 * can explore. If A, B, C were skipped, near-identical D must score low.
 */
export function skipScoreAdjustment(
  cand: CandidateSignals,
  profile: SkipProfile,
  opts?: { discovery?: number },
): number {
  const discovery = Math.max(0, Math.min(1, opts?.discovery ?? 0.3));
  let adj = 0;
  const artist = (cand.artist || "").toLowerCase().trim();
  if (artist) {
    const a = profile.artists[artist] || 0;
    adj += a < 0 ? a * 3 : a * (1 - discovery) * 2;
  }
  const genre = (cand.genre || "").toLowerCase().trim();
  if (genre) {
    const g = profile.genres[genre] || 0;
    adj += g < 0 ? g * 2 : g * (1 - discovery);
  }
  if (cand.versionTag) {
    const s = profile.styles[cand.versionTag.toLowerCase().trim()] || 0;
    adj += s * 3; // style aversion is the user's clearest instruction
  }
  if (cand.trackId) adj += (profile.tracks[cand.trackId] || 0) * 2;
  return adj;
}

/* ── Persistence (client ring buffer) ───────────────────────────────── */

const LS_KEY = "mq:v3:listeningEvents";
const MAX_EVENTS = 500;

export function loadSkipEvents(): SkipEventV3[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SkipEventV3[]) : [];
  } catch {
    return [];
  }
}

export function saveSkipEvents(events: SkipEventV3[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch { /* private mode / quota — non-fatal */ }
}

export function appendSkipEvent(e: SkipEventV3): SkipEventV3[] {
  const next = [e, ...loadSkipEvents()].slice(0, MAX_EVENTS);
  saveSkipEvents(next);
  return next;
}

/** Build an event from live store state (used by the store actions). */
export function buildSkipEvent(input: {
  track: {
    id: string;
    artist: string;
    genre?: string;
    album?: string;
    duration?: number;
    scTrackId?: number;
    catalogProvider?: string;
    catalogId?: string;
    catalogArtistId?: string;
    playbackProvider?: string;
    versionTag?: string;
  };
  playedSeconds: number;
  duration: number;
  kind: SkipEventV3["kind"];
  startedAt?: number;
  now?: number;
}): SkipEventV3 {
  const now = input.now ?? Date.now();
  const played = Math.max(0, input.playedSeconds);
  const dur = Math.max(0, input.duration || input.track.duration || 0);
  return {
    trackId: input.track.id,
    artistId: input.track.catalogArtistId || undefined,
    albumId: input.track.album || undefined,
    provider: input.track.catalogProvider || input.track.playbackProvider || undefined,
    catalogProvider: input.track.catalogProvider,
    playbackProvider: input.track.playbackProvider,
    startedAt: input.startedAt ?? now - played * 1000,
    skippedAt: now,
    playedSeconds: played,
    duration: dur,
    completionRatio: dur > 0 ? Math.min(1, played / dur) : 0,
    skipPosition: played,
    artist: input.track.artist,
    genre: input.track.genre,
    versionTag: input.track.versionTag,
    kind: input.kind,
  };
}

/** Test hook: profile for an empty event list. */
export function emptySkipProfile(): SkipProfile {
  return { artists: {}, genres: {}, styles: {}, tracks: {} };
}
