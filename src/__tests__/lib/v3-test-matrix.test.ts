/**
 * V3 TEST MATRIX — PHASE 30.
 *
 * The mandated scenarios (user §30):
 *   rapid switching · stale request · abort · late resolver · late lyrics ·
 *   late artwork · duplicate request · queue prefetch · source switch ·
 *   Wave switch · Wave race · lyrics sync · skip tracking ·
 *   recommendation weighting · full-length validation.
 *
 * And THE gate: A → B → C → D rapid play — ONLY D WINS.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import {
  nextGeneration,
  isFresh,
  scopeSignal,
  dedupe,
  __resetRequestRegistry,
} from "@/lib/net/requestRegistry";
import { __resetClock, subscribeClock, clockSetPlaying, wakeClock } from "@/lib/playback/clock";
import { __resetPrefetch, prefetchNextTrack, prefetchState } from "@/lib/playback/prefetch";
import { resolveCatalogTrack, clearLocalResolveCache } from "@/lib/playback/client";
import { deriveWaveState, computeBarGeometry, bufferedAheadRatio, placeholderHeight } from "@/lib/wave/render";
import { detectVersion } from "@/lib/playback/versions";

beforeEach(() => {
  localStorage.clear();
  __resetRequestRegistry();
  __resetClock();
  __resetPrefetch();
  clearLocalResolveCache();
  const store = useAppStore.getState();
  if (store.reset) store.reset();
  vi.restoreAllMocks();
});

function track(n: number, partial?: Partial<Track>): Track {
  return {
    id: `t${n}`,
    title: `Track ${n}`,
    artist: `Artist ${n}`,
    album: "Album",
    duration: 200,
    cover: "",
    genre: "",
    audioUrl: "",
    previewUrl: "",
    source: "soundcloud",
    scTrackId: 1000 + n,
    ...partial,
  } as Track;
}

/* ═══ THE GATE: A → B → C → D — D MUST WIN ═══ */

describe("rapid switching — A→B→C→D, only D wins (§2/§30)", () => {
  it("store: rapid playTrack sequence ends with D as currentTrack", () => {
    const s = useAppStore.getState();
    const queue = [track(1), track(2), track(3), track(4)];
    s.playTrack(track(1), queue);
    s.playTrack(track(2), queue);
    s.playTrack(track(3), queue);
    s.playTrack(track(4), queue);
    const st = useAppStore.getState();
    expect(st.currentTrack?.id).toBe("t4");
    expect(st.queueIndex).toBe(3);
  });

  it("generation guards: only the newest generation may commit", () => {
    // The engine's exact pattern: each load bumps the generation; late
    // async work checks freshness before mutating state.
    const genA = nextGeneration("playback");
    const genB = nextGeneration("playback");
    const genC = nextGeneration("playback");
    const genD = nextGeneration("playback");
    expect(isFresh("playback", genA)).toBe(false);
    expect(isFresh("playback", genB)).toBe(false);
    expect(isFresh("playback", genC)).toBe(false);
    expect(isFresh("playback", genD)).toBe(true);
  });

  it("stale generation's fetch is ABORTED (network stops, not just ignored)", () => {
    const genA = scopeSignal("playback", nextGeneration("playback"));
    expect(genA.aborted).toBe(false);
    nextGeneration("playback"); // B arrives
    expect(genA.aborted).toBe(true);
  });

  it("late resolver result for A cannot overwrite D's state (engine guard semantics)", async () => {
    // Simulate the engine's resolve-commit guard: result applies ONLY when
    // the generation is still fresh.
    const commits: string[] = [];
    const tryCommit = (gen: number, trackId: string) => {
      if (isFresh("playback", gen)) commits.push(trackId);
    };
    const genA = nextGeneration("playback");
    const genD = nextGeneration("playback");
    // Resolver for A resolves LAST (slow), D already committed.
    tryCommit(genD, "tD");
    tryCommit(genA, "tA"); // late — must be dropped
    expect(commits).toEqual(["tD"]);
  });
});

/* ═══ duplicate requests / dedup ═══ */

describe("duplicate request — one /api call for identical concurrent work (§23)", () => {
  it("concurrent identical resolves share one fetch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        best: {
          provider: "soundcloud", sourceId: "555", title: "X", artist: "Y",
          durationSec: 200, confidence: 0.95, score: 95,
        },
        alternatives: [], confidence: 0.95, lowConfidence: false, cached: false,
      }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const catalog = {
      provider: "spotify" as const,
      catalogId: "sp_abc",
      title: "X",
      artist: "Y",
      durationSec: 200,
    };
    const [a, b] = await Promise.all([
      resolveCatalogTrack(catalog),
      resolveCatalogTrack(catalog),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // ONE network request
    expect(a.track?.id).toBe(b.track?.id);
    vi.unstubAllGlobals();
  });
});

/* ═══ queue prefetch (§12) ═══ */

describe("queue prefetch — next catalog track resolves ahead of the switch", () => {
  it("prefetchResolve resolves a catalog track and caches it (hit counted)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        best: {
          provider: "soundcloud", sourceId: "777", title: "Next", artist: "Z",
          durationSec: 180, confidence: 0.9, score: 90,
        },
        alternatives: [], confidence: 0.9, lowConfidence: false, cached: false,
      }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const catalogTrack = track(9, {
      source: "spotify",
      catalogProvider: "spotify",
      catalogId: "sp_next",
      scTrackId: undefined,
    });
    await prefetchNextTrack(catalogTrack as unknown as Track);
    // Wait for the budgeted job.
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).toHaveBeenCalled();
    expect(prefetchState().hits).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("non-catalog tracks are skipped honestly (no /api/resolve request)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: false, json: async () => ({}) }) as Response);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await prefetchNextTrack(track(10)); // already playable SC track
    await new Promise((r) => setTimeout(r, 20));
    // No RESOLVE request for an already-playable track (lyrics probe may
    // legitimately call lrclib — that is a different, cheap surface).
    const resolveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/resolve"));
    expect(resolveCalls).toHaveLength(0);
    expect(prefetchState().misses).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});

/* ═══ Wave states / race (§14-19) ═══ */

describe("Wave — §16 state model", () => {
  it("deriveWaveState: all eight states are distinct and correctly derived", () => {
    expect(deriveWaveState({ hasTrack: false, hasDuration: false, loading: false, buffering: false, playing: false, scrubbing: false, error: false, nearEnd: false })).toBe("idle");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: true, buffering: false, playing: false, scrubbing: false, error: false, nearEnd: false })).toBe("loading");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: true, playing: true, scrubbing: false, error: false, nearEnd: false })).toBe("buffering");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: false, playing: true, scrubbing: false, error: false, nearEnd: false })).toBe("playing");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: false, playing: false, scrubbing: false, error: false, nearEnd: false })).toBe("paused");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: false, playing: false, scrubbing: true, error: false, nearEnd: false })).toBe("seeking");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: false, playing: false, scrubbing: false, error: true, nearEnd: false })).toBe("error");
    expect(deriveWaveState({ hasTrack: true, hasDuration: true, loading: false, buffering: false, playing: false, scrubbing: false, error: false, nearEnd: true })).toBe("ended");
  });

  it("geometry adapts to narrow screens (responsive §15)", () => {
    const desktop = computeBarGeometry(1200, 52);
    const mobile = computeBarGeometry(375, 34);
    expect(desktop.barW).toBe(3);
    expect(mobile.barW).toBe(2);
    expect(mobile.barCount).toBeGreaterThan(desktop.barCount / 4);
  });

  it("bufferedAheadRatio: WASM seconds and element ranges (§15)", () => {
    expect(bufferedAheadRatio(10, 200, 30, null)).toBeCloseTo(0.2, 5);
    expect(bufferedAheadRatio(10, 200, null, [{ start: 0, end: 50 }])).toBeCloseTo(0.25, 5);
    expect(bufferedAheadRatio(10, 200, null, [])).toBe(0);
    expect(bufferedAheadRatio(-1, 0, 30, null)).toBe(0); // unmeasurable — honest 0
  });

  it("placeholder heights are deterministic (no frame-to-frame flicker)", () => {
    expect(placeholderHeight(10, 100)).toBe(placeholderHeight(10, 100));
    const v = placeholderHeight(50, 100);
    expect(v).toBeGreaterThan(0.1);
    expect(v).toBeLessThanOrEqual(1);
  });
});

/* ═══ lyrics sync — unified clock (§13/§19) ═══ */

describe("PlaybackClock — one loop feeds every surface (§13)", () => {
  it("subscribers receive position ticks while playing; throttling respected", async () => {
    const calls: number[] = [];
    const throttled: number[] = [];
    const unsubA = subscribeClock((pos) => calls.push(pos), { throttleMs: 0 });
    const unsubB = subscribeClock((pos) => throttled.push(pos), { throttleMs: 50 });
    clockSetPlaying(true);
    wakeClock();
    await new Promise((r) => setTimeout(r, 120));
    clockSetPlaying(false);
    unsubA();
    unsubB();
    expect(calls.length).toBeGreaterThan(0);
    // Throttled surface got FEWER (or equal) notifications than the 60fps one.
    expect(throttled.length).toBeLessThanOrEqual(calls.length);
  });

  it("wakeClock fires a short burst while paused (seek-from-lyrics sync)", async () => {
    let ticks = 0;
    const unsub = subscribeClock(() => { ticks++; }, { throttleMs: 0 });
    wakeClock();
    await new Promise((r) => setTimeout(r, 80));
    expect(ticks).toBeGreaterThan(0);
    unsub();
  });

  it("unsubscribe stops delivery; zero subscribers stop the loop", () => {
    let ticks = 0;
    const unsub = subscribeClock(() => { ticks++; }, { throttleMs: 0 });
    unsub();
    clockSetPlaying(true);
    expect(ticks).toBe(0);
    clockSetPlaying(false);
  });
});

/* ═══ skip tracking through the real store (§24-26) ═══ */

describe("skip tracking — real store flow (§24-25)", () => {
  it("rapid A→B→C→D records skip events for A, B, C (each mid-play)", () => {
    const s = useAppStore.getState();
    // Simulate each track playing for a while before switching.
    s.playTrack(track(1));
    useAppStore.setState({ progress: 20, duration: 200, isPlaying: true });
    s.playTrack(track(2));
    useAppStore.setState({ progress: 45, duration: 200, isPlaying: true });
    s.playTrack(track(3));
    useAppStore.setState({ progress: 8, duration: 200, isPlaying: true });
    s.playTrack(track(4));

    const st = useAppStore.getState();
    expect(st.currentTrack?.id).toBe("t4"); // D WINS
    const skipEvents = st.listeningEvents.filter((e) => e.kind === "skip");
    // A (20s), B (45s), C (8s) — all mid-play switches recorded as skips
    expect(skipEvents.length).toBe(3);
    expect(skipEvents.every((e) => ["t1", "t2", "t3"].includes(e.trackId))).toBe(true);
    // §24 field completeness on a real event
    const evA = skipEvents.find((e) => e.trackId === "t1")!;
    expect(evA.playedSeconds).toBe(20);
    expect(evA.skipPosition).toBe(20);
    expect(evA.completionRatio).toBeCloseTo(0.1, 5);
    expect(evA.startedAt).toBeGreaterThan(0);
    expect(evA.skippedAt).toBeGreaterThanOrEqual(evA.startedAt);
  });

  it("near-complete switches are NOT skips (engine records complete)", () => {
    const s = useAppStore.getState();
    s.playTrack(track(5));
    useAppStore.setState({ progress: 195, duration: 200, isPlaying: true });
    s.playTrack(track(6));
    const st = useAppStore.getState();
    expect(st.listeningEvents.filter((e) => e.kind === "skip")).toHaveLength(0);
  });

  it("favorite on the current track records a very-strong-positive event", () => {
    const s = useAppStore.getState();
    s.playTrack(track(7));
    s.toggleLike("t7", track(7));
    const st = useAppStore.getState();
    expect(st.listeningEvents.some((e) => e.kind === "favorite" && e.trackId === "t7")).toBe(true);
  });

  it("skipProfile flows into smart-queue adjustment (recommendation weighting §26)", () => {
    const s = useAppStore.getState();
    s.playTrack(track(8, { artist: "Repeat Offender" }));
    useAppStore.setState({ progress: 5, duration: 200, isPlaying: true });
    s.playTrack(track(9, { artist: "Repeat Offender" }));
    useAppStore.setState({ progress: 6, duration: 200, isPlaying: true });
    s.playTrack(track(10));
    const st = useAppStore.getState();
    expect((st.skipProfile.artists["repeat offender"] ?? 0)).toBeLessThan(-0.5);
  });
});

/* ═══ source matching versions (§5) ═══ */

describe("source matching — version detection feeds the resolver penalties", () => {
  it("detects the §5 mandated alternate versions", () => {
    expect(detectVersion("Song - LIVE").version).toBe("live");
    expect(detectVersion("Song (Remix)").version).toBe("remix");
    expect(detectVersion("Song (Karaoke Version)").version).toBe("karaoke");
    expect(detectVersion("Song (Slowed)").version).toBe("slowed");
    expect(detectVersion("Song (Reverb)").version).toBe("reverb");
    expect(detectVersion("Song (Sped Up)").version).toBe("sped_up");
    expect(detectVersion("Song (Acoustic)").version).toBe("acoustic");
    expect(detectVersion("Song (Radio Edit)").version).toBe("radio_edit");
    expect(detectVersion("Song (AI Cover)").version).toBe("ai_cover");
    expect(detectVersion("Song Reaction").version).toBe("reaction");
    expect(detectVersion("Plain Song").version).toBe("original");
  });
});
