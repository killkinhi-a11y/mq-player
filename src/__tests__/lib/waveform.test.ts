import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import {
  bucketCountFor,
  computePeaks,
  rebucketPeaks,
  waveformKey,
  waveformFingerprint,
  mergePeaks,
  coverageOf,
  xToTime,
  timeToX,
  bucketIndexForTime,
  bucketDisplayValue,
} from "@/lib/waveform/computePeaks";
import { WAVEFORM_VERSION } from "@/lib/waveform/types";
import {
  getWaveformFromCache,
  putWaveformToCache,
  clearWaveformCache,
} from "@/lib/waveform/waveformCache";
import { installFakeIndexedDB } from "../helpers/fakeIDB";

// ─── Pure math ──────────────────────────────────────────────────────────────

describe("Waveform — bucket sizing (adaptive downsampling)", () => {
  it("scales with duration (~6 bars/sec)", () => {
    expect(bucketCountFor(180)).toBe(1080); // 3 min
    expect(bucketCountFor(60)).toBe(360);
  });

  it("clamps for short and LONG tracks", () => {
    expect(bucketCountFor(2)).toBe(180);          // floor
    expect(bucketCountFor(3600)).toBe(1200);      // 1 hour → cap
    expect(bucketCountFor(0)).toBe(0);
    expect(bucketCountFor(-5)).toBe(0);
  });
});

describe("Waveform — computePeaks (real signal → peaks)", () => {
  it("computes max-abs peaks per bucket from PCM", () => {
    // 1 second of "audio": 100 samples, loud first half, quiet second.
    const pcm = new Float32Array(100);
    for (let i = 0; i < 50; i++) pcm[i] = 0.9;
    for (let i = 50; i < 100; i++) pcm[i] = 0.1;

    const peaks = computePeaks([pcm], 2)!;
    expect(peaks).not.toBeNull();
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(0.9, 5);
    expect(peaks[1]).toBeCloseTo(0.1, 5);
  });

  it("mono-mixes multiple channels by the loudest channel", () => {
    const left = new Float32Array([0.2, 0.2]);
    const right = new Float32Array([0.8, 0.8]);
    const peaks = computePeaks([left, right], 1)!;
    expect(peaks[0]).toBeCloseTo(0.8, 5);
  });

  it("normalizes/clamps above 1.0 (float PCM overshoot)", () => {
    const pcm = new Float32Array([1.5, -2.0]);
    const peaks = computePeaks([pcm], 1)!;
    expect(peaks[0]).toBe(1);
  });

  it("returns null for unusable input", () => {
    expect(computePeaks([], 10)).toBeNull();
    expect(computePeaks([new Float32Array(0)], 10)).toBeNull();
    expect(computePeaks([new Float32Array(10)], 0)).toBeNull();
  });
});

describe("Waveform — rebucket (adaptive renderer downsampling)", () => {
  it("never invents energy: target value = max of covered sources", () => {
    const src = new Float32Array([0, 0.5, 0, 0, 0.9, 0]);
    const out = rebucketPeaks(src, 2); // 3 sources per target
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0.9, 5);
  });

  it("returns same array when counts match", () => {
    const src = new Float32Array([0.1, 0.2]);
    expect(rebucketPeaks(src, 2)).toBe(src);
  });
});

describe("Waveform — cache identity (spec §6)", () => {
  it("key = trackId + fingerprint + waveformVersion", () => {
    const key = waveformKey("t1", "180");
    expect(key).toBe(`t1|180|v${WAVEFORM_VERSION}`);
  });

  it("fingerprint = duration identity (0.1s resolution)", () => {
    expect(waveformFingerprint({ durationSec: 180 })).toBe("180");
    expect(waveformFingerprint({ durationSec: 180.04 })).toBe("180");
    expect(waveformFingerprint({ durationSec: 180.06 })).toBe("180.1");
    expect(waveformFingerprint({ durationSec: 0 })).toBe("0");
  });
});

describe("Waveform — merge + coverage (live sampling)", () => {
  it("merges partials per-bucket by max", () => {
    const a = new Float32Array([0.1, 0, 0.5]);
    const b = new Float32Array([0, 0.7, 0.2]);
    const m = mergePeaks(a, b);
    expect(m).toHaveLength(3);
    expect(m[0]).toBeCloseTo(0.1, 5);
    expect(m[1]).toBeCloseTo(0.7, 5);
    expect(m[2]).toBeCloseTo(0.5, 5);
  });

  it("coverage = fraction of known buckets", () => {
    expect(coverageOf(new Float32Array([0.5, 0, 0.9, 0]))).toBe(0.5);
    expect(coverageOf(new Float32Array(0))).toBe(0);
  });
});

describe("Waveform — seek mapping", () => {
  it("x ↔ time is clamped and reversible", () => {
    expect(xToTime(50, 100, 200)).toBe(100);
    expect(xToTime(-5, 100, 200)).toBe(0);
    expect(xToTime(500, 100, 200)).toBe(200);
    expect(timeToX(100, 100, 200)).toBe(50);
    expect(timeToX(999, 100, 200)).toBe(100);
    // degenerate
    expect(xToTime(10, 0, 100)).toBe(0);
    expect(timeToX(10, 100, 0)).toBe(0);
  });

  it("bucketIndexForTime maps time into the right bucket", () => {
    expect(bucketIndexForTime(0, 100, 10)).toBe(0);
    expect(bucketIndexForTime(50, 100, 10)).toBe(5);
    expect(bucketIndexForTime(99.9, 100, 10)).toBe(9);
    expect(bucketIndexForTime(200, 100, 10)).toBe(9); // clamped
  });

  it("bucketDisplayValue: unknown partial region = subtle placeholder, decoded silence = flat", () => {
    const peaks = new Float32Array([0, 0.8]);
    expect(bucketDisplayValue(peaks, 0, { complete: false, placeholder: 0.06 })).toBe(0.06);
    expect(bucketDisplayValue(peaks, 0, { complete: true })).toBe(0); // true silence
    expect(bucketDisplayValue(peaks, 1, { complete: false })).toBeCloseTo(0.8, 5);
  });
});

// ─── Persistent cache (fake IndexedDB) ──────────────────────────────────────

describe("Waveform — IDB cache", () => {
  // The cache module memoizes its IDB connection — install ONE fake for the
  // whole suite so module state and assertions share the same store maps.
  let fake: ReturnType<typeof installFakeIndexedDB>;

  beforeAll(() => {
    fake = installFakeIndexedDB({ stores: ["waveforms"] });
  });
  afterAll(() => {
    fake.uninstall();
  });
  beforeEach(async () => {
    await clearWaveformCache();
  });

  it("put → get round-trips peaks as Float32Array", async () => {
    const peaks = new Float32Array([0.1, 0.5, 0.9]);
    await putWaveformToCache({
      key: "k1", trackId: "t1", version: WAVEFORM_VERSION, fingerprint: "180",
      bucketCount: 3, durationSec: 180, peaks, coverage: 1, complete: true, updatedAt: 1,
    });
    const got = await getWaveformFromCache("k1");
    expect(got).not.toBeNull();
    expect(got!.complete).toBe(true);
    // Float32 storage precision — compare with tolerance.
    expect(got!.peaks).toHaveLength(3);
    expect(got!.peaks[0]).toBeCloseTo(0.1, 5);
    expect(got!.peaks[1]).toBeCloseTo(0.5, 5);
    expect(got!.peaks[2]).toBeCloseTo(0.9, 5);
  });

  it("cache hit: same key returns instantly without recomputation signal", async () => {
    await putWaveformToCache({
      key: "k2", trackId: "t2", version: WAVEFORM_VERSION, fingerprint: "60",
      bucketCount: 360, durationSec: 60, peaks: new Float32Array(360).fill(0.5),
      coverage: 1, complete: true, updatedAt: 1,
    });
    const hit = await getWaveformFromCache("k2");
    expect(hit).not.toBeNull();
    expect(hit!.key).toBe("k2");
  });

  it("cache invalidation: wrong version entries are ignored (algorithm bump)", async () => {
    await putWaveformToCache({
      key: "old", trackId: "t3", version: WAVEFORM_VERSION, fingerprint: "60",
      bucketCount: 2, durationSec: 60, peaks: new Float32Array([0.5, 0.5]),
      coverage: 1, complete: true, updatedAt: 1,
    });
    // Simulate a version bump by writing a stale entry directly.
    const stale = {
      key: "stale", trackId: "t3", version: WAVEFORM_VERSION + 99, fingerprint: "60",
      bucketCount: 2, durationSec: 60, peaksBuf: new Float32Array([0.5, 0.5]).buffer as ArrayBuffer,
      coverage: 1, complete: true, updatedAt: 1,
    };
    // put through the raw fake store
    fake.stores.get("waveforms")!.set("stale", stale as unknown as Record<string, unknown>);
    expect(await getWaveformFromCache("stale")).toBeNull();
    expect(await getWaveformFromCache("old")).not.toBeNull();
  });

  it("clear wipes everything", async () => {
    await putWaveformToCache({
      key: "k3", trackId: "t4", version: WAVEFORM_VERSION, fingerprint: "10",
      bucketCount: 60, durationSec: 10, peaks: new Float32Array(60),
      coverage: 1, complete: true, updatedAt: 1,
    });
    await clearWaveformCache();
    expect(await getWaveformFromCache("k3")).toBeNull();
  });
});
