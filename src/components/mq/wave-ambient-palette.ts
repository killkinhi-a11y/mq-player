/*
 * wave-ambient-palette — artwork → DARK liquid-ambient palette.
 *
 * Contract (Wave Ambient Background spec):
 *  - the ambient palette ALWAYS stays dark, whatever the artwork:
 *      c1 = near-black deep base (hue kept, lightness ~5–8%)
 *      c2 = liquid mid tone (hue kept, lightness ≤ ~24%)
 *      c3 = accent depth (hue kept / nudged toward violet, lightness ≤ ~16%)
 *      hl = platinum highlight (artwork hue tinted silver, lightness ~83%)
 *  - hue is PRESERVED from the artwork so the scene reads as an extension
 *    of the current cover (blue → navy, red → burgundy, green → deep teal);
 *  - no country/genre logic, no blacklist — pure colour math;
 *  - pure functions only → unit-testable without a DOM.
 */

import type { DominantColors } from "@/hooks/useDominantColor";

export interface WavePalette {
  /** deep base — the "liquid" the light flows through */
  c1: [number, number, number];
  /** liquid mid tone — the main body of the flowing light */
  c2: [number, number, number];
  /** accent depth — secondary ridges / violet-leaning shadow */
  c3: [number, number, number];
  /** platinum highlight — narrow reflections + rim light */
  hl: [number, number, number];
}

export interface WavePaletteCss {
  c1: string;
  c2: string;
  c3: string;
  hl: string;
}

/**
 * The cold default (no artwork / extraction failed / demo):
 * deep navy base, navy liquid, indigo-violet accent, silver-blue highlight.
 * Matches the reference mood: "тёмный холодный фон, navy/indigo, electric
 * blue, мягкий white highlight, лёгкие violet оттенки".
 */
export const DEFAULT_WAVE_PALETTE: WavePalette = {
  c1: [7, 11, 22],
  c2: [18, 36, 72],
  c3: [38, 30, 84],
  hl: [214, 226, 255],
};

/** Anchor hue for achromatic covers — cold navy/indigo family. */
const COLD_HUE = 226 / 360;

/** Default anchor hue in DEGREES (0..360) — the Obsidian room. */
export const DEFAULT_WAVE_ANCHOR_HUE = 226;

/* ── colour helpers ──────────────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: [number, number, number]): string {
  return `#${c
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** RGB → HSL (h/s/l all 0..1) */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

/** HSL → RGB (h/s/l all 0..1) */
export function hslToRgb(h: number, g: number, l: number): [number, number, number] {
  const s = g;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [Math.round(f(hue + 1 / 3) * 255), Math.round(f(hue) * 255), Math.round(f(hue - 1 / 3) * 255)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Cap the brightest channel of an RGB triple — the hard "stay dark" guard. */
function capChannels(c: [number, number, number], maxChannel: number): [number, number, number] {
  const m = Math.max(c[0], c[1], c[2]);
  if (m <= maxChannel) return c;
  const k = maxChannel / m;
  return [c[0] * k, c[1] * k, c[2] * k];
}

/* ── the derivation ──────────────────────────────────────────────────── */

/**
 * Derive the dark liquid palette from the artwork's dominant colours.
 *
 * Hue rules (spec examples):
 *   blue artwork   → navy / blue / white ambient   (hue ~225 kept)
 *   violet artwork → violet / indigo               (hue ~270 kept)
 *   red artwork    → dark burgundy / red highlight (hue ~350 kept)
 *   green artwork  → emerald / deep teal           (hue ~150 kept)
 * Warm yellows/oranges are desaturated so they read as dark amber rather
 * than mud; near-achromatic covers fall back to the anchor family —
 * THEME-AWARE (§0): the anchor hue comes from the active theme's ambient
 * spec (default cold indigo), so even the fallback WAVE room respects
 * the selected theme.
 *
 * @param anchorHueDeg theme anchor hue in DEGREES (0..360) used when the
 *        artwork is achromatic. Defaults to the cold indigo family.
 */
export function deriveWavePalette(dc: DominantColors, anchorHueDeg?: number): WavePalette {
  const primary = hexToRgb(dc.primary || "#3355ff");
  const [h, s] = rgbToHsl(primary[0], primary[1], primary[2]);

  // Achromatic / nearly-grey cover → the THEME's anchor family
  const achromatic = s < 0.16;
  const anchorHue =
    anchorHueDeg != null && Number.isFinite(anchorHueDeg)
      ? (((anchorHueDeg % 360) + 360) % 360) / 360
      : COLD_HUE;
  const baseHue = achromatic ? anchorHue : h;
  // Warm yellow-orange → desaturate harder (dark amber, never neon)
  const warm = baseHue > 30 / 360 && baseHue < 75 / 360;

  const sat = (mult: number, lo: number, hi: number, extra = 1) =>
    clamp(clamp(s * mult, lo, hi) * extra, 0, 1);

  // c1 — deep base: keep the hue, force very low lightness
  const c1 = hslToRgb(
    baseHue,
    sat(0.55, 0.14, 0.42),
    0.05 + 0.025 * s,
  );

  // c2 — liquid mid: the artwork's voice, capped dark
  const c2 = hslToRgb(
    baseHue,
    sat(0.8, 0.28, 0.58, warm ? 0.72 : 1),
    0.185 + (s > 0.5 ? 0.045 : 0.015),
  );

  // c3 — accent: nudge blues toward indigo-violet for depth richness
  let c3Hue = baseHue;
  if (!achromatic && baseHue > 180 / 360 && baseHue < 300 / 360) c3Hue = (baseHue + 24 / 360) % 1;
  const c3 = hslToRgb(c3Hue, sat(0.7, 0.22, 0.5, warm ? 0.75 : 1), 0.125);

  // hl — platinum: silver-white carrying a whisper of the artwork hue
  const hl = hslToRgb(baseHue, sat(0.22, 0.05, 0.18), 0.83);

  return {
    c1: capChannels(c1, 40),
    c2: capChannels(c2, 78),
    c3: capChannels(c3, 56),
    hl,
  };
}

/** Palette → CSS custom properties (published on <html>). */
export function paletteToCss(p: WavePalette): WavePaletteCss {
  return {
    c1: rgbToHex(p.c1),
    c2: rgbToHex(p.c2),
    c3: rgbToHex(p.c3),
    hl: rgbToHex(p.hl),
  };
}

/**
 * THEME-AWARE default palette (no artwork / extraction pending):
 * the same dark-liquid construction, anchored on the THEME's hue
 * (§0 — WAVE respects the selected theme even before artwork weighs in).
 * Lightness/saturation mirror DEFAULT_WAVE_PALETTE so every theme's
 * fallback room keeps the identical calm register.
 */
export function defaultPaletteForHue(hueDeg: number): WavePalette {
  const norm = ((Math.round(hueDeg) % 360) + 360) % 360;
  // The canonical cold room — EXACTLY the CSS @property initial values
  // (zero discontinuity between SSR fallback and the JS-derived palette).
  if (norm === 226) return DEFAULT_WAVE_PALETTE;
  const h = norm / 360;
  const warm = h > 30 / 360 && h < 75 / 360;
  const sat = warm ? 0.36 : 0.46;
  return {
    c1: capChannels(hslToRgb(h, 0.3, 0.062), 40),
    c2: capChannels(hslToRgb(h, sat, 0.19), 78),
    c3: capChannels(hslToRgb((h + 24 / 360) % 1, 0.38, 0.13), 56),
    hl: hslToRgb(h, 0.12, 0.83),
  };
}

/** Linear palette interpolation (per-channel). t = 0 → a, 1 → b. */
export function lerpPalette(a: WavePalette, b: WavePalette, t: number): WavePalette {
  const l = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return { c1: l(a.c1, b.c1), c2: l(a.c2, b.c2), c3: l(a.c3, b.c3), hl: l(a.hl, b.hl) };
}
