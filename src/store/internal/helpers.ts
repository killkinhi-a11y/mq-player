// Pure store helpers (moved from useAppStore.ts in Stage III).
import type { Track } from "@/lib/musicApi";

// ── v10.3: last non-zero volume memory (mute/unmute restore) ──
// Module-level (NOT persisted, NOT in the store shape — zero migration
// risk). Every setVolume(>0) remembers the value; unmute paths recall it
// instead of hardcoding 70. Default 70 = the historical unmute target.
let __lastVolume = 70;
export function getLastVolume(): number {
  return __lastVolume > 0 ? __lastVolume : 70;
}
export function rememberLastVolume(v: number): void {
  __lastVolume = v;
}

/** v11: numeric clamp helper for lyrics-appearance setters. */
export function clampNum(v: number, min: number, max: number, fallback: number): number {
  return typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

// Simple energy estimation for smart shuffle
export function estimateTrackEnergy(track: Track): number {
  if (!track) return 0.5;
  const title = (track.title || "").toLowerCase();
  const genre = (track.genre || "").toLowerCase();
  const dur = track.duration || 0;

  const highKw = ["remix", "edit", "mix", "club", "bass boosted", "extended", "hard", "banger", "drop", "festival", "rave", "workout", "bootleg"];
  const lowKw = ["acoustic", "live", "unplugged", "piano", "ambient", "sleep", "meditation", "relax", "chill", "lo-fi", "lofi", "slow", "ballad"];

  let s = 0;
  if (highKw.some(kw => title.includes(kw))) s += 1;
  if (lowKw.some(kw => title.includes(kw))) s -= 1;

  const highG = ["edm", "techno", "dubstep", "drum and bass", "hardstyle", "trap", "reggaeton", "dance pop", "trance", "drill"];
  const lowG = ["ambient", "classical", "lo-fi", "lofi", "piano", "bossa nova", "downtempo", "jazz", "blues"];

  if (highG.some(g => genre.includes(g))) s += 2;
  else if (lowG.some(g => genre.includes(g))) s -= 2;
  if (dur > 0) { if (dur < 150) s += 1; else if (dur > 360) s -= 1; }

  if (s >= 2) return 1;
  if (s <= -2) return 0;
  if (s >= 1) return 0.75;
  if (s <= -1) return 0.25;
  return 0.5;
}

// ── History size policy (W03) ──────────────────────────────────────────
// Backend (/api/sync) stores history as a JSON blob with NO server-side
// limit (only a 2MB total payload cap); the 200-entry cap that users hit
// was purely client-side. Entries are slim tracks (~350B each), so 1000
// entries ≈ 350KB — comfortably inside the 4MB localStorage guard and the
// 2MB sync payload. The quota adapter's emergency trim stays as the
// last-resort protection.
export const MAX_HISTORY_ENTRIES = 1000;
