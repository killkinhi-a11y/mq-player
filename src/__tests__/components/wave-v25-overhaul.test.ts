/**
 * MQ WAVE — V2.5 VISUAL OVERHAUL contract tests.
 *
 * The V2.5 layer sits ON TOP of the V2 wave stack (WebGL liquid scene,
 * WaveHome station, wave engine — their behavior suites live in
 * wave-ambient.test.tsx / lib/wave). This file pins the V2.5 decisions
 * themselves:
 *
 *  1. TERMINOLOGY — user-facing copy says WAVE, never «Волна» (string
 *     literals scanned across every renamed surface; comments and the
 *     unrelated waveform setting in SettingsView are exempt).
 *  2. STATUS LABELS — the «Волна» badge next to track titles is gone
 *     (PlayerBar renders no radioMode badge span; MainView hero shows
 *     the reason only, no «Сейчас играет» fallback).
 *  3. MATERIALS — Liquid Platinum owns the primary playback controls and
 *     the WAVE identity; Liquid Glass v2 (mq-glass2) owns the floating
 *     surfaces; both defined once in materials-v25.css and imported by
 *     the app shell.
 *  4. DUAL AMBIENT — normal MQ is the calm editorial backdrop (fixed
 *     graphite/navy tones, NOT track-colored: AmbientBackground no longer
 *     touches useDominantColor); WAVE owns personal color via the WebGL
 *     scene (--wave-color-*), and WaveHome's local wash reads the SAME
 *     palette so hero and backdrop are one scene.
 *  5. CHEAP-PATTERN PURGE — the Liquid Glass theme has no
 *     background-position gradient drift and no blanket blur on every
 *     rounded box.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), ...f), "utf8");

describe("V2.5 §4 — user-facing terminology: WAVE, never «Волна»", () => {
  const UI_FILES = [
    "src/components/mq/MainView.tsx",
    "src/components/mq/PlayerBar.tsx",
    "src/components/mq/FullTrackView.tsx",
    "src/components/mq/FullTrackViewMobile.tsx",
    "src/components/mq/fullplayer/SpatialFullPlayer.tsx",
    "src/components/mq/OnboardingView.tsx",
    "src/components/mq/ContextMenu.tsx",
    "src/components/mq/WaveHome.tsx",
    // FINAL CORRECTION §14: user-facing copy ALSO leaves these two — the
    // seed chip under the WAVE header reads waveSeedLabel() output, and
    // the API's label fallback surfaces in the same chip.
    "src/lib/wave/reasons.ts",
    "src/app/api/wave/route.ts",
  ];

  it("no «Волна» string literals remain in the renamed surfaces", () => {
    for (const f of UI_FILES) {
      const src = readSrc(f);
      const stringLiterals = src.match(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g) ?? [];
      const offenders = stringLiterals.filter((s) => /[Вв]олн[аыу]/.test(s));
      expect(offenders, `${f}: old «Волна» strings remain: ${offenders.join(", ")}`).toEqual([]);
    }
  });

  it("WaveHome speaks WAVE in its copy and labels", () => {
    const src = readSrc("src/components/mq/WaveHome.tsx");
    expect(src).toContain('"WAVE"');
    expect(src).toContain("Остановить WAVE");
    expect(src).toContain("Управление WAVE");
  });
});

describe("V2.5 §3 — status labels near tracks are gone", () => {
  it("PlayerBar renders no radioMode badge before the title", () => {
    const src = readSrc("src/components/mq/PlayerBar.tsx");
    expect(src).not.toContain("Единый контекст");
    expect(src).not.toMatch(/\{radioMode &&[\s\S]{0,400}Волна/);
    // the takeover note is present where the badge used to be
    expect(src).toContain("status badges near the track title are GONE");
  });

  it("MainView hero eyebrow shows the reason only — no «Сейчас играет» fallback", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).not.toContain('"Сейчас играет"');
    expect(src).not.toContain('"Волна · играет"');
  });

  it("WaveHome has no «Сейчас играет» eyebrow", () => {
    expect(readSrc("src/components/mq/WaveHome.tsx")).not.toContain("Сейчас играет");
  });
});

describe("V2.5 §6+7 — Liquid Glass v2 + Liquid Platinum material system", () => {
  it("materials-v25.css exists and defines the system", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toContain(".mq-glass2 {");
    expect(css).toContain(".mq-platinum-btn {");
    expect(css).toContain(".mq-platinum-line {");
    expect(css).toContain("--mq-platinum-base:");
    expect(css).toContain("--mq-mo-micro:");
    expect(css).toContain(".mq-t-reason {");
    expect(css).toContain(".mq-t-display-xl {");
  });

  it("AppShell imports the material system", () => {
    expect(readSrc("src/components/mq/AppShell.tsx")).toContain('import "@/styles/materials-v25.css"');
  });

  it("Liquid Platinum owns the primary playback controls", () => {
    expect(readSrc("src/components/mq/PlayerBar.tsx")).toContain("mq-platinum-btn");
    expect(readSrc("src/components/mq/WaveHome.tsx")).toContain("mq-platinum-btn");
    expect(readSrc("src/components/mq/FullTrackView.tsx")).toContain("mq-platinum-btn");
    expect(readSrc("src/components/mq/FullTrackViewMobile.tsx")).toContain("mq-platinum-btn");
    expect(readSrc("src/components/mq/fullplayer/SpatialFullPlayer.tsx")).toContain("mq-platinum-btn");
    expect(readSrc("src/components/mq/MobileDock.tsx")).toContain("mq-platinum-btn");
  });

  it("Liquid Glass v2 owns the floating surfaces", () => {
    expect(readSrc("src/components/mq/PlayerBar.tsx")).toContain("mq-glass2");
    expect(readSrc("src/components/mq/MobileDock.tsx")).toContain("mq-glass2");
    expect(readSrc("src/components/mq/NavBar.tsx")).toContain("mq-glass2");
  });

  it("the WAVE identity wordmark is Liquid Platinum, editorial and subtle", () => {
    const src = readSrc("src/components/mq/WaveHome.tsx");
    expect(src).toContain("mq-platinum-text");
    expect(src).toContain("mq-t-display-xl");
  });
});

describe("V2.5 §2 — dual ambient: calm editorial vs liquid WAVE", () => {
  it("AmbientBackground is editorial — no track colors, mounted on all shells", () => {
    const src = readSrc("src/components/mq/AmbientBackground.tsx");
    expect(src).not.toContain("useDominantColor");
    expect(src).not.toContain("--mq-ambient-1");
    const shell = readSrc("src/components/mq/AppShell.tsx");
    expect(shell).toMatch(/<AmbientBackground \/>/); // unconditional mount
  });

  it("globals define the editorial light pools (THEME-AWARE, fixed strengths)", () => {
    const css = readSrc("src/app/globals.css");
    // FINAL DESIGN COMPLETION §0: the atmosphere is a THEME-AWARE
    // environment — the pool colors come from the active theme's ambient
    // spec (registered @property vars, cross-faded by the theme-switch
    // choreography) while the STRENGTHS stay global so no theme turns
    // neon. Obsidian defaults are pinned in :root + @property blocks.
    expect(css).toContain("var(--mq-amb-pool) 16%"); // primary theme light
    expect(css).toContain("var(--mq-amb-pool-alt) 14%"); // theme colour voice
    expect(css).toContain("var(--mq-amb-deep) 12%"); // second register
    // the registrations that make a theme switch CROSS-FADE (§1)
    expect(css).toMatch(/@property --mq-amb-pool \{ syntax: "<color>"/);
    expect(css).toMatch(/@property --mq-bg \{ syntax: "<color>"/);
    expect(css).toContain("--mq-amb-pool 850ms");
    // per-theme specs exist for every theme (themes.ts)
    const themesSrc = readSrc("src/lib/themes.ts");
    expect(themesSrc).toMatch(/ambient: amb\(/);
    expect(themesSrc).toContain("--mq-amb-pool");
  });

  it("WaveHome's local wash reads the WAVE scene palette (--wave-color-*)", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).toContain("var(--wave-color-1, #122448) 30%");
    expect(css).not.toContain("var(--mq-ambient-1, #e03131)");
  });

  it("the Wave main surface is a refined SOLID surface — visible moderate radius, hairline edge, no glass", () => {
    /* FINAL CORRECTION §1+§12 supersede the V2.5 "no card" decision: the
       hero content sits on ONE solid, opaque, cold-tinted surface with a
       VISIBLE 14–18px radius (float radius), clean clipping, hairline edge
       and quiet shadow — never glass, never transparent, never 3D. */
    const css = readSrc("src/app/globals.css");
    const waveBlock = css.match(/\.mq-wave \{[^}]*\}/)?.[0] ?? "";
    expect(waveBlock).toContain("border-radius: var(--mq-mat-radius-float");
    expect(waveBlock).toContain("color-mix(in srgb, var(--mq-text) 13%, transparent)");
    expect(waveBlock).toMatch(/0 28px 64px -24px rgba\(0, 0, 0, 0\.72\)/);
    // solid background — an opaque color-mix over the mat surface, never a
    // glass token, never backdrop-filter
    expect(waveBlock).toMatch(/background: color-mix\(in srgb,\s*\n?\s*var\(--mq-mat-3-bg\) \d+%,\s*\n?\s*var\(--wave-color-2/);
    expect(waveBlock).not.toContain("mq-g2-");
    expect(waveBlock).not.toContain("backdrop");
    // flat — no lit shoulder, no specular
    expect(waveBlock).not.toContain("radial-gradient");
    expect(waveBlock).not.toContain("inset 0 1px");
  });
  it("the normal MQ ambient is actually visible — the app root never paints over it", () => {
    /* FINAL CORRECTION §6–7: an opaque .mq-app-root background covered the
       z:-1 editorial ambient on EVERY tab (flat-black screens). The root
       must stay transparent; the ambient base carries the opaque floor. */
    const css = readSrc("src/app/globals.css");
    const rootBlock = css.match(/\.mq-app-root \{[^}]*\}/)?.[0] ?? "";
    expect(rootBlock).toContain("background-color: transparent");
    expect(rootBlock).not.toContain("var(--mq-bg)");
    expect(css).not.toContain('.mq-app-root[data-wave="on"]');
    // the ambient base keeps the opaque floor + top light
    const baseBlock = css.match(/\.mq-ambient-base \{[^}]*\}/)?.[0] ?? "";
    expect(baseBlock).toContain("var(--mq-bg)");
  });
});

describe("V2.5 §16 — cheap visual patterns purged", () => {
  it("Liquid Glass theme: no background-position drift, no blanket blur", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).not.toContain("liquid-glass-bg-drift");
    expect(css).not.toContain(".liquid-glass-theme .rounded-2xl");
    expect(css).not.toContain(".liquid-glass-nav {");
  });

  it("prefers-reduced-motion keeps materials usable (no press motion)", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    // FINAL REFINEMENT: the specular sweep (::after + keyframes) was
    // removed — buttons are flat; reduced-motion only freezes press/hover.
    expect(css).not.toContain("mq-platinum-sweep");
    expect(css).toMatch(/\.mq-platinum-btn:active \{ transform: none; filter: brightness\(0\.9\); \}/);
  });
});

describe("V2.5 §5 — card system: surface hierarchy, no nested card chrome", () => {
  it("MainView cards use the level tokens, not full card chrome", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).toContain("var(--mq-mat-2-bg)");
    expect(src).toContain("var(--mq-mat-3-bg)");
    expect(src).toContain("var(--mq-mat-1-bg)");
    // FeaturedCard: cold-light edge (V2: single-color fade), not the 3px accent bar
    expect(src).not.toContain('borderLeft: "3px solid var(--mq-accent)"');
    expect(src).toContain("Cold-light left edge");
    // QuickActionGrid de-nested: ambient surface, no bordered box
    expect(src).not.toContain('grid grid-cols-4 lg:grid-cols-2 gap-2 rounded-2xl p-2"');
  });

  it("Section headers are bare — no icon chip-boxes", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).toContain("V2.5: bare section header");
  });
});
