/**
 * DESIGN COMPLETION PASS — contract suite.
 *
 * The user's verdict on the previous passes: "Выглядит дёшево и не всё
 * из требований выполнено" — tests were green but the DESIGN was not
 * finished. This suite pins the completion contracts:
 *
 *  1. §1–2  A REAL card system: four roles (sm/md/feature/hero) in ONE
 *           material language — solid, opaque, moderate radii.
 *  2. §3    No box-in-box: the WAVE artwork bezel is gone (clean clip),
 *           the messenger shell uses the hero radius, not 24px+.
 *  3. §4–5  Liquid Glass is ONE material system with roles
 *           (BASE/NAV/PLAYER/DOCK/MENU/ACTIVE) that holds WITHOUT blur:
 *           tonal separation (veil) carries it; blur is secondary (≤12px).
 *  4. §6–7  V2: the primary control is FLAT LIQUID GLASS (translucent
 *           tonal stack + theme tint + hairline edge); the platinum family
 *           survives as cold-light ACCENT COLORS only. Neutral is default.
 *  5. §9    The NORMAL MQ background is a LIVING atmosphere: three
 *           drifting layers at different ultra-slow speeds — never one
 *           flat/black layer, never a single-gradient page.
 *  6. §20   Red is RARE: primary CTAs across the app are platinum or
 *           neutral — no red-filled action buttons outside destructive
 *           contexts; hearts/live-dot keep their semantic red.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), ...f), "utf8");

const materials = () => readSrc("src/styles/materials-v25.css");
const globals = () => readSrc("src/app/globals.css");

describe("DC §1–2 — one card system, four roles, moderate radii", () => {
  it("defines the four card roles with the hierarchy radius scale", () => {
    const css = materials();
    expect(css).toContain("--mq-card-r-md: 16px");
    expect(css).toContain("--mq-mat-radius-float: 18px");
    expect(css).toContain("--mq-mat-radius-lg: 20px");
    for (const cls of [".mq-card-sm", ".mq-card-md", ".mq-card-feature", ".mq-card-hero"]) {
      expect(css, cls).toContain(`${cls} {`);
    }
  });

  it("card roles are SOLID: opaque fills, hairline edges — no glass tokens", () => {
    const css = materials();
    const block = css.slice(css.indexOf(".mq-card-sm"), css.indexOf(".mq-card-hero") + 200);
    expect(block).not.toContain("mq-g2-");
    expect(block).not.toContain("backdrop");
    expect(block).not.toContain("transparent 100%");
  });

  it("the messenger shell uses the hero radius, not rounded-3xl", () => {
    const src = readSrc("src/components/mq/MessengerView.tsx");
    expect(src).not.toMatch(/rounded-3xl overflow-hidden h-full/);
    expect(src).toContain("rounded-[var(--mq-mat-radius-lg)] overflow-hidden h-full");
  });
});

describe("DC §3 — box-in-box removed", () => {
  it("the WAVE artwork clips edge-to-edge: no bezel inset, no second radius", () => {
    const css = globals();
    const layer = css.match(/\.mq-wave-art-layer \{[^}]*\}/)?.[0] ?? "";
    expect(layer).toContain("inset: 0");
    expect(layer).toContain("border-radius: inherit");
  });

  it("no inline backdrop blur remains on the WAVE artwork (it was the bezel's point)", () => {
    const src = readSrc("src/components/mq/WaveHome.tsx");
    expect(src).not.toMatch(/backdropFilter[^\n]*mq-wave-art|mq-wave-art[\s\S]{0,220}backdropFilter/);
  });
});

describe("DC §4–5 — Liquid Glass v3: one material, six roles, tonal-first", () => {
  it("defines every glass role", () => {
    const css = materials();
    for (const cls of [".mq-glass2 {", ".mq-glass2-nav", ".mq-glass2-player", ".mq-glass2-dock", ".mq-glass2-menu", ".mq-glass2-active"]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("the material holds WITHOUT blur: the veil carries real tonal separation", () => {
    const css = materials();
    expect(css).toMatch(/--mq-g2-veil: rgba\(\d+, \d+, \d+, 0\.(2[4-9]|3[0-9])\)/);
  });

  it("blur is secondary: the glass token is at most 12px", () => {
    const css = materials();
    const blur = css.match(/--mq-g2-blur: (\d+)px/);
    expect(blur).toBeTruthy();
    expect(Number(blur![1])).toBeLessThanOrEqual(12);
  });

  it("the floating layer actually uses its roles", () => {
    expect(readSrc("src/components/mq/NavBar.tsx")).toContain("mq-glass2-nav");
    expect(readSrc("src/components/mq/PlayerBar.tsx")).toContain("mq-glass2-player");
    expect(readSrc("src/components/mq/MobileDock.tsx")).toContain("mq-glass2-dock");
  });
});

describe("DC §6–7 — primary control is flat Liquid Glass; neutral is the default action", () => {
  it("the primary button is FLAT LIQUID GLASS: translucent stack, theme tint, NO metallic fill (V2 §10)", () => {
    const css = materials();
    const btn = css.match(/\.mq-platinum-btn \{[\s\S]*?\n\}/)?.[0] ?? "";
    // V2 §10.4: translucent tonal stack (sheen -> body tone -> deep veil ->
    // theme glass tint). The ONLY gradient allowed is the subtle glass
    // sheen line — never a metallic two-tone gloss.
    expect(btn).toContain("var(--mq-g2-tint)");
    expect(btn).toContain("rgba(6, 9, 16, 0.52)");
    // metallic remnants are gone: no opaque platinum-lift fill, no chrome
    expect(btn).not.toContain("background: var(--mq-platinum-lift)");
    // RENDER CONTRACT (V2 glass fix): the tint/body-tone ride as FLAT
    // linear-gradient(c, c) overlays (image layers are runtime-valid;
    // multi-layer background shorthand with color layers is not).
    expect(btn).toContain("background-color: rgba(6, 9, 16, 0.52)");
    expect(btn).toContain("linear-gradient(var(--mq-g2-tint), var(--mq-g2-tint))");
    const sweeps = (btn.match(/linear-gradient\(\s*\d+deg/g) || []).length;
    expect(sweeps).toBeLessThanOrEqual(1); // only the ONE subtle sheen
  });

  it("a neutral action class exists for everyday buttons", () => {
    const css = materials();
    expect(css).toContain(".mq-btn-neutral {");
    expect(css).toContain(".mq-btn-neutral:active");
  });

  it("RENDER CONTRACT: no multi-layer background shorthand with bare color layers (runtime-invalid)", () => {
    // After var substitution, plain COLOR layers (veil/tint) that are not
    // the final layer invalidate the WHOLE background declaration in every
    // browser — the glass tonal stack silently disappears. The safe shape:
    // background-color (veil) + flat linear-gradient(c, c) overlays.
    for (const file of ["src/styles/materials-v25.css", "src/app/globals.css"]) {
      const css = readSrc(file);
      // a multi-layer background shorthand ending in a bare COLOR layer
      // (var() or rgba()) after a comma — runtime-invalid after substitution
      const layerTail = /,\s*(?:var\(--mq-[a-z0-9-]+\)|rgba\([^)]*\))\s*;/;
      for (const m of css.matchAll(/background:[^;{}]*;/g)) {
        expect(m[0], `${file}: multi-layer background with bare color layers -> ${m[0].slice(0, 60)}`).not.toMatch(layerTail);
      }
    }});
});

describe("DC §9 — the normal MQ background is a living atmosphere", () => {
  it("three drifting layers exist, each with its own ultra-slow speed", () => {
    const css = globals();
    for (const cls of [".mq-ambient-pools", ".mq-ambient-indigo", ".mq-ambient-haze"]) {
      expect(css, cls).toContain(`${cls} {`);
    }
    expect(css).toMatch(/mq-ambient-drift-a 240s/);
    expect(css).toMatch(/mq-ambient-drift-b 400s/);
    expect(css).toMatch(/mq-ambient-drift-c 560s/);
  });

  it("the layers never blur (compositor-only cost)", () => {
    const css = globals();
    const ambient = css.slice(css.indexOf(".mq-ambient-bg"), css.indexOf("WAVE — LIQUID AMBIENT"));
    expect(ambient).not.toContain("filter: blur");
    expect(ambient).not.toContain("backdrop");
  });

  it("AmbientBackground renders all three layers", () => {
    const src = readSrc("src/components/mq/AmbientBackground.tsx");
    expect(src).toContain("mq-ambient-pools");
    expect(src).toContain("mq-ambient-indigo");
    expect(src).toContain("mq-ambient-haze");
  });
});

describe("DC §20 — red is RARE (primary actions are platinum/neutral)", () => {
  const noRedFill = (file: string, label: string) => {
    const src = readSrc(file);
    expect(src.replace(/\n/g, " "), `${label}: red-filled action button`).not.toMatch(
      /backgroundColor: "var\(--mq-accent\)", color: "(#fff|var\(--mq-text\))"/
    );
  };

  it("artist page: Слушать/Поиск are not red fills", () => {
    noRedFill("src/components/mq/ArtistDetailView.tsx", "artist");
    const src = readSrc("src/components/mq/ArtistDetailView.tsx");
    expect(src).toMatch(/mq-platinum-btn[^"]*Слушать|Слушать[\s\S]{0,120}mq-platinum-btn|mq-platinum-btn[^"]*"[^"]*"\s*>\s*<Play/m);
  });

  it("messenger: Найти друзей / Повторить / bubbles are not red", () => {
    noRedFill("src/components/mq/MessengerView.tsx", "messenger");
    const src = readSrc("src/components/mq/MessengerView.tsx");
    expect(src).toMatch(/mq-btn-neutral[^"]*"[^>]*>\s*(<UserPlus[^>]*\/>\s*)?Найти друзей|Найти друзей/);
    expect(src).not.toMatch(/backgroundColor: isMine \? "var\(--mq-accent\)"/);
  });

  it("search: chips, Играть все, upload fills are not red", () => {
    noRedFill("src/components/mq/SearchView.tsx", "search");
    const src = readSrc("src/components/mq/SearchView.tsx");
    expect(src).toMatch(/mq-platinum-btn flex items-center gap-1\.5 px-3\.5/); // Играть все
    expect(src).not.toMatch(/!selectedGenre \? "var\(--mq-accent\)"/);
  });

  it("library/settings/queue/eq: actives and fills are not red", () => {
    noRedFill("src/components/mq/LibraryView.tsx", "library");
    noRedFill("src/components/mq/SettingsView.tsx", "settings");
    noRedFill("src/components/mq/QueueView.tsx", "queue");
    noRedFill("src/components/mq/EqualizerView.tsx", "eq");
    // EQ sliders speak platinum
    expect(readSrc("src/components/mq/EqualizerView.tsx")).toContain("var(--mq-platinum-progress)");
  });

  it("playlist/fullplayer: primary playback is platinum", () => {
    noRedFill("src/components/mq/PlaylistView.tsx", "playlists");
    noRedFill("src/components/mq/FullTrackView.tsx", "fullplayer");
    expect(readSrc("src/components/mq/PlaylistView.tsx")).toMatch(/mq-platinum-btn flex items-center justify-center gap-2 flex-1/);
    expect(readSrc("src/components/mq/FullTrackView.tsx")).toMatch(/background: "var\(--mq-platinum-progress\)"/);
  });

  it("hearts keep their semantic red (the rare accent that stays)", () => {
    const artist = readSrc("src/components/mq/ArtistDetailView.tsx");
    expect(artist).toMatch(/isFav \? "var\(--mq-accent\)"/);
  });
});

describe("DC §misc — completion details", () => {
  it("the GLOBAL keyboard focus ring is neutral light, not the red accent", () => {
    // Root cause of the "red search border looks like a CSS error" flagged
    // in EVERY visual audit round: *:focus-visible painted a 2px RED
    // outline around the search input whenever it was focused (click or
    // keyboard). Focus is chrome — it speaks neutral light now.
    const css = globals();
    const ring = css.match(/\*:focus-visible \{[^}]*\}/)?.[0] ?? "";
    expect(ring).toContain("var(--mq-text, #f0f0f0) 55%");
    expect(ring).not.toContain("var(--mq-accent");
    // and no component-level accent focus outlines remain either
    expect(css).not.toMatch(/outline: 2px solid var\(--mq-accent\)/);
  });

  it("layout.tsx pre-paint focus rules are neutral too (the production blocker)", () => {
    // REGRESSION GUARD for the bug that survived cda67082: globals.css was
    // fixed but the INLINE <style> in layout.tsx <head> kept BOTH a red
    // *:focus-visible and an input:focus-visible rule. The input-specific
    // rule (0,1,1) outspecifies the global *:focus-visible (0,1,0) from
    // globals.css, so EVERY search/settings input still painted a RED ring
    // in production while the globals-only test above stayed green.
    // layout.tsx must never reintroduce accent into a focus declaration.
    const src = readSrc("src/app/layout.tsx");
    // strip comments so explanations that mention the OLD red bug don't trip
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // no focus rule block declares the accent
    expect(noComments).not.toMatch(/:focus[^{}]*\{[^}]*--mq-accent/);
    // the neutral token is actually referenced
    expect(noComments).toContain("--mq-focus-ring-color");
  });

  it("slider thumbs/tracks never focus or grab in accent red", () => {
    // Volume (hslider/vslider) + settings (range-slider.tsx) sliders: the
    // reveal/hover/focus rules were var(--mq-accent) — a red cap on grab
    // and a red track halo on keyboard focus. Contract: NO css rule block
    // whose selector mentions a slider pseudo-element AND :focus-visible
    // may declare the accent (grouped selectors included).
    const css = globals();
    const chunks = css.split("}").map(c => c + "}");
    for (const chunk of chunks) {
      const brace = chunk.indexOf("{");
      if (brace === -1) continue;
      const sel = chunk.slice(0, brace);
      if (/slider/.test(sel) && /:focus-visible/.test(sel)) {
        expect(chunk, `focus rule must not be red: ${sel.trim()}`).not.toContain("--mq-accent");
      }
    }
    const rs = readSrc("src/components/ui/range-slider.tsx");
    expect(rs).not.toMatch(/focus-visible[^\n]*\$\{accent\}/);
    expect(rs).not.toContain('const accent = "var(--mq-accent)"');
  });

  it("broken queue covers hide instead of rendering the browser glyph", () => {
    const src = readSrc("src/components/mq/QueueView.tsx");
    expect(src).toContain('e.currentTarget.style.visibility = "hidden"');
  });

  it("demo covers are generated artwork, not the red brand logo", () => {
    const src = readSrc("src/lib/demoTracks.ts");
    expect(src).not.toContain("/icon-512.png");
    expect(src).toContain("demoCover");
  });

  it("the WAVE progress fill is platinum, not a red glow", () => {
    const css = globals();
    const fill = css.match(/\.mq-wave-progress-fill \{[^}]*\}/)?.[0] ?? "";
    expect(fill).toContain("var(--mq-platinum-progress)");
    expect(fill).not.toContain("var(--mq-accent)");
  });

  it("a shelf masthead type exists for editorial section headers", () => {
    const css = materials();
    expect(css).toContain(".mq-t-shelf {");
    expect(readSrc("src/components/mq/SearchView.tsx")).toContain("mq-t-shelf");
  });
});
