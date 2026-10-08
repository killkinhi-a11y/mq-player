/**
 * FullLengthSourceResolver — V3 PHASE 4/6.
 *
 * Provider capability model + full-length validation.
 *
 * CHAIN (user §45):
 *   CATALOG PROVIDER → NORMALIZED TRACK → SOURCE RESOLVER
 *   → FULL-LENGTH VALIDATION (this file) → PLAYBACK ADAPTER
 *   → PLAYER CONTROLLER → PLAYBACK CLOCK → {WAVE, LYRICS, QUEUE, …}
 *
 * THE RULE (user §3): preview ≠ playback. A candidate that lasts ~30 seconds
 * is REJECTED from the normal play path. It may still be LISTED in the source
 * sheet — honestly labelled "превью" — but never presented as normal play.
 *
 * Validation is pure and honest: no fabrication, every rule derives from
 * observable candidate fields (provider flag, duration, catalog duration).
 */

import type { PlaybackCandidate, CatalogTrack } from "./resolver";

/* ── Provider capabilities (PHASE 4 contract) ───────────────────────── */

export interface SourceCapabilities {
  /** Provider can deliver the FULL track (not a 30s preview). */
  supportsFullLength: boolean;
  /** Seek is supported (progress scrub). */
  supportsSeek: boolean;
  /** Waveform peaks can be computed from the raw stream. */
  supportsWaveform: boolean;
  /** Provider exposes (or lets us fetch) lyrics. */
  supportsLyrics: boolean;
  /** Tracks can be queued/advanced by the unified queue. */
  supportsQueue: boolean;
  /** Playback survives tab backgrounding / screen lock. */
  supportsBackgroundPlay: boolean;
}

/** SoundCloud (SNIP policy may cut ~30s — per-candidate validation decides). */
export const SOUNDCLOUD_CAPS: SourceCapabilities = {
  supportsFullLength: true, // policy-dependent → validate() per candidate
  supportsSeek: true,
  supportsWaveform: true,
  supportsLyrics: false, // lyrics come from the MQ lyrics pipeline instead
  supportsQueue: true,
  supportsBackgroundPlay: true,
};

/** Audius — full-length open streaming. */
export const AUDIUS_CAPS: SourceCapabilities = {
  supportsFullLength: true,
  supportsSeek: true,
  supportsWaveform: true,
  supportsLyrics: false,
  supportsQueue: true,
  supportsBackgroundPlay: true,
};

/** Spotify Official (Web Playback SDK, Premium sessions only). */
export const SPOTIFY_OFFICIAL_CAPS: SourceCapabilities = {
  supportsFullLength: true,
  supportsSeek: true,
  supportsWaveform: false, // SDK gives no raw stream → no real peaks
  supportsLyrics: false,
  supportsQueue: true,
  supportsBackgroundPlay: true,
};

/** Local/demo files. */
export const LOCAL_CAPS: SourceCapabilities = {
  supportsFullLength: true,
  supportsSeek: true,
  supportsWaveform: true,
  supportsLyrics: false,
  supportsQueue: true,
  supportsBackgroundPlay: true,
};

export function capabilitiesFor(
  provider: "soundcloud" | "audius" | "spotify-official" | "local",
): SourceCapabilities {
  switch (provider) {
    case "soundcloud": return SOUNDCLOUD_CAPS;
    case "audius": return AUDIUS_CAPS;
    case "spotify-official": return SPOTIFY_OFFICIAL_CAPS;
    case "local": return LOCAL_CAPS;
  }
}

/* ── Full-length validation (PHASE 6) ───────────────────────────────── */

/** Durations at/below this are treated as previews regardless of flags. */
export const PREVIEW_DURATION_SEC = 35;

/**
 * Duration-ratio window that smells like a SNIP: catalog expects a normal
 * song (>= 60s) but the candidate is ~28-45% of it. True full tracks match
 * catalog duration within a few percent; SNIP cuts are hard 30s.
 */
const SNIP_RATIO_MIN = 0.28;
const SNIP_RATIO_MAX = 0.45;
const SNIP_CATALOG_MIN = 60;

export interface FullLengthVerdict {
  isFullLength: boolean;
  /** Human-readable reason (shown in diagnostics / source sheet). */
  reason:
    | "ok"
    | "provider-flagged-preview"
    | "short-duration"
    | "snip-ratio";
}

/**
 * Validate ONE candidate for full-length playback.
 * Pure function — no network. REJECT means: exclude from normal Play.
 */
export function validateFullLength(
  catalog: Pick<CatalogTrack, "durationSec">,
  candidate: Pick<PlaybackCandidate, "durationSec" | "isPreview">,
): FullLengthVerdict {
  // 1. Provider says preview (SoundCloud SNIP policy marker).
  if (candidate.isPreview) {
    return { isFullLength: false, reason: "provider-flagged-preview" };
  }

  const cand = candidate.durationSec || 0;
  const cat = catalog.durationSec || 0;

  // 2. Absolute short duration — 30s teaser / promo cut.
  if (cand > 0 && cand <= PREVIEW_DURATION_SEC && (cat === 0 || cat > cand + 15)) {
    return { isFullLength: false, reason: "short-duration" };
  }

  // 2b. Hard fragment — SoundCloud also serves 45s/60s SNIP cuts. A
  // sub-minute candidate for a 90s+ catalog song is never the full track
  // (live case 2026-10-08: 45s "Pianoforte" clip vs 3:26 catalog slipped
  // under the ratio window at 0.22).
  if (cand > 0 && cand < 60 && cat >= 90) {
    return { isFullLength: false, reason: "short-duration" };
  }

  // 3. SNIP ratio — catalog expects >=60s but candidate is a ~⅓ cut.
  if (cand > 0 && cat >= SNIP_CATALOG_MIN) {
    const ratio = cand / cat;
    if (ratio >= SNIP_RATIO_MIN && ratio <= SNIP_RATIO_MAX) {
      return { isFullLength: false, reason: "snip-ratio" };
    }
  }

  return { isFullLength: true, reason: "ok" };
}

/**
 * Convenience: is this candidate playable as a NORMAL track?
 * (full-length AND a sane duration — not negative, not absurdly short)
 */
export function isNormalPlayable(
  catalog: Pick<CatalogTrack, "durationSec">,
  candidate: Pick<PlaybackCandidate, "durationSec" | "isPreview">,
): boolean {
  const v = validateFullLength(catalog, candidate);
  if (!v.isFullLength) return false;
  const cand = candidate.durationSec || 0;
  return cand === 0 || cand >= 20; // 0 = unknown yet (resolve stream first)
}

/** Label for the source sheet — honest preview disclosure. */
export function previewLabel(verdict: FullLengthVerdict): string {
  if (verdict.isFullLength) return "Полный трек";
  switch (verdict.reason) {
    case "provider-flagged-preview": return "Превью (обрезано источником)";
    case "short-duration": return `Превью ~30 c — не полный трек`;
    case "snip-ratio": return "Превью (сокращённая версия)";
    default: return "Превью";
  }
}
