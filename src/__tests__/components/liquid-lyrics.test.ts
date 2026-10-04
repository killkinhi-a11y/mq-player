/**
 * LiquidLyrics — sync math + structure tests (v11: normalized ms format).
 *
 * The timing source is line-level only (LRCLIB LRC). Word windows are a
 * deterministic VISUAL distribution of real line progress — never invented
 * audio timing. These tests pin that contract, including the endMs-aware
 * fill windows and the virtualization range math.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Component CSS — vitest must not push it through postcss/tailwind
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

import {
  wordWindows,
  findActiveIdx,
  lineFill,
  visibleRange,
  VIRTUALIZE_THRESHOLD,
} from "@/components/mq/LiquidLyrics";
import type { LyricLine } from "@/lib/lyrics/types";

/** Line in the v11 normalized format: startMs/endMs in MILLISECONDS. */
const L = (startSec: number, text = "x", endMs?: number): LyricLine => ({
  text,
  startMs: Math.round(startSec * 1000),
  ...(endMs !== undefined ? { endMs } : {}),
});

describe("findActiveIdx (binary search, ms format)", () => {
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

describe("lineFill (real line progress, ms format)", () => {
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
  it("uses the line's explicit endMs when present (tighter LRCLIB timing)", () => {
    // Line 10s..12s (endMs 12000), next line at 20s: fill must respect 12s.
    const lines = [L(10, "a", 12000), L(20)];
    expect(lineFill(lines, 0, 11, 0)).toBeCloseTo(0.5, 5);
    expect(lineFill(lines, 0, 12.5, 0)).toBe(1); // past endMs → complete
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

describe("seek synchronization (spec §9: audio clock → lyrics)", () => {
  const lines = [L(0, "интро"), L(12, "куплет"), L(45, "припев"), L(80, "аутро")];

  it("a seek to any timestamp lands on the right line instantly", () => {
    expect(findActiveIdx(lines, 0)).toBe(0);
    expect(findActiveIdx(lines, 12)).toBe(1);
    expect(findActiveIdx(lines, 44.999)).toBe(1);
    expect(findActiveIdx(lines, 45)).toBe(2);
    expect(findActiveIdx(lines, 79.99)).toBe(2);
    expect(findActiveIdx(lines, 120)).toBe(3);
  });

  it("karaoke fill restarts at 0 after a seek INTO a line and reaches 1 at its end", () => {
    const idx = findActiveIdx(lines, 45);
    expect(idx).toBe(2);
    expect(lineFill(lines, idx, 45, 90)).toBe(0);
    expect(lineFill(lines, idx, 62.5, 90)).toBe(0.5); // 45→80 window
    expect(lineFill(lines, idx, 80, 90)).toBe(1);
  });

  it("pause does not advance anything: same position → same fill", () => {
    const idx = findActiveIdx(lines, 50);
    const a = lineFill(lines, idx, 50, 90);
    const b = lineFill(lines, idx, 50, 90); // paused = position frozen
    expect(a).toBe(b);
  });
});

describe("visibleRange (virtualization, spec §10)", () => {
  it("covers the active line and the visible viewport with overscan", () => {
    // 30px lines, 600px viewport scrolled to 0, active line 10.
    const [lo, hi] = visibleRange(1000, 30, 0, 600, 10, 36);
    expect(lo).toBe(0);
    expect(hi).toBe(600 / 30 + 36); // visible (20) + overscan
  });

  it("follows the user reading ahead (range = union of active ∪ visible)", () => {
    const [lo, hi] = visibleRange(1000, 30, 2400, 600, 5, 36);
    expect(lo).toBe(0);              // active 5 pins the bottom: 5 − 36 clamped
    expect(hi).toBe(100 + 36);      // lastVisible 100 + overscan
  });

  it("active line far below the fold is still rendered", () => {
    const [lo, hi] = visibleRange(1000, 30, 0, 300, 500, 36);
    expect(lo).toBe(0);
    expect(hi).toBe(501 + 36); // active 500 → activeIdx+1=501 + overscan
  });

  it("clamps to the array bounds; degenerate line height falls back", () => {
    expect(visibleRange(10, 30, 0, 600, 0, 36)).toEqual([0, 10]);
    const [lo] = visibleRange(100, 0, 0, 600, 0, 36);
    expect(lo).toBe(0); // lh=0 → safe 30 fallback, no NaN
  });

  it("threshold: typical lyrics (≤ threshold lines) render fully", () => {
    expect(VIRTUALIZE_THRESHOLD).toBeGreaterThan(200); // only extreme texts virtualize
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

  it("v11 custom-font vars have MQ defaults as fallbacks (unset = old look)", () => {
    expect(css).toMatch(/font-family:\s*var\(--ll-font-family,\s*inherit\)/);
    expect(css).toMatch(/font-size:\s*var\(--ll-font-size,\s*var\(--ll-size\)\)/);
    expect(css).toMatch(/line-height:\s*var\(--ll-line-height,\s*1\.52\)/);
  });

  it("v11 static mode (animated lyrics OFF) removes the water layer entirely", () => {
    expect(css).toMatch(/\.ll-static \.ll-line\.ll-on \.ll-w::before\s*\{\s*content:\s*none/);
  });

  it("v11 focus variant exists with centered typography", () => {
    expect(css).toMatch(/\.ll-focus\s*\{/);
    expect(css).toMatch(/\.ll-focus \.ll-line\s*\{[^}]*text-align:\s*center/);
  });
});

// ── v11.1 regression: the custom font never visually applied ──────────────
// Root cause: --ll-font-family was built as `"MQFont_x", var(--mq-font-display,
// inherit)` — (a) --mq-font-display does not exist anywhere in the product,
// and (b) a CSS-wide keyword (`inherit`) inside a var() fallback makes the
// whole font-family declaration INVALID AT COMPUTED-VALUE TIME, so the
// browser silently fell back to the parent font (Manrope). The var was "set"
// but the font never rendered. These tests pin the fixed chain.
describe("Lyrics appearance — --ll-font-family chain (custom fonts actually apply)", () => {
  it("applyLyricsAppearance writes a chain WITHOUT CSS-wide keywords in var() fallbacks", async () => {
    const { applyLyricsAppearance } = await import("@/lib/lyricsAppearance");
    applyLyricsAppearance({
      lyricsFontFamily: "MQFont_abc",
      lyricsFontSize: 0,
      lyricsFontWeight: 0,
      lyricsLineHeight: 0,
      lyricsLetterSpacing: 0,
    });
    const v = document.documentElement.style.getPropertyValue("--ll-font-family");
    expect(v).toContain("MQFont_abc");
    // The two fatal patterns from the bug:
    expect(v).not.toMatch(/inherit|initial|revert|unset/); // CSS-wide keywords
    expect(v).not.toContain("--mq-font-display");          // undefined var
    // The fallback must be the DEFINED primary font var with a literal guard.
    expect(v).toMatch(/var\(--mq-font-primary, sans-serif\)/);
  });

  it("appearance source no longer references the undefined --mq-font-display", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/lyricsAppearance.ts"),
      "utf-8",
    );
    expect(src).not.toContain("--mq-font-display");
    const previewSrc = readFileSync(
      join(process.cwd(), "src/components/mq/lyrics/LyricsAppearanceControls.tsx"),
      "utf-8",
    );
    expect(previewSrc).not.toContain("var(--mq-font-display");
  });
});
