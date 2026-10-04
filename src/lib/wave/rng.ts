/**
 * Seeded deterministic RNG for the Wave engine (§23).
 *
 * Every random decision in the pipeline (jitter, exploration picks,
 * shuffles) goes through a WaveRng instance created from `randomSeed`.
 * Same inputs + same randomSeed → byte-identical ranking, so tests are
 * never flaky and the engine is fully reproducible.
 */

export interface WaveRng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Random element (returns undefined for empty arrays). */
  pick<T>(arr: readonly T[]): T | undefined;
  /** Fisher–Yates copy. */
  shuffle<T>(arr: readonly T[]): T[];
}

/** mulberry32 — tiny, fast, well-distributed, deterministic. */
export function createRng(seed: number): WaveRng {
  // Ensure the seed is a uint32 regardless of caller input.
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    pick: <T>(arr: readonly T[]): T | undefined =>
      arr.length === 0 ? undefined : arr[Math.floor(next() * arr.length)],
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** FNV-1a — deterministic string → uint32 seed. */
export function hashStringToSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Resolve the effective random seed for an engine call.
 * Explicit seed wins; otherwise derive one from context strings so the
 * pipeline is still reproducible for a given (session, batch) pair while
 * remaining varied across batches.
 */
export function resolveRandomSeed(seed: number | undefined, contextParts: Array<string | number | undefined>): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  return hashStringToSeed(contextParts.filter((p) => p !== undefined).join("|") + "|" + Date.now().toString(36));
}
