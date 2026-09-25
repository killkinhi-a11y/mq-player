/**
 * LiquidLyrics — sync math + structure tests.
 *
 * The timing source is line-level only (lrclib LRC). Word windows are a
 * deterministic VISUAL distribution of real line progress — never
 * invented audio timing. These tests pin that contract.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Component CSS — vitest must not push it through postcss/tailwind
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

import { wordWindows, findActiveIdx, lineFill } from "@/components/mq/LiquidLyrics";
import type { LyricLine } from "@/components/mq/LyricsView";

const L = (time: number, text = "x"): LyricLine => ({ time, text });

describe("findActiveIdx (binary search)", () => {
  const lines = [L(0), L(10), L(20), L(30)];
  it("finds the current line", () => {
    expect(findActiveIdx(lines, 5)).toBe(0);
    expect(findActiveIdx(lines, 10)).toBe(1);
    expect(findActiveIdx(lines, 29.9)).toBe(2);
    expect(findActiveIdx(lines, 100)).toBe(3);
  });
  it("returns -1 before the first line (intro)", () => {
    expect(findActiveIdx(lines, -1)).toBe(-1);
  });
  it("handles empty lyrics", () => {
    expect(findActiveIdx([], 5)).toBe(-1);
  });
});

describe("lineFill (real line progress)", () => {
  it("computes 0..1 between line start and the next line's start", () => {
    const lines = [L(10), L(20)];
    expect(lineFill(lines, 0, 10, 0)).toBe(0);
    expect(lineFill(lines, 0, 15, 0)).toBe(0.5);
    expect(lineFill(lines, 0, 20, 0)).toBe(1);
  });
  it("clamps outside the window (seek before/after)", () => {
    const lines = [L(10), L(20)];
    expect(lineFill(lines, 0, 5, 0)).toBe(0);
    expect(lineFill(lines, 0, 25, 0)).toBe(1);
  });
  it("bounds the LAST line: duration first, capped at +6s (long outro)", () => {
    const lines = [L(100)];
    // duration 103 → line completes with the track
    expect(lineFill(lines, 0, 101.5, 103)).toBe(0.5);
    // duration far away → 6s cap so the last line doesn't crawl
    expect(lineFill(lines, 0, 103, 200)).toBe(0.5);
    // no duration → 5s default window
    expect(lineFill(lines, 0, 102.5, 0)).toBe(0.5);
  });
  it("degenerate tiny spans never divide by zero — always a valid 0..1", () => {
    const lines = [L(10), L(10.02)];
    const p = lineFill(lines, 0, 10.01, 0);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("wordWindows (derived, not invented, timing)", () => {
  it("single-word lines fill across the whole line", () => {
    expect(wordWindows(1)).toEqual([[0, 1]]);
  });
  it("first word starts at 0; last word ends at 100", () => {
    const w = wordWindows(4);
    expect(w[0][0]).toBe(0);
    // last window: start + 100*inv ≈ 100
    const [a, inv] = w[3];
    expect(a + 100 / inv).toBeCloseTo(100, 1);
  });
  it("all windows have a sane span (no division blowups)", () => {
    for (let n = 2; n <= 20; n++) {
      for (const [a, inv] of wordWindows(n)) {
        const span = 100 / inv;
        expect(span).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(span).toBeLessThanOrEqual(100 + 1e-9);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(100);
      }
    }
  });
  it("windows overlap into a left-to-right cascade (word i finishes after word i starts)", () => {
    const w = wordWindows(5);
    for (let i = 0; i < 4; i++) {
      const endI = w[i][0] + 100 / w[i][1];
      expect(endI).toBeGreaterThan(w[i + 1][0]);
    }
  });
});

/* ── v10.1 §17 regression: active line must not clip its container ────
 * Found live in production QA (VLM + geometry probe): .ll-on scales to
 * 1.12 from its left edge; at width:100% the right ~12% of the line box
 * (and any text filling it) crossed the lyrics container — clipped at
 * the panel edge on desktop, at the viewport on mobile. Contract:
 * width × active-scale ≤ 100% so the scaled line always fits. */
describe("lyrics line geometry (source contract)", () => {
  const css = readFileSync(
    join(process.cwd(), "src/components/mq/liquid-lyrics.css"),
    "utf8",
  );

  it("ll-line width × 1.12 active scale fits the container (no right-edge clip)", () => {
    const widthMatch = css.match(/\.ll-line\s*{[^}]*width:\s*([\d.]+)%/);
    expect(widthMatch).not.toBeNull();
    const width = parseFloat(widthMatch![1]);
    const activeScale = css.match(/\.ll-line\.ll-on\s*{[^}]*transform:\s*scale\(([\d.]+)\)/);
    expect(activeScale).not.toBeNull();
    const scale = parseFloat(activeScale![1]);
    // Border-box width includes the horizontal padding, so the scaled box
    // is exactly width × scale — must not exceed 100% of the container.
    expect(width * scale).toBeLessThanOrEqual(100 + 1e-9);
  });

  it("scale still originates at the left edge (reading emphasis, no reflow)", () => {
    expect(css).toMatch(/\.ll-line\s*\{[^}]*transform-origin:\s*left center/);
  });
});
