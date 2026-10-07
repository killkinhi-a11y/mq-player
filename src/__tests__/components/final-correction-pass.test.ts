/**
 * FINAL VISUAL CORRECTION PASS — contract suite.
 *
 * The previous "final refinement" reported PASS from tests/computed styles,
 * but a screenshot-first audit of production found REAL unfixed items:
 *
 *  1. §1 WAVE main surface had NO geometry — V2.5 removed the card chrome
 *     entirely and the hero read as a flat rectangular zone ("card not
 *     rounded"). Now: one refined SOLID surface, visible 14–18px radius.
 *  2. §6–7 the editorial NORMAL background was INVISIBLE on every tab —
 *     .mq-app-root painted an opaque background over the z:-1 ambient.
 *  3. §14 «Волна по твоему вкусу» was still user-facing (reasons.ts +
 *     the wave API label fallback).
 *  4. §13 «Играет/Пауза» status eyebrows still lived in both full players
 *     and the mobile player header; the Home header chip said
 *     «WAVE · играет».
 *  5. §4/§7 primary play CTAs on Home were still RED discs/pills
 *     (FeaturedCard «Слушать», Continue listening play, HeroWaveCTA) —
 *     primary play belongs to flat Liquid Platinum.
 *  6. §19 the PlayerBar inline volume fill + the vertical slider track
 *     were still red — volume is a neutral utility control everywhere.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waveReasonText, waveSeedLabel } from "@/lib/wave/reasons";

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), ...f), "utf8");

describe("FCP §1 — WAVE main surface: solid, visibly rounded, clean clipping", () => {
  it("the hero surface paints an opaque solid fill with the float radius", () => {
    const css = readSrc("src/app/globals.css");
    const waveBlock = css.match(/\.mq-wave \{[^}]*\}/)?.[0] ?? "";
    expect(waveBlock).toContain("border-radius: var(--mq-mat-radius-float");
    expect(waveBlock).toContain("background: color-mix(in srgb,");
    // solid + flat: no glass tokens, no transparency, no lit shoulder
    expect(waveBlock).not.toContain("mq-g2-");
    expect(waveBlock).not.toContain("radial-gradient");
  });

  it("the artwork frame keeps its own clean radius + clipping (no box-in-box)", () => {
    const css = readSrc("src/app/globals.css");
    const art = css.match(/\.mq-wave-art \{[^}]*\}/)?.[0] ?? "";
    expect(art).toContain("border-radius: 20px");
    expect(art).toContain("overflow: hidden");
    // DESIGN COMPLETION: the V2.5 glass bezel (7px inset / inner radius)
    // read as box-in-box in visual audits — the artwork now clips
    // edge-to-edge: layers fill the frame (inset 0) and INHERIT the
    // frame radius. No inner frame, no second radius, no blur.
    const layer = css.match(/\.mq-wave-art-layer \{[^}]*\}/)?.[0] ?? "";
    expect(layer).toContain("inset: 0");
    expect(layer).toContain("border-radius: inherit");
    expect(layer).not.toContain("inset: 7px");
    expect(layer).not.toContain("inset: 9px");
    // and the mobile override no longer re-introduces a bezel
    const mobileOverride = css.match(/@media \(max-width: 767px\) \{\s*\.mq-wave-ambient[^}]*\}[^}]*\}/)?.[0] ?? "";
    expect(mobileOverride).not.toContain("mq-wave-art-layer { inset");
  });
});

describe("FCP §6–7 — the normal MQ background exists without WAVE, on every tab", () => {
  it("the app root never paints over the ambient layer", () => {
    const css = readSrc("src/app/globals.css");
    const rootBlock = css.match(/\.mq-app-root \{[^}]*\}/)?.[0] ?? "";
    expect(rootBlock).toContain("background-color: transparent");
  });

  it("the ambient base owns the opaque floor (nothing see-through to body)", () => {
    const css = readSrc("src/app/globals.css");
    const baseBlock = css.match(/\.mq-ambient-base \{[^}]*\}/)?.[0] ?? "";
    expect(baseBlock).toContain("var(--mq-bg)");
  });

  it("the WAVE liquid scene stays opaque so it covers the ambient in radio mode", () => {
    const css = readSrc("src/app/globals.css");
    const liquid = css.match(/\.mq-wave-liquid \{[^}]*\}/)?.[0] ?? "";
    // FINAL DESIGN COMPLETION §0: the base is THEME-AWARE (registered
    // --mq-wave-base with an opaque near-black fallback) — still opaque,
    // never transparent, so it fully covers the ambient in radio mode.
    expect(liquid).toMatch(/background:\s*var\(--mq-wave-base, #05070d\)/);
    expect(liquid).not.toContain("transparent");
  });
});

describe("FCP §13 — decorative status labels are gone", () => {
  it("no Играет/Пауза eyebrow in either desktop full player header", () => {
    for (const f of [
      "src/components/mq/FullTrackView.tsx",
      "src/components/mq/fullplayer/SpatialFullPlayer.tsx",
    ]) {
      const src = readSrc(f);
      expect(src, f).not.toMatch(/"Играет"|"Пауза"\}[^;]*<\/p>/);
      expect(src, f).not.toContain('isPlaying ? "Играет"');
    }
  });

  it("the mobile full player header carries queue context only (no ИГРАЕТ word)", () => {
    const src = readSrc("src/components/mq/FullTrackViewMobile.tsx");
    expect(src).not.toContain("contextLabel");
    expect(src).not.toContain('"ИГРАЕТ"');
    expect(src).not.toContain('"ПАУЗА"');
  });

  it("the Home header chip says the mode name only — no «· играет» suffix", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).not.toContain("WAVE · играет");
    expect(src).not.toContain("WAVE · ИГРАЕТ");
  });
});

describe("FCP §4+§7 + V2 §10 — primary play is flat Liquid Glass, red is rare", () => {
  it("Home's primary play CTAs are liquid-glass primary buttons, not red fills", () => {
    const main = readSrc("src/components/mq/MainView.tsx");
    // FeaturedCard «Слушать» CTA
    expect(main).toMatch(/mq-platinum-btn h-11 px-6/);
    // Continue-listening play disc (V2: + mq-press motion + inline glass blur)
    expect(main).toMatch(/mq-platinum-btn mq-press w-12 h-12/);
    expect(main).toMatch(/backdropFilter: "var\(--mq-blur-md\)"/);
    // HeroWaveCTA (compact disc + full button)
    expect(main).toMatch(/mq-platinum-btn w-11 h-11 rounded-full/);
    expect(main).toMatch(/mq-platinum-btn w-full h-12/);
    // …and no red play discs remain
    expect(main).not.toMatch(/backgroundColor: "var\(--mq-accent\)"[\s\S]{0,80}aria-label=\{isPlaying \? "Пауза"/);
  });

  it("utility chrome is tonal: count badges + retry are not red", () => {
    const main = readSrc("src/components/mq/MainView.tsx");
    expect(main).not.toMatch(/backgroundColor: "var\(--mq-accent\)", color: "var\(--mq-text-on-accent, #fff\)" \}\}[^<]*>\s*\{count/);
    expect(main).not.toMatch(/boxShadow: "var\(--mq-shadow-accent\)"/);
  });
});

describe("FCP §19 — volume is a neutral utility control EVERYWHERE", () => {
  it("the PlayerBar inline volume fill is not red", () => {
    const src = readSrc("src/components/mq/PlayerBar.tsx");
    // nothing accent-colored near the volume fill/thumb refs
    expect(src).not.toMatch(/volFillRef[\s\S]{0,700}var\(--mq-accent\)/);
    expect(src).not.toMatch(/volThumbRef[\s\S]{0,700}var\(--mq-accent\)/);
    // and the fill uses the neutral utility tint
    expect(src).toMatch(/volFillRef[\s\S]{0,700}34%, transparent/);
  });

  it("the vertical slider track is neutral too (not just the horizontal one)", () => {
    const css = readSrc("src/app/globals.css");
    const vtrack = css.match(/input\.mq-vslider-input::-webkit-slider-runnable-track \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(vtrack).not.toContain("var(--mq-accent)");
    const vprogress = css.match(/input\.mq-vslider-input::-moz-range-progress \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(vprogress).not.toContain("var(--mq-accent)");
  });
});

describe("FCP §14 — WAVE terminology reaches the reason/seed copy", () => {
  it("waveSeedLabel speaks WAVE for every seed kind", () => {
    expect(waveSeedLabel("track", "X")).toBe("WAVE от «X»");
    expect(waveSeedLabel("artist", "X")).toBe("WAVE по артисту X");
    expect(waveSeedLabel("album", "X")).toBe("WAVE по альбому «X»");
    expect(waveSeedLabel("playlist", "X")).toBe("WAVE по плейлисту «X»");
    expect(waveSeedLabel("genre", "X")).toBe("WAVE по жанру X");
    expect(waveSeedLabel("taste", "")).toBe("WAVE по твоему вкусу");
  });

  it("the reason fallback says WAVE, never «Волна»", () => {
    expect(waveReasonText("unknown_kind" as never)).toBe("WAVE");
  });

  it("the wave API label fallback is WAVE", () => {
    const src = readSrc("src/app/api/wave/route.ts");
    expect(src).not.toContain('|| "Волна"');
    expect(src).toContain('|| "WAVE"');
  });
});
