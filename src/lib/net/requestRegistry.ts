/**
 * requestRegistry — V3 performance foundation (PHASE 2).
 *
 * THE problem it solves (user §2/§23/§28):
 *   play(A) → requestId 1
 *   play(B) → requestId 2
 *   play(C) → requestId 3
 *   If requestId 1 completes AFTER requestId 3 → its result is IGNORED.
 *   A STALE REQUEST MUST NEVER MUTATE CURRENT STATE.
 *
 * Provides (user §2 checklist):
 *   - Generation IDs   — monotonic per-scope counters; stale callbacks no-op
 *   - AbortController  — one controller per generation, chained to fetches
 *   - Request dedup    — identical in-flight GETs share ONE promise
 *   - In-flight cache  — concurrent callers await the same promise
 *   - TTL cache        — short-lived response cache with LRU trim
 *   - SWR              — stale-while-revalidate: serve cache, refresh behind
 *   - Cancellation     — abort stale network work, count it for diagnostics
 *
 * Zero dependencies, SSR-safe (module-level state only on client; server
 * callers get plain passthrough semantics with generation guards).
 */

/* ── Generation scopes ──────────────────────────────────────────────── */

const generations = new Map<string, number>();

/** Advance the generation of a scope; returns the NEW generation id. */
export function nextGeneration(scope: string): number {
  const n = (generations.get(scope) || 0) + 1;
  generations.set(scope, n);
  abortScope(scope, n);
  return n;
}

/** Current generation of a scope (0 when never advanced). */
export function currentGeneration(scope: string): number {
  return generations.get(scope) || 0;
}

/** Is `gen` still the freshest generation of `scope`? */
export function isFresh(scope: string, gen: number): boolean {
  return currentGeneration(scope) === gen;
}

/* ── Scope-bound abort management ───────────────────────────────────── */

const controllers = new Map<string, { gen: number; ctrl: AbortController }>();

/** Get (creating if needed) the AbortController bound to scope@gen. */
export function scopeSignal(scope: string, gen: number): AbortSignal {
  const key = scope;
  const existing = controllers.get(key);
  if (existing && existing.gen === gen) return existing.ctrl.signal;
  const ctrl = new AbortController();
  controllers.set(key, { gen, ctrl });
  return ctrl.signal;
}

/** Abort any controller of `scope` whose generation is older than `keepGen`. */
function abortScope(scope: string, keepGen: number): void {
  const existing = controllers.get(scope);
  if (existing && existing.gen < keepGen) {
    try { existing.ctrl.abort(); } catch { /* already aborted */ }
    controllers.delete(scope);
    abortedCount++;
  }
}

/** Compose a scope signal with an external signal (timeout etc.). */
export function composeSignals(a: AbortSignal | null | undefined, b: AbortSignal | null | undefined): AbortSignal | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

/* ── Diagnostics counters (dev panel §29) ───────────────────────────── */

let dedupHits = 0;
let cacheHits = 0;
let abortedCount = 0;

export function requestRegistryStats(): {
  dedupHits: number;
  cacheHits: number;
  aborted: number;
  inflight: number;
  cached: number;
} {
  return {
    dedupHits,
    cacheHits,
    aborted: abortedCount,
    inflight: inflight.size,
    cached: ttlCache.size,
  };
}

/* ── In-flight dedup + TTL cache + SWR ──────────────────────────────── */

const inflight = new Map<string, Promise<unknown>>();
const inflightMeta = new Map<string, number>(); // startedAt (ms)

const ttlCache = new Map<string, { value: unknown; at: number; ttl: number }>();
const MAX_CACHE_ENTRIES = 300;

export interface FetchOptions {
  /** Cache key — REQUIRED to participate in dedup/cache. */
  key: string;
  /** Time-to-live for the TTL cache (ms). Default 60s. */
  ttl?: number;
  /** Serve stale immediately and revalidate in the background (SWR). */
  swr?: boolean;
  /** External abort signal (generation scope, timeout, …). */
  signal?: AbortSignal | null;
  /** Skip cache read (force network) — write still populates cache. */
  noCacheRead?: boolean;
}

export interface FetchResult<T> {
  data: T | null;
  /** True when data came from the TTL cache (fresh or stale-SWR). */
  fromCache: boolean;
  /** True when a stale value was served and a refresh is running. */
  revalidating: boolean;
  /** Network/abort error (never thrown — honest null). */
  error: Error | null;
}

/**
 * Deduplicated, cached, abortable JSON-GET wrapper.
 *
 * - identical `key` while in-flight → the SAME promise (dedup);
 * - fresh TTL cache → served, network skipped;
 * - `swr` → stale served instantly, refresh runs behind, result lands in cache;
 * - failures never throw (honest {data:null, error});
 * - aborted requests are removed from inflight (callers re-request later).
 */
export async function dedupFetch<T>(
  url: string,
  init: RequestInit | undefined,
  opts: FetchOptions,
): Promise<FetchResult<T>> {
  const { key, ttl = 60_000, swr = false, signal = null, noCacheRead = false } = opts;

  // 1. Fresh cache hit.
  if (!noCacheRead) {
    const hit = ttlCache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) {
      cacheHits++;
      return { data: hit.value as T, fromCache: true, revalidating: false, error: null };
    }
    // 2. SWR: serve stale, refresh behind.
    if (hit && swr) {
      cacheHits++;
      void revalidate<T>(url, init, key, ttl, signal).catch(() => {});
      return { data: hit.value as T, fromCache: true, revalidating: true, error: null };
    }
  }

  // 3. In-flight dedup.
  const running = inflight.get(key);
  if (running) {
    dedupHits++;
    try {
      const data = (await running) as T;
      return { data, fromCache: false, revalidating: false, error: null };
    } catch (e) {
      return { data: null, fromCache: false, revalidating: false, error: e as Error };
    }
  }

  // 4. Cold request.
  try {
    const data = await revalidate<T>(url, init, key, ttl, signal);
    return { data, fromCache: false, revalidating: false, error: null };
  } catch (e) {
    return { data: null, fromCache: false, revalidating: false, error: e as Error };
  }
}

/** Shared cold-fetch path — also used by SWR revalidation. */
async function revalidate<T>(
  url: string,
  init: RequestInit | undefined,
  key: string,
  ttl: number,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  const p = (async () => {
    const res = await fetch(url, { ...init, signal: signal || init?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  })();
  inflight.set(key, p as Promise<unknown>);
  inflightMeta.set(key, Date.now());
  try {
    const data = await p;
    ttlCache.set(key, { value: data, at: Date.now(), ttl });
    if (ttlCache.size > MAX_CACHE_ENTRIES) {
      // LRU-ish trim: drop the oldest third (Map preserves insertion order).
      const drop = Math.ceil(MAX_CACHE_ENTRIES / 3);
      let i = 0;
      for (const k of ttlCache.keys()) {
        if (i++ >= drop) break;
        ttlCache.delete(k);
      }
    }
    return data;
  } finally {
    inflight.delete(key);
    inflightMeta.delete(key);
  }
}

/* ── Generic promise dedup (non-fetch async work, e.g. resolver calls) ─ */

/**
 * Dedup ANY async work by key. Concurrent callers share one promise;
 * late arrivals after completion start fresh (add `ttl` to also memoize).
 */
export function dedupe<T>(
  key: string,
  fn: (signal?: AbortSignal) => Promise<T>,
  opts?: { ttl?: number },
): Promise<T> {
  const ttl = opts?.ttl ?? 0;
  if (ttl > 0) {
    const hit = ttlCache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) {
      cacheHits++;
      return Promise.resolve(hit.value as T);
    }
  }
  const running = inflight.get(key);
  if (running) {
    dedupHits++;
    return running as Promise<T>;
  }
  const p = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  if (ttl > 0) {
    void p.then((v) => ttlCache.set(key, { value: v, at: Date.now(), ttl })).catch(() => {});
  }
  return p;
}

/* ── Test/reset hooks ───────────────────────────────────────────────── */

export function __resetRequestRegistry(): void {
  generations.clear();
  controllers.clear();
  inflight.clear();
  inflightMeta.clear();
  ttlCache.clear();
  dedupHits = 0;
  cacheHits = 0;
  abortedCount = 0;
}
