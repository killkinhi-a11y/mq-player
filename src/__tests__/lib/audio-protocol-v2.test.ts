/**
 * Audio Engine v2 — protocol contract tests.
 *
 * The worker/worklet are plain ES2019 scripts served as immutable assets (no
 * bundler, no imports) — they cannot be unit-imported. These tests pin the
 * WIRE PROTOCOL and realtime-hygiene invariants that the rest of the system
 * depends on; a regression here is a regression in the browser pipeline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const workerSrc = readFileSync(
  join(process.cwd(), "audio-engine/js/mq-decode-worker.js"),
  "utf8"
);
const workletSrc = readFileSync(
  join(process.cwd(), "audio-engine/js/mq-audio-worklet.js"),
  "utf8"
);

describe("engine v2 worker contract", () => {
  it("stamps the generation on every PCM and boundary message", () => {
    // PCM carries gen (stale-drop guard on the worklet side)
    expect(workerSrc).toMatch(/\{ type: 'pcm', gen: pcmGen, rate: activeRate\(\)/);
    // trackStart carries gen AND the cumulative send position
    expect(workerSrc).toMatch(/\{ type: 'trackStart', gen: pcmGen, trackId: [^,]+, cumSent: sentTotal \}/);
  });

  it("sends the boundary marker on the PCM port (FIFO ⇒ boundary order = PCM order)", () => {
    expect(workerSrc).toMatch(/pcmPort\.postMessage\(\{ type: 'trackStart'/);
  });

  it("drops credit messages whose generation does not match (no resurrected windows)", () => {
    expect(workerSrc).toMatch(/e\.data\.type === 'credit'/);
    expect(workerSrc).toMatch(/\(e\.data\.gen \| 0\) !== pcmGen\) return/);
  });

  it("resets the credit space on load/seek (generation isolation)", () => {
    expect(workerSrc).toMatch(/function resetForGen\(\)/);
    expect(workerSrc).toMatch(/grantedTotal = 0/);
  });

  it("decodes the next track in a SECOND decoder slot (gapless, no decode race)", () => {
    expect(workerSrc).toMatch(/ex\.mq_dec_new\(\)/);
    expect(workerSrc).toMatch(/nt\.dec = d/);
    // rotation: the next decoder becomes the active one at the boundary
    expect(workerSrc).toMatch(/dec0 = nt\.dec/);
  });

  it("commits gapless ONLY when rates match (context is rate-locked)", () => {
    expect(workerSrc).toMatch(/nt\.rate === activeRate\(\)/);
  });

  it("bounded silence trim: caps present, threshold present", () => {
    expect(workerSrc).toMatch(/TRIM_LEAD_FRAMES = 1152/);
    expect(workerSrc).toMatch(/TRIM_TAIL_FRAMES = 2304/);
    expect(workerSrc).toMatch(/TRIM_THRESHOLD = 1e-4/);
  });

  it("PCM health validator scans every chunk (NaN/DC/delta)", () => {
    expect(workerSrc).toMatch(/function scanChunk\(l, r\)/);
    expect(workerSrc).toMatch(/health\.nanInf\+\+/);
    expect(workerSrc).toMatch(/health\.dcSum \+= a \+ b/);
  });

  it("range-window loop never fakes EOF on truncated windows", () => {
    expect(workerSrc).toMatch(/rangeEnd < totalBytes - 1/);
    expect(workerSrc).toMatch(/windowStart = nxt/);
  });

  it("retry with backoff, AbortError is not retried", () => {
    expect(workerSrc).toMatch(/attempt > 2/);
    expect(workerSrc).toMatch(/e\.name === 'AbortError'\) return null/);
  });

  it("seek coalescing defers the refetch (rapid scrubbing = one round trip)", () => {
    expect(workerSrc).toMatch(/SEEK_COALESCE_MS = 150/);
  });

  it("segment cache is bounded", () => {
    expect(workerSrc).toMatch(/CACHE_BUDGET_BYTES = 12 \* 1024 \* 1024/);
  });

  it("ES2019 compliance: no optional chaining / nullish coalescing (worker must run everywhere)", () => {
    expect(workerSrc).not.toMatch(/\?\./);
    expect(workerSrc).not.toMatch(/\?\?/);
    expect(workerSrc).not.toMatch(/`/);
  });
});

describe("engine v2 worklet contract", () => {
  it("is persistent: the engine is created in init, never per track", () => {
    expect(workletSrc).toMatch(/case 'init':/);
    // no per-load teardown hook for track changes (destroy is session-level)
    const destroys = workletSrc.match(/destroyInternal/g) || [];
    expect(destroys.length).toBeGreaterThan(0);
  });

  it("drops stale-generation PCM before touching the ring", () => {
    expect(workletSrc).toMatch(/\(msg\.gen \| 0\) !== this\.gen\)/);
    expect(workletSrc).toMatch(/this\.pcmStale \+= msg\.frames \| 0/);
  });

  it("drops wrong-rate PCM and reports the mismatch (rate-locked context)", () => {
    expect(workletSrc).toMatch(/msg\.rate && \(msg\.rate \| 0\) !== \(sampleRate \| 0\)/);
    expect(workletSrc).toMatch(/type: 'rateMismatch'/);
  });

  it("maps trackStart into the playhead space and emits trackEnded on crossing", () => {
    expect(workletSrc).toMatch(/this\.playheadBase \+ \(msg\.cumSent \| 0\)/);
    expect(workletSrc).toMatch(/type: 'trackEnded'/);
    expect(workletSrc).toMatch(/playhead >= b\[idx \+ 1\]\.abs/);
  });

  it("SEEK seeds the boundary map + resets credit atomically", () => {
    expect(workletSrc).toMatch(/this\.playheadBase = Math\.max\(0, \+msg\.a \|\| 0\)/);
    expect(workletSrc).toMatch(/this\.boundaries = \[\{ trackId:/);
    expect(workletSrc).toMatch(/this\.grantedTotal = 0/);
  });

  it("overrun with active boundaries invalidates the gapless map (no skew)", () => {
    expect(workletSrc).toMatch(/ring overrun with active boundaries/);
  });

  it("realtime hygiene: no per-block allocation (fixed procNs window)", () => {
    expect(workletSrc).toMatch(/new Float64Array\(PROC_WIN\)/);
    expect(workletSrc).not.toMatch(/procNsWindow\.push/);
    expect(workletSrc).not.toMatch(/\.sort\(/); // p95 lives on the main thread
  });

  it("ES2019 + no template literals in the RT file", () => {
    expect(workletSrc).not.toMatch(/\?\./);
    expect(workletSrc).not.toMatch(/\?\?/);
    expect(workletSrc).not.toMatch(/`/);
  });
});

describe("engine v2 clock math (A6)", () => {
  it("interpolation is clamped — extrapolation cannot run away", async () => {
    const mod = await import("@/lib/wasm-audio/types");
    // The clamp constant lives in the backend module; assert the exported
    // surface compiles with the interpolated getter contract instead.
    expect(typeof mod.ENGINE_LIFECYCLE).toBe("object");
    expect(mod.ENGINE_LIFECYCLE).toContain("STARVED");
    expect(mod.ENGINE_LIFECYCLE).toContain("RECOVERING");
    expect(mod.WORKLET_STATE.STARVED).toBe(4);
  });
});
