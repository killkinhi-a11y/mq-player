/**
 * MQ — FINAL VISUAL REFINEMENT contract tests.
 *
 * Pins the FINAL pass decisions (on top of the V2.5 material system):
 *
 *  1. FLAT BUTTONS — no 3D chrome: no radial specular, no reflection
 *     bands, no bevel shadow stacks, no hover sweeps on controls.
 *  2. SOLID CARDS — content surfaces are opaque mixes over --mq-bg,
 *     never transparent tints; cards carry hairline edge + quiet shadow.
 *  3. GLASS IS SELECTIVE — mq-glass2/backdrop blur ONLY on the floating
 *     layer (nav, player capsule, dock, sidebar, menus); never on
 *     content cards.
 *  4. RADIUS SCALE — 12/14/20 px steps exist; no 24–32px blanket radius
 *     on the primary surfaces.
 *  5. PLATINUM DISCIPLINE — active progress (PlayerBar ProgressBar,
 *     WAVE progress, dock strip, mobile hero strip) is the flat platinum
 *     gradient token; the old red fills are gone.
 *  6. ACCENT RARITY — reasons/eyebrows/counts are muted, not red; the
 *     «Сейчас играет»/«играет» text badges are gone.
 *  7. NO DEAD ZONES — container widths widened (1024→1200 wide,
 *      640→760 narrow) so ≥1440 viewports don't show a right-side void.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), ...f), "utf8");

describe("FINAL §1 — buttons are FLAT (no 3D chrome objects)", () => {
  it("platinum button has no radial specular, no reflection band, no bevel", () => {
    const css = readSrc("src/styles/materials-v25.css");
    const btn = css.match(/\.mq-platinum-btn \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(btn).not.toContain("radial-gradient");
    expect(btn).not.toContain("mq-platinum-refl"); // no reflection band in the body
    // bevel shadow stacks = TWO inset rims; flat allows ONE subtle top light
    const insetCount = (btn.match(/inset/g) ?? []).length;
    expect(insetCount, "platinum body must have at most one inner light").toBeLessThanOrEqual(1);
  });

  it("no specular sweep animation anywhere in the material system", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).not.toContain("@keyframes mq-platinum-sweep");
    expect(css).not.toContain(".mq-platinum-btn::after");
  });
});

describe("FINAL §2+3 — cards are SOLID; glass stays on the floating layer", () => {
  it("surface tokens are opaque mixes over the page background", () => {
    const css = readSrc("src/styles/materials-v25.css");
    for (const tok of ["--mq-mat-1-bg", "--mq-mat-2-bg", "--mq-mat-3-bg", "--mq-mat-3-bg-hover"]) {
      const m = css.match(new RegExp(`${tok}: ([^;]+);`));
      expect(m, `${tok} must be defined`).toBeTruthy();
      expect(m![1], `${tok} must mix with var(--mq-bg), not transparent`).toContain("var(--mq-bg)");
    }
  });

  it("content cards carry a hairline edge + quiet shadow", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toMatch(/--mq-mat-2-shadow:/);
    expect(css).toMatch(/\.mq-mat-2 \{[\s\S]*?box-shadow: var\(--mq-mat-2-shadow\);/);
  });

  it("mq-glass2/backdrop blur is used ONLY by floating surfaces (V2: + primary controls + sticky search strip)", () => {
    const floaters = [
      "src/components/mq/PlayerBar.tsx",
      "src/components/mq/NavBar.tsx",
      "src/components/mq/MobileDock.tsx",
      "src/components/mq/Sidebar.tsx",
    ];
    const content = [
      "src/components/mq/LibraryView.tsx",
      "src/components/mq/SettingsView.tsx",
      "src/components/mq/QueueView.tsx",
    ];
    for (const f of floaters) {
      expect(readSrc(f), `${f} should own the glass layer`).toMatch(/mq-glass2|backdropFilter/);
    }
    for (const f of content) {
      const src = readSrc(f);
      expect(src, `${f} must not blur its content surfaces`).not.toMatch(/backdropFilter|backdrop-filter/);
      expect(src, `${f} must not use glass cards`).not.toContain("mq-glass2");
    }
    // V2 §10.5/§20: MainView + SearchView are content views BUT their
    // PRIMARY control (hero play) / floating sticky strip are glass —
    // exactly ONE blur surface each, everything else stays solid.
    for (const f of ["src/components/mq/MainView.tsx", "src/components/mq/SearchView.tsx"]) {
      const src = readSrc(f);
      const blurs = (src.match(/backdropFilter: "var\(--mq-blur-md\)"|backdropFilter: "blur\(14px\)"/g) || []).length;
      expect(blurs, `${f}: exactly one floating blur surface (primary control / sticky strip)`).toBe(1);
      expect(src, `${f} must not use glass cards`).not.toContain("mq-glass2");
    }
  });

  it("glass got quieter: blur token ≤ 16px, sheen ≤ 5%", () => {
    const css = readSrc("src/styles/materials-v25.css");
    const blur = css.match(/--mq-g2-blur: (\d+)px/);
    expect(Number(blur![1])).toBeLessThanOrEqual(16);
    expect(css).toContain("var(--mq-text) 4.5%, transparent)"); // sheen (DC value)
  });
});

describe("FINAL §4 — radius scale", () => {
  it("the 12/14/20 scale exists", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toContain("--mq-mat-radius-sm: 12px");
    expect(css).toContain("--mq-mat-radius: 14px");
    expect(css).toContain("--mq-mat-radius-lg: 20px");
  });

  it("primary surfaces left the 24px+ club", () => {
    expect(readSrc("src/components/mq/FullTrackView.tsx")).not.toContain("rounded-3xl");
  });
});

describe("FINAL §5+7 + V2 §10 — cold-light progress + accent rarity", () => {
  it("the progress token exists and is SOLID cold light (no platinum gradient)", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toMatch(/--mq-platinum-progress:\s*\n?\s*color-mix\(in srgb, var\(--mq-platinum-hi\) 90%, var\(--mq-amb-glass/);
    // V2 §10: the platinum gradient language is retired — the token must
    // NOT be a linear-gradient anymore.
    const token = css.match(/--mq-platinum-progress:\s*[\s\S]{0,220}?;/)?.[0] ?? "";
    expect(token).not.toContain("linear-gradient");
  });

  it("ProgressBar (PlayerBar seek) fills with platinum, not red", () => {
    const src = readSrc("src/components/mq/ProgressBar.tsx");
    expect(src).toContain("var(--mq-platinum-progress)");
    expect(src).not.toContain('backgroundColor: "var(--mq-accent)"');
  });

  it("WAVE progress + mobile dock strip + mobile hero strip use the token", () => {
    expect(readSrc("src/components/mq/WaveHome.tsx")).toContain("var(--mq-platinum-progress)");
    expect(readSrc("src/components/mq/MobileDock.tsx")).toContain("var(--mq-platinum-progress)");
    expect(readSrc("src/components/mq/MainView.tsx")).toContain("var(--mq-platinum-progress)");
  });

  it("reasons and eyebrows are muted — no red labels", () => {
    const main = readSrc("src/components/mq/MainView.tsx");
    // FeaturedCard reason + MobileNowHero reason
    expect(main).not.toMatch(/mq-t-label mb-1\.5" style=\{\{ color: "var\(--mq-accent\)" \}\}/);
    expect(main).not.toMatch(/isNow \? "var\(--mq-accent\)" : "var\(--mq-text-muted\)"/);
    const queue = readSrc("src/components/mq/QueueView.tsx");
    expect(queue).not.toContain("Сейчас играет");
    expect(queue).toContain("Текущий трек");
    const full = readSrc("src/components/mq/FullTrackView.tsx");
    // queue/history tab counts: no red pills
    expect(full).not.toMatch(/backgroundColor: "color-mix\(in srgb, var\(--mq-accent\) 15%, transparent\)", color: "var\(--mq-accent\)" \}\}\s*>\s*\{(?:upcomingAll|recentAll)\.length\}/);
  });

  it("the «играет» text badge over featured artwork is gone (equalizer only)", () => {
    const main = readSrc("src/components/mq/MainView.tsx");
    expect(main).not.toContain(">играет</span>");
  });

  it("volume slider is a quiet neutral control (no red fill)", () => {
    const css = readSrc("src/app/globals.css");
    const track = css.match(/input\.mq-hslider-input::-webkit-slider-runnable-track \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(track).not.toContain("var(--mq-accent)");
  });
});

describe("FINAL §8 — dead zones: container widths", () => {
  it("wide container is 1200px, narrow 760px", () => {
    const css = readSrc("src/styles/design-tokens.css");
    expect(css).toContain("--mq-container-wide: 1200px");
    expect(css).toContain("--mq-container-narrow: 760px");
  });
});

describe("FINAL §WAVE — the liquid scene got deeper, not brighter", () => {
  it("the depth tide layer exists and modulates only the dark floor", () => {
    const src = readSrc("src/components/mq/WaveAmbientBackground.tsx");
    expect(src).toContain("float tide = fbm(p * 0.34");
    expect(src).toContain("mix(0.82, 1.0, tide)");
    // brightness cap untouched — the scene must stay under the dark cap
    expect(src).toContain("col = min(col, vec3(0.30));");
  });

  it("organic cross-coupling of the warp layers", () => {
    const src = readSrc("src/components/mq/WaveAmbientBackground.tsx");
    expect(src).toContain("r * 2.2 + q * 0.55");
  });
});

describe("FINAL §NAV — de-boxed segmented navigation", () => {
  it("NavBar's inner nav has no border (no box-in-box in glass)", () => {
    const src = readSrc("src/components/mq/NavBar.tsx");
    const nav = src.match(/<nav[\s\S]*?>/)?.[0] ?? "";
    expect(nav).not.toContain("border:");
    expect(nav).not.toContain("--mq-surface-2");
  });

  it("active tab reads through tonal fill, not a second border", () => {
    const src = readSrc("src/components/mq/NavBar.tsx");
    expect(src).not.toMatch(/border: "1px solid " \+ \(isActive/);
    expect(src).toContain("var(--mq-text) 8%, transparent");
  });
});
