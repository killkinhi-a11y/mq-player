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

  it("globals define the editorial graphite/navy light pools", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).toContain("#9aa3b2 5%"); // graphite pool
    expect(css).toContain("#3d4f78 6%"); // navy whisper
  });

  it("WaveHome's local wash reads the WAVE scene palette (--wave-color-*)", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).toContain("var(--wave-color-1, #122448) 30%");
    expect(css).not.toContain("var(--mq-ambient-1, #e03131)");
  });

  it("the Wave container is NOT a card — content floats on the scene", () => {
    const css = readSrc("src/app/globals.css");
    const waveBlock = css.match(/\.mq-wave \{[^}]*\}/)?.[0] ?? "";
    expect(waveBlock).not.toContain("border:");
    expect(waveBlock).not.toContain("linear-gradient(180deg");
  });
});

describe("V2.5 §16 — cheap visual patterns purged", () => {
  it("Liquid Glass theme: no background-position drift, no blanket blur", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).not.toContain("liquid-glass-bg-drift");
    expect(css).not.toContain(".liquid-glass-theme .rounded-2xl");
    expect(css).not.toContain(".liquid-glass-nav {");
  });

  it("prefers-reduced-motion keeps materials usable (no sweep/press motion)", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toContain(".mq-platinum-btn::after");
  });
});

describe("V2.5 §5 — card system: surface hierarchy, no nested card chrome", () => {
  it("MainView cards use the level tokens, not full card chrome", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).toContain("var(--mq-mat-2-bg)");
    expect(src).toContain("var(--mq-mat-3-bg)");
    expect(src).toContain("var(--mq-mat-1-bg)");
    // FeaturedCard: platinum light edge, not the 3px accent bar
    expect(src).not.toContain('borderLeft: "3px solid var(--mq-accent)"');
    expect(src).toContain("Platinum left light edge");
    // QuickActionGrid de-nested: ambient surface, no bordered box
    expect(src).not.toContain('grid grid-cols-4 lg:grid-cols-2 gap-2 rounded-2xl p-2"');
  });

  it("Section headers are bare — no icon chip-boxes", () => {
    const src = readSrc("src/components/mq/MainView.tsx");
    expect(src).toContain("V2.5: bare section header");
  });
});
