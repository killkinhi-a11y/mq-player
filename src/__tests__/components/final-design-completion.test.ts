/**
 * FINAL DESIGN COMPLETION — contract suite.
 *
 * Pins the two headline deliverables of this pass:
 *
 *  §0–§2  THEME-AWARE BACKGROUND
 *    - every theme ships a COMPLETE ambient environment spec
 *      (pools, deep masses, haze, inks, glass tint, platinum tint,
 *       vignette, grain, WAVE base + anchor hue) — a theme is an
 *      ATMOSPHERE, not an accent swap;
 *    - the ambient layers in globals.css consume the registered
 *      --mq-amb-* vars (fixed strengths → no theme can turn neon);
 *    - theme switch = ONE cross-fading material system: registered
 *      @property colors + 850ms choreography, no flash/snap;
 *    - Liquid Glass tint + Liquid Platinum reflections follow the theme;
 *    - WAVE: theme-anchored fallback palette + theme-tinted dark base,
 *      artwork stays the primary voice.
 *
 *  §3–§11  SEARCH — FULL REDESIGN
 *    - editorial discovery composition: TOP RESULT hero + clean track
 *      rows + artist rows + compact album tiles + playlist matches —
 *      mixed density, NOT card-card-card;
 *    - real-data discovery state (quick picks, recently played,
 *      recent queries, popular queries) — never an empty black screen;
 *    - compact solid field (no giant pill, no glass capsule, neutral
 *      focus), calm 150–250ms result motion (3D stagger is gone);
 *    - top result card is a SOLID content surface (§18: content cards
 *      are never glass).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { themes, type ThemeAmbient } from "@/lib/themes";
import {
  DEFAULT_WAVE_ANCHOR_HUE,
  DEFAULT_WAVE_PALETTE,
  defaultPaletteForHue,
  deriveWavePalette,
} from "@/components/mq/wave-ambient-palette";

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), ...f), "utf8");

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA_RE = /^rgba?\([^)]+\)$/i;

/* ═════════════════════ §0–§2 THEME-AWARE BACKGROUND ═════════════════════ */

describe("FDC §0 — every theme is a full ambient environment", () => {
  const ids = Object.keys(themes);

  it("the theme registry exists and is non-trivial", () => {
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  it.each(ids)("theme %s ships a COMPLETE ambient spec", (id) => {
    const a: ThemeAmbient | undefined = (themes as Record<string, { ambient?: ThemeAmbient }>)[id]?.ambient;
    expect(a, `${id}.ambient`).toBeDefined();
    for (const key of ["pool", "poolAlt", "deep", "deepAlt", "haze", "inkTop", "inkFloor", "floor", "glass", "platinum"] as const) {
      expect(HEX_RE.test(a![key]), `${id}.ambient.${key} must be a hex color`).toBe(true);
    }
    expect(RGBA_RE.test(a!.vignette), `${id}.ambient.vignette must carry alpha`).toBe(true);
    expect(a!.grain).toBeGreaterThan(0);
    expect(a!.grain).toBeLessThanOrEqual(0.05);
    expect(a!.waveHue).toBeGreaterThanOrEqual(0);
    expect(a!.waveHue).toBeLessThan(360);
    expect(HEX_RE.test(a!.waveBase), `${id}.ambient.waveBase must be hex`).toBe(true);
  });

  it("themes have DISTINCT atmospheres (not one shared room)", () => {
    const sig = (id: string) => {
      const a = themes[id].ambient;
      return [a.pool, a.poolAlt, a.deep, a.haze].join("|");
    };
    const uniq = new Set(ids.map(sig));
    // many themes, many distinct rooms (families may share hue direction
    // but the full pool/voice/deep/haze signature must differ)
    expect(uniq.size).toBeGreaterThan(ids.length * 0.6);
  });

  it("applyThemeToDOM publishes the whole environment to CSS vars", () => {
    const src = readSrc("src/lib/themes.ts");
    for (const v of [
      "--mq-amb-pool", "--mq-amb-pool-alt", "--mq-amb-deep", "--mq-amb-deep-alt",
      "--mq-amb-haze", "--mq-amb-ink-top", "--mq-amb-ink-floor", "--mq-amb-floor",
      "--mq-amb-glass", "--mq-amb-platinum", "--mq-amb-vignette", "--mq-amb-grain",
      "--mq-wave-base", "--mq-wave-anchor-h",
    ]) {
      expect(src, `must set ${v}`).toContain(`"${v}"`);
    }
  });

  it("ambient layers consume the theme vars with FIXED strengths (calm)", () => {
    const css = readSrc("src/app/globals.css");
    const pools = css.match(/\.mq-ambient-pools \{[^}]*\}/)?.[0] ?? "";
    expect(pools).toContain("var(--mq-amb-pool) 16%");
    expect(pools).toContain("var(--mq-amb-pool-alt) 14%");
    expect(pools).toContain("var(--mq-amb-floor) 11%");
    const deep = css.match(/\.mq-ambient-indigo \{[^}]*\}/)?.[0] ?? "";
    expect(deep).toContain("var(--mq-amb-deep) 12%");
    expect(deep).toContain("var(--mq-amb-deep-alt) 9%");
    const haze = css.match(/\.mq-ambient-haze \{[^}]*\}/)?.[0] ?? "";
    expect(haze).toContain("var(--mq-amb-haze) 6.5%");
    const base = css.match(/\.mq-ambient-base \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("var(--mq-amb-ink-top)");
    expect(base).toContain("var(--mq-amb-ink-floor)");
    // vignette + grain are theme data, not hardcoded
    const vig = css.match(/\.mq-ambient-vignette \{[^}]*\}/)?.[0] ?? "";
    expect(vig).toContain("var(--mq-amb-vignette");
    const grain = css.match(/\.mq-ambient-grain \{[^}]*\}/)?.[0] ?? "";
    expect(grain).toContain("var(--mq-amb-grain");
    // the light theme room has its own physics (grain multiply, softer haze)
    expect(css).toContain(".daylight-theme .mq-ambient-grain");
  });
});

describe("FDC §1 — theme transition is ONE cross-fading material system", () => {
  it("ambient + surface vars are registered as interpolating @property colors", () => {
    const css = readSrc("src/app/globals.css");
    for (const v of [
      "--mq-amb-pool", "--mq-amb-haze", "--mq-amb-glass", "--mq-amb-platinum",
      "--mq-amb-vignette", "--mq-amb-grain", "--mq-wave-base",
      "--mq-bg", "--mq-card", "--mq-accent", "--mq-text",
    ]) {
      expect(css, `@property ${v}`).toMatch(new RegExp(`@property ${v} \\{ syntax: "<(color|number)>"`));
    }
  });

  it("html.mq-theme-switch cross-fades the environment at 850ms (500–1000ms spec)", () => {
    const css = readSrc("src/app/globals.css");
    const block = css.match(/html\.mq-theme-switch \{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("--mq-amb-pool 850ms");
    expect(block).toContain("--mq-bg 850ms");
    expect(block).toContain("--mq-accent 850ms");
    // surfaces ride along (cards/glass/text move as one system)
    expect(block).toContain("--mq-card 850ms");
    expect(block).toContain("--mq-text 850ms");
  });

  it("the choreography window covers the full cross-fade (no snap at the end)", () => {
    const src = readSrc("src/lib/themes.ts");
    expect(src).toMatch(/remove\("mq-theme-switch"\), 1000\)/);
  });
});

describe("FDC §0 — Liquid Glass + Liquid Platinum speak the theme", () => {
  it("glass tint derives from the theme ambient glass color", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toMatch(/--mq-g2-tint: color-mix\(in srgb, var\(--mq-amb-glass, #e2e8f0\) 8\.5%, transparent\)/);
  });

  it("platinum reflections carry a whisper of the theme (28% mix)", () => {
    const css = readSrc("src/styles/materials-v25.css");
    expect(css).toContain("#8fa3c8 72%, var(--mq-amb-platinum");
    expect(css).toContain("#a48fc4 70%, var(--mq-amb-platinum");
  });

  it("WAVE publishes a THEME-tinted glass tint (no fixed cold white)", () => {
    const src = readSrc("src/components/mq/WaveAmbientBackground.tsx");
    expect(src).toContain("ambient?.glass");
    expect(src).not.toContain("rgba(226, 232, 240, ${tintA");
  });
});

describe("FDC §0 — WAVE respects the theme (base + anchor), artwork leads", () => {
  it("deriveWavePalette anchors achromatic covers on the THEME hue", () => {
    const dc = { primary: "#808080", secondary: "#1a1a2e", muted: "#2d2d3d", vibrant: "#ffffff" } as const;
    const coldDefault = deriveWavePalette(dc as never);
    const emerald = deriveWavePalette(dc as never, 160);
    // same achromatic cover, different theme anchors → different rooms
    expect(emerald.c2).not.toEqual(coldDefault.c2);
    // green room: g channel leads
    expect(emerald.c2[1]).toBeGreaterThan(emerald.c2[0]);
    // both stay DARK (the wave contract holds for every theme)
    expect(Math.max(...emerald.c1)).toBeLessThanOrEqual(40);
    expect(Math.max(...emerald.c2)).toBeLessThanOrEqual(78);
  });

  it("defaultPaletteForHue(226) is EXACTLY the CSS fallback (no snap)", () => {
    expect(defaultPaletteForHue(DEFAULT_WAVE_ANCHOR_HUE)).toEqual(DEFAULT_WAVE_PALETTE);
  });

  it("every theme's anchor produces a dark, calm wave base room", () => {
    for (const id of Object.keys(themes)) {
      const hue = themes[id].ambient.waveHue;
      const p = defaultPaletteForHue(hue);
      expect(Math.max(...p.c1), `${id} c1`).toBeLessThanOrEqual(40);
      expect(Math.max(...p.c2), `${id} c2`).toBeLessThanOrEqual(78);
      // c3 stays a dark accent: derived rooms cap at 56; the canonical
      // 226 default is the shipped hand-authored palette (max 84, l≈0.13).
      expect(Math.max(...p.c3), `${id} c3`).toBeLessThanOrEqual(84);
    }
  });

  it("WaveAmbientBackground reads the active theme (store-driven hue)", () => {
    const src = readSrc("src/components/mq/WaveAmbientBackground.tsx");
    expect(src).toContain("s.currentTheme");
    expect(src).toContain("deriveWavePalette(dc, themeHue)");
  });

  it("WaveAmbientBackground re-publishes the glass tint on theme switch (deps fix)", () => {
    const src = readSrc("src/components/mq/WaveAmbientBackground.tsx");
    expect(src).toContain("[palette, currentTheme]");
    expect(src).toContain("themes[currentTheme]?.ambient?.glass");
  });

  it("the wave dark floor is the theme-tinted --mq-wave-base", () => {
    const css = readSrc("src/app/globals.css");
    expect(css).toMatch(/\.mq-wave-liquid \{[\s\S]*?background: var\(--mq-wave-base, #05070d\)/);
  });
});

/* ═════════════════════ §3–§11 SEARCH REDESIGN ═════════════════════ */

describe("FDC §3–§6 — search results are an editorial mixed-density layout", () => {
  const src = readSrc("src/components/mq/SearchView.tsx");

  it("results group into artists / albums / top result / playlists", () => {
    expect(src).toContain("const artistGroups");
    expect(src).toContain("const albumGroups");
    expect(src).toContain("const topResult");
    expect(src).toContain("const playlistMatches");
  });

  it("renders the sections with their own visual density", () => {
    expect(src).toContain("Топ-результат");
    expect(src).toMatch(/>Треки</);
    expect(src).toContain(">Артисты</h3>");
    expect(src).toContain(">Альбомы</h3>");
    expect(src).toContain(">Ваши плейлисты</h3>");
    expect(src).toContain("Все треки ·");
  });

  it("the hero top result is the artist that owns the results (or top track)", () => {
    expect(src).toContain('best.count >= 2');
    expect(src).toContain('kind: "artist"');
    expect(src).toContain('kind: "track"');
  });

  it("the 3D stagger is GONE — calm 150–250ms rise-in (§19)", () => {
    expect(src).not.toContain("rotateX");
    expect(src).not.toContain("z: -30");
    expect(src).toMatch(/duration: 0\.2, delay: Math\.min\(i \* 0\.01[25]/);
  });
});

describe("FDC §5 — the search field is compact, solid, quiet", () => {
  const src = readSrc("src/components/mq/SearchView.tsx");

  it("compact height + material radius (no giant pill)", () => {
    expect(src).toContain("h-[48px] lg:h-[46px]");
    expect(src).toContain('borderRadius: "var(--mq-mat-radius, 14px)"');
  });

  it("no glass capsule on the FIELD itself; the sticky strip is the floating glass layer (V2 §20)", () => {
    // The INPUT stays solid + quiet: no glass class, no blur on the field.
    const input = src.match(/<Input[\s\S]{0,2200}?<\/div>/)?.[0] ?? src.slice(0, 0);
    expect(input).not.toContain("mq-glass2");
    // The sticky strip (a FLOATING surface) carries the theme-aware
    // translucent glass + inline blur — ambient shows through in every
    // search state. Exactly ONE blur surface allowed in the view.
    const blurCount = (src.match(/backdropFilter: "blur\(14px\)"/g) || []).length;
    expect(blurCount).toBe(1);
    expect(src).toContain('backgroundColor: "color-mix(in srgb, var(--mq-bg) 86%, transparent)"');
  });
});

describe("FDC §9 + V2 §1 — Search Home (before query) is a real discovery experience", () => {
  const src = readSrc("src/components/mq/SearchView.tsx");

  it("real-data sections: featured anchor, recently played, popular queries", () => {
    expect(src).toContain("Быстрый доступ");
    expect(src).toContain("Слушали недавно");
    expect(src).toContain("Популярные запросы");
    expect(src).toContain("const discoveryTracks");
  });

  it("V2 §1.2 — editorial anchor: featured discovery card + compact rows", () => {
    expect(src).toContain("DiscoveryFeaturedCard");
    expect(src).toContain('data-mq-search-featured');
    expect(src).toContain("Продолжить слушать");
    // mixed density: featured (5 cols) + rows (7 cols) mirrors the
    // AFTER-query Top Result composition — one design language
    expect(src).toMatch(/lg:col-span-5[\s\S]{0,600}lg:col-span-7/);
  });

  it("V2 §1.4 — recent searches are compact ROWS with delete + expand, not pills", () => {
    expect(src).toContain("recent-search-row");
    expect(src).toContain("Показать ещё");
    expect(src).toContain("RECENT_ROWS_VISIBLE");
    // no horizontal chip strip for recent queries
    expect(src).not.toContain("Недавние запросы — горизонт");
  });

  it("V2 §1.3 — graceful cold start: real catalog tracks + genre shortcuts", () => {
    expect(src).toContain("COLD_START_GENRES");
    expect(src).toContain("isColdStart");
    expect(src).toContain("Обзор жанров");
    expect(src).toContain("Из популярного");
  });

  it("V2 §1.5 — light quick discovery: artist strip + compact liked tiles", () => {
    expect(src).toContain("Артисты рядом");
    expect(src).toContain("в избранном");
  });

  it("discovery rows come from the real listening history", () => {
    expect(src).toMatch(/storeHistory[\s\S]{0,120}slice\(0, 20\)[\s\S]{0,80}\.track/);
  });
});

describe("FDC §18 — the top result card is a SOLID content surface", () => {
  it("solid card recipe in globals (opaque fill, hairline edge, no glass)", () => {
    const css = readSrc("src/app/globals.css");
    const block = css.match(/\.mq-search-topresult \{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("var(--mq-card-feature-bg)");
    expect(block).toContain("var(--mq-card-r-md, 16px)");
    expect(block).not.toContain("backdrop-filter");
    expect(block).not.toContain("rgba(255, 255, 255, 0.");
  });

  it("TopResultCard uses the solid class + flat platinum CTA", () => {
    const src = readSrc("src/components/mq/SearchView.tsx");
    expect(src).toContain('className="mq-search-topresult group"');
    expect(src).toMatch(/mq-platinum-btn[\s\S]{0,200}Слушать/);
  });
});
