/**
 * requestRegistry tests — V3 PHASE 2 gates.
 *
 * THE test (user §2): A → B → C → D rapid play. Only D wins. Stale
 * requests are aborted and can never mutate current state.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  nextGeneration,
  currentGeneration,
  isFresh,
  scopeSignal,
  composeSignals,
  dedupe,
  dedupFetch,
  requestRegistryStats,
  __resetRequestRegistry,
} from "@/lib/net/requestRegistry";

beforeEach(() => {
  __resetRequestRegistry();
});

describe("generation scopes", () => {
  it("monotonic generation per scope", () => {
    expect(nextGeneration("playback")).toBe(1);
    expect(nextGeneration("playback")).toBe(2);
    expect(nextGeneration("playback")).toBe(3);
    // other scopes independent
    expect(nextGeneration("view")).toBe(1);
    expect(currentGeneration("playback")).toBe(3);
  });

  it("isFresh: only the latest generation is fresh", () => {
    nextGeneration("playback"); // 1
    const old = currentGeneration("playback");
    nextGeneration("playback"); // 2
    expect(isFresh("playback", old)).toBe(false);
    expect(isFresh("playback", currentGeneration("playback"))).toBe(true);
  });

  it("A→B→C→D: advancing to D aborts A/B/C scope controllers", () => {
    const sigA = scopeSignal("playback", nextGeneration("playback"));
    const sigB = scopeSignal("playback", nextGeneration("playback"));
    const sigC = scopeSignal("playback", nextGeneration("playback"));
    expect(sigA.aborted).toBe(true);
    expect(sigB.aborted).toBe(true);
    expect(sigC.aborted).toBe(false); // C is fresh… until D
    const sigD = scopeSignal("playback", nextGeneration("playback"));
    expect(sigC.aborted).toBe(true);
    expect(sigD.aborted).toBe(false);
    expect(requestRegistryStats().aborted).toBe(3);
  });
});

describe("composeSignals", () => {
  it("either signal aborting aborts the composition", async () => {
    const a = new AbortController();
    const b = new AbortController();
    const s = composeSignals(a.signal, b.signal)!;
    expect(s.aborted).toBe(false);
    b.abort();
    expect(s.aborted).toBe(true);
  });
  it("handles nulls", () => {
    const a = new AbortController();
    expect(composeSignals(a.signal, null)).toBe(a.signal);
    expect(composeSignals(null, null)).toBeUndefined();
  });
});

describe("dedupe (generic promise dedup)", () => {
  it("concurrent identical calls share ONE execution", async () => {
    let executions = 0;
    const fn = async () => {
      executions++;
      return 42;
    };
    const [r1, r2, r3] = await Promise.all([
      dedupe("k1", fn),
      dedupe("k1", fn),
      dedupe("k1", fn),
    ]);
    expect(executions).toBe(1);
    expect([r1, r2, r3]).toEqual([42, 42, 42]);
    expect(requestRegistryStats().dedupHits).toBe(2);
  });

  it("different keys → independent executions", async () => {
    let executions = 0;
    const fn = async () => { executions++; return executions; };
    await Promise.all([dedupe("x", fn), dedupe("y", fn)]);
    expect(executions).toBe(2);
  });

  it("sequential same-key calls re-execute (no ttl)", async () => {
    let n = 0;
    const fn = async () => ++n;
    expect(await dedupe("s", fn)).toBe(1);
    expect(await dedupe("s", fn)).toBe(2);
  });

  it("ttl memoizes completed results", async () => {
    let n = 0;
    const fn = async () => ++n;
    expect(await dedupe("t", fn, { ttl: 60_000 })).toBe(1);
    expect(await dedupe("t", fn, { ttl: 60_000 })).toBe(1); // from cache
    expect(requestRegistryStats().cacheHits).toBe(1);
  });
});

describe("dedupFetch", () => {
  it("caches fresh responses (TTL) — second call skips network", async () => {
    const mock = vi.fn(async () => ({ ok: true, json: async () => ({ v: 1 }) }) as Response);
    vi.stubGlobal("fetch", mock);
    const r1 = await dedupFetch<{ v: number }>("/api/x", undefined, { key: "fx", ttl: 60_000 });
    const r2 = await dedupFetch<{ v: number }>("/api/x", undefined, { key: "fx", ttl: 60_000 });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(r1.data).toEqual({ v: 1 });
    expect(r2.fromCache).toBe(true);
    expect(r2.data).toEqual({ v: 1 });
    vi.unstubAllGlobals();
  });

  it("in-flight identical GETs share one network request", async () => {
    let calls = 0;
    const mock = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true, json: async () => ({ v: calls }) } as Response;
    });
    vi.stubGlobal("fetch", mock);
    const [a, b] = await Promise.all([
      dedupFetch("/api/y", undefined, { key: "fy" }),
      dedupFetch("/api/y", undefined, { key: "fy" }),
    ]);
    expect(calls).toBe(1);
    expect(a.data).toEqual({ v: 1 });
    expect(b.data).toEqual({ v: 1 });
    expect(requestRegistryStats().dedupHits).toBe(1);
    vi.unstubAllGlobals();
  });

  it("HTTP error → honest {data:null, error} — never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const r = await dedupFetch("/api/z", undefined, { key: "fz" });
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
    vi.unstubAllGlobals();
  });

  it("SWR: stale value served instantly, refresh fires behind", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ v: ++n }) }) as Response));
    const opts = { key: "swr", ttl: 50 };
    await dedupFetch("/api/s", undefined, opts); // v=1 cached
    await new Promise((r) => setTimeout(r, 80)); // TTL expired → stale
    const r2 = await dedupFetch("/api/s", undefined, { ...opts, swr: true });
    expect(r2.fromCache).toBe(true);
    expect(r2.revalidating).toBe(true);
    expect(r2.data).toEqual({ v: 1 }); // stale served
    await new Promise((r) => setTimeout(r, 20)); // let refresh land
    const r3 = await dedupFetch("/api/s", undefined, { ...opts, swr: true });
    expect(r3.data).toEqual({ v: 2 }); // refreshed
    vi.unstubAllGlobals();
  });

  it("aborting the signal fails the request honestly (no phantom data)", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return { ok: true, json: async () => ({ v: 1 }) } as Response;
    }));
    const r = await dedupFetch("/api/a", undefined, { key: "fa", signal: ctrl.signal });
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
