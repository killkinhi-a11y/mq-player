/**
 * v11 UX/A11Y audit regression tests.
 *
 * Three confirmed gaps were fixed in this pass:
 *  1. LiquidGlassToggle (every Settings/Profile/SpatialAudio/admin toggle)
 *     was a click-only div — no role, no state, not focusable, not
 *     keyboard-operable. Now a real WAI-ARIA switch.
 *  2. FullTrackView (Classic desktop full player) action row buttons
 *     (Like / Dislike / AddToPlaylist / Queue / Lyrics / History) had
 *     title-only naming and data-active-only state. Now aria-label +
 *     aria-pressed (state-aware, same treatment the mobile player has).
 *  3. FullTrackViewMobile artist link had an 81x20 hit box (<44px mobile
 *     target). Now an invisible ::before halo extends it to 44px tall
 *     with zero visual/layout change.
 *
 * Gap 1 is verified by MOUNTING the component (behavioral). Gaps 2–3 are
 * source-contract tests (same pattern as the lyrics width/activeScale
 * contract in this repo): the desktop Classic player is expensive to mount
 * in jsdom and its attributes are static JSX, so pinning the source keeps
 * regressions out without brittle DOM mounts.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LiquidGlassToggle } from "@/components/ui/liquid-glass-toggle";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── mount helper (same shape as fullplayer-v101.test.tsx) ──────────────
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const mountToggle = async (props: React.ComponentProps<typeof LiquidGlassToggle>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(LiquidGlassToggle, props));
  });
};

const unmountToggle = async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  container = null;
  root = null;
};

// ═══ 1 · LiquidGlassToggle — real switch semantics (mounted) ═══

describe("v11 a11y §1 — LiquidGlassToggle is a real switch", () => {
  afterEach(unmountToggle);

  it("1a. exposes role=switch + aria-checked for both states", async () => {
    await mountToggle({ checked: true, onCheckedChange: () => {} });
    const on = container!.querySelector('[role="switch"]') as HTMLElement;
    expect(on).toBeTruthy();
    expect(on.getAttribute("aria-checked")).toBe("true");

    await mountToggle({ checked: false, onCheckedChange: () => {} });
    const off = container!.querySelector('[role="switch"]') as HTMLElement;
    expect(off.getAttribute("aria-checked")).toBe("false");
  });

  it("1b. is focusable (tabIndex=0) and carries its accessible name", async () => {
    await mountToggle({ checked: false, onCheckedChange: () => {}, ariaLabel: "Уменьшить движение" });
    const sw = container!.querySelector('[role="switch"]') as HTMLElement;
    expect(sw.tabIndex).toBe(0);
    expect(sw.getAttribute("aria-label")).toBe("Уменьшить движение");
  });

  it("1c. Space toggles via keyboard (no click needed)", async () => {
    let next: boolean | null = null;
    await mountToggle({ checked: false, onCheckedChange: (v) => { next = v; } });
    const sw = container!.querySelector('[role="switch"]') as HTMLElement;
    await act(async () => {
      sw.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    });
    expect(next).toBe(true);
  });

  it("1d. Enter toggles via keyboard", async () => {
    let next: boolean | null = null;
    await mountToggle({ checked: true, onCheckedChange: (v) => { next = v; } });
    const sw = container!.querySelector('[role="switch"]') as HTMLElement;
    await act(async () => {
      sw.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(next).toBe(false);
  });

  it("1e. disabled: aria-disabled, out of tab order, keys and clicks are inert", async () => {
    let called = false;
    await mountToggle({ checked: false, disabled: true, onCheckedChange: () => { called = true; } });
    const sw = container!.querySelector('[role="switch"]') as HTMLElement;
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect(sw.tabIndex).toBe(-1);
    await act(async () => {
      sw.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
      sw.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(called).toBe(false);
  });
});

// ═══ 2 · Classic desktop action row — aria-label + aria-pressed (contract) ═══

describe("v11 a11y §2 — FullTrackView action buttons expose name + state", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/mq/FullTrackView.tsx"),
    "utf8",
  );

  it("2a. Like button: state-aware aria-label + aria-pressed", () => {
    expect(src).toContain('aria-label={isLiked ? "Убрать из избранного" : "Нравится"}');
    expect(src).toMatch(/aria-pressed=\{isLiked\}/);
  });

  it("2b. Dislike button: aria-label + aria-pressed", () => {
    expect(src).toMatch(/aria-label="Не нравится"/);
    expect(src).toMatch(/aria-pressed=\{isDisliked\}/);
  });

  it("2c. Add-to-playlist / Queue / Lyrics / History toggles: aria-label + aria-pressed", () => {
    expect(src).toMatch(/aria-label="Добавить в плейлист"[\s\S]{0,80}aria-pressed=\{showPlaylistPicker\}/);
    expect(src).toMatch(/aria-label="Очередь"[\s\S]{0,40}aria-pressed=\{panelTab === "queue"\}/);
    expect(src).toMatch(/aria-label="Текст песни"[\s\S]{0,40}aria-pressed=\{panelTab === "lyrics"\}/);
    expect(src).toMatch(/aria-label="История"[\s\S]{0,40}aria-pressed=\{panelTab === "history"\}/);
  });

  it("2d. tooltips (title) kept — no UX regression for sighted shortcut users", () => {
    expect(src).toContain('title="Нравится (L)"');
    expect(src).toContain('title="Очередь (Q)"');
  });
});

// ═══ 3 · Mobile artist link — 44px invisible hit halo (contract) ═══

describe("v11 a11y §3 — FullTrackViewMobile artist chip 44px hit halo", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/mq/FullTrackViewMobile.tsx"),
    "utf8",
  );

  it("3a. artist button carries the before-halo (44px tall hit box, zero layout shift)", () => {
    expect(src).toMatch(/before:absolute before:-top-3 before:-bottom-3/);
    expect(src).toMatch(/handleArtist[\s\S]{0,400}before:-top-3/);
  });

  it("3b. halo is pointer-only: no padding/margin/size change to the visible chip", () => {
    const chip = src.match(/<button onClick=\{handleArtist\}[^>]*>/)?.[0] ?? "";
    expect(chip).not.toMatch(/padding|py-|my-/);
  });
});
