/**
 * Live sampler — the HLS/DRM waveform path (spec §5).
 *
 * Tracks that cannot be decoded (DRM-HLS / plain HLS / snippets) still get a
 * REAL waveform: while they actually play, the engine AnalyserNode is sampled
 * at bucket boundaries. These tests pin the honesty contract:
 *   - real signal → bucket captured at the right index (audio-clock mapping);
 *   - silence (musical rest OR a CORS-muted graph) → NEVER marked as known;
 *   - paused / buffering / out-of-range positions → nothing sampled;
 *   - a complete (fully decoded) cache entry is immutable — never downgraded;
 *   - stop flushes the partial state as coverage-honest, incomplete data.
 *
 * rAF is stubbed so each frame is driven manually and deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/audioEngine", () => ({
  getAnalyser: vi.fn(),
  getTimeDomainData: vi.fn(),
}));
vi.mock("@/lib/wasm-audio", () => ({
  currentPlaybackPosition: vi.fn(() => 0),
}));
vi.mock("@/store/useAppStore", () => ({
  useAppStore: {
    getState: vi.fn(() => ({ isPlaying: true, playbackState: "playing" })),
    subscribe: vi.fn(() => () => {}),
    setState: vi.fn(),
  },
}));
vi.mock("@/lib/waveform/waveformCache", () => ({
  getWaveformFromCache: vi.fn(async () => null),
  putWaveformToCache: vi.fn(async () => {}),
}));

import { startLiveSampling, stopLiveSampling, getLiveSampled, resetLiveSamplerForTest } from "@/lib/waveform/liveSampler";
import { getAnalyser, getTimeDomainData } from "@/lib/audioEngine";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { getWaveformFromCache, putWaveformToCache } from "@/lib/waveform/waveformCache";
import { bucketCountFor } from "@/lib/waveform/computePeaks";
import type { WaveformData } from "@/lib/waveform/types";

const mockedAnalyser = vi.mocked(getAnalyser);
const mockedDomain = vi.mocked(getTimeDomainData);
const mockedPos = vi.mocked(currentPlaybackPosition);
const mockedGetCache = vi.mocked(getWaveformFromCache);
const mockedPutCache = vi.mocked(putWaveformToCache);

let rafCb: ((t: number) => void) | null = null;
let rafId = 0;

/** Drive exactly one sampling frame. */
function frame() {
  const cb = rafCb;
  rafCb = null;
  cb?.(rafId++);
}

/** Analyser time-domain filler: 128 = digital silence, ±amp around it = signal. */
function signalOf(amp: number) {
  return (buf: Uint8Array<ArrayBuffer>) => {
    const v = 128 + Math.round(amp * 100);
    for (let i = 0; i < buf.length; i++) buf[i] = v;
    return buf;
  };
}

const DUR = 100;
const BUCKETS = bucketCountFor(DUR);

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    rafCb = cb;
    return ++rafId;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  rafCb = null;
  resetLiveSamplerForTest();
  mockedAnalyser.mockReturnValue({ fftSize: 2048 } as AnalyserNode);
  mockedDomain.mockImplementation(signalOf(0.5));
  mockedPos.mockReturnValue(0);
  mockedGetCache.mockResolvedValue(null);
  mockedPutCache.mockClear();
});

afterEach(() => {
  resetLiveSamplerForTest();
  vi.unstubAllGlobals();
});

describe("Live sampler — real signal capture", () => {
  it("captures the bucket under the CURRENT audio-clock position (right index)", () => {
    startLiveSampling({ trackId: "hls-1", fingerprint: "100", durationSec: DUR });
    expect(getLiveSampled()?.key).toContain("hls-1");

    mockedPos.mockReturnValue(10); // 10% into a 100s track
    frame();

    const s = getLiveSampled()!;
    const idx = Math.floor((10 / DUR) * BUCKETS);
    expect(s.peaks[idx]).toBeGreaterThan(0); // this bucket heard real signal
    const others = s.peaks.filter((v, i) => i !== idx && v > 0);
    expect(others).toHaveLength(0); // nothing invented elsewhere
  });

  it("silence (all-128, incl. CORS-muted graphs) is NEVER marked as known", () => {
    mockedDomain.mockImplementation(signalOf(0)); // digital silence
    startLiveSampling({ trackId: "hls-2", fingerprint: "100", durationSec: DUR });
    mockedPos.mockReturnValue(42);
    frame();
    frame();
    const s = getLiveSampled()!;
    expect(s.peaks.every((v) => v === 0)).toBe(true);
  });

  it("paused / buffering tracks sample NOTHING (no independent timers)", async () => {
    const { useAppStore } = await import("@/store/useAppStore");
    const state = vi.mocked(useAppStore.getState);
    startLiveSampling({ trackId: "hls-3", fingerprint: "100", durationSec: DUR });
    mockedPos.mockReturnValue(20);

    state.mockReturnValue({ isPlaying: false, playbackState: "playing" } as never);
    frame();
    state.mockReturnValue({ isPlaying: true, playbackState: "buffering" } as never);
    frame();
    state.mockReturnValue({ isPlaying: true, playbackState: "playing" } as never);
    const s = getLiveSampled()!;
    expect(s.peaks.every((v) => v === 0)).toBe(true);

    // Resume → the very next frame captures.
    frame();
    const s2 = getLiveSampled()!;
    const idx = Math.floor((20 / DUR) * BUCKETS);
    expect(s2.peaks[idx]).toBeGreaterThan(0);
  });

  it("positions outside [0, duration) never touch the peaks array", () => {
    startLiveSampling({ trackId: "hls-4", fingerprint: "100", durationSec: DUR });
    for (const p of [-5, DUR, DUR + 10, NaN]) {
      mockedPos.mockReturnValue(p);
      frame();
    }
    const s = getLiveSampled()!;
    expect(s.peaks.every((v) => v === 0)).toBe(true);
  });
});

describe("Live sampler — persistence honesty", () => {
  it("stop() flushes a coverage-honest INCOMPLETE entry to the cache", async () => {
    startLiveSampling({ trackId: "hls-5", fingerprint: "100", durationSec: DUR });
    mockedPos.mockReturnValue(30);
    frame();
    stopLiveSampling();
    await Promise.resolve(); // flush() is fire-and-forget

    expect(mockedPutCache).toHaveBeenCalledTimes(1);
    const entry = mockedPutCache.mock.calls[0][0] as WaveformData;
    expect(entry.complete).toBe(false); // never claims full decode
    expect(entry.coverage).toBeGreaterThan(0);
    expect(entry.coverage).toBeLessThan(1);
  });

  it("a COMPLETE (fully decoded) cache entry is immutable — never downgraded", async () => {
    const complete = {
      key: "hls-6|100|v1",
      trackId: "hls-6",
      version: 1,
      fingerprint: "100",
      bucketCount: BUCKETS,
      durationSec: DUR,
      peaks: new Float32Array(BUCKETS).fill(1),
      coverage: 1,
      complete: true,
      updatedAt: 1,
    } as WaveformData;
    mockedGetCache.mockResolvedValue(complete);
    // The seeding path also skips complete entries — but the critical rule is
    // flush(): it must return before putWaveformToCache.
    startLiveSampling({ trackId: "hls-6", fingerprint: "100", durationSec: DUR });
    mockedPos.mockReturnValue(10);
    frame();
    stopLiveSampling();
    await Promise.resolve();
    expect(mockedPutCache).not.toHaveBeenCalled();
  });

  it("restart with the SAME key keeps the session (no restart churn)", () => {
    startLiveSampling({ trackId: "hls-7", fingerprint: "100", durationSec: DUR });
    const first = getLiveSampled();
    startLiveSampling({ trackId: "hls-7", fingerprint: "100", durationSec: DUR });
    const second = getLiveSampled();
    expect(second).not.toBe(first); // wrapper object is always fresh…
    expect(second!.peaks).toBe(first!.peaks); // …but the peaks array is the SAME session (not reset)
  });
});
