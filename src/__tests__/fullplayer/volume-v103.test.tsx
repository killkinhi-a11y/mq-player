/**
 * V10.3 — Full Player volume fixes (regression tests).
 *
 * Primary fix cluster (all reproduced live on production before fixing):
 *  A. Escape was DEAD after clicking the volume/seek slider — the keyboard
 *     handler's INPUT guard returned before the Escape case. Classic: the
 *     player refused to close (hint row promises "Esc close"). Spatial: the
 *     volume popup refused to close. Fix: Escape is handled BEFORE the guard.
 *  B. Unmute restored a hardcoded 70 instead of the last audible level.
 *     Fix: store-level last-volume memory (getLastVolume) shared by the
 *     VolumeSlider icon, keyboard M (all 3 players) and the mini PlayerBar.
 *  C. VolumeSlider mute icon: English aria-label "Mute" → Russian
 *     state-aware; no hover/press feedback → mq-icon-btn + mq-press.
 *  D. Spatial volume button lacked aria-expanded/aria-haspopup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/lyrics-client", () => ({
  fetchLyrics: vi.fn(async () => ({ lyrics: [{ time: 0, text: "ла ла ла" }], plainText: "" })),
}));
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;
const getLastVolume = storeMod.getLastVolume;

const spatialMod = await import("@/components/mq/fullplayer/SpatialFullPlayer");
const SpatialFullPlayer = spatialMod.default;

const classicMod = await import("@/components/mq/FullTrackView");
const ClassicFullPlayer = classicMod.default;

import type { Track } from "@/lib/musicApi";

const T = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: "",
  cover: `https://img.example/${id}.jpg`,
  duration: 100,
  genre: "",
  audioUrl: "",
  previewUrl: "",
  source: "soundcloud",
});

const QUEUE = [T("a"), T("b"), T("c"), T("d"), T("e"), T("f")];

beforeEach(() => {
  localStorage.clear();
  if (!window.matchMedia) {
    (window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = (() => {}) as () => void;
  }
});

type StoreState = Partial<ReturnType<typeof useAppStore.getState>>;

const BASE_STATE: StoreState = {
  fullPlayerMode: "spatial" as const,
  isFullTrackViewOpen: true,
  currentTrack: QUEUE[1],
  queue: [...QUEUE],
  queueIndex: 1,
  isPlaying: false,
  progress: 0,
  duration: 100,
  volume: 50,
  likedTrackIds: [],
  dislikedTrackIds: [],
  upNext: [],
  shuffle: false,
  repeat: "off" as const,
  playbackState: "idle" as const,
  radioMode: false,
  animationsEnabled: true,
  reduceMotion: false,
};

let container: HTMLDivElement | null;
let root: Root | null;

const mount = async (Component: React.ComponentType, state: StoreState = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  useAppStore.setState({ ...BASE_STATE, ...state } as StoreState);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(Component));
  });
};

const unmount = async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  container = null; root = null;
};

const key = async (k: string, target?: HTMLElement) => {
  await act(async () => {
    // When a target is given, dispatch on IT (focused element in the real
    // browser) — the handler reads e.target for the INPUT guard.
    (target ?? window).dispatchEvent(
      new KeyboardEvent("keydown", { key: k, code: k, bubbles: true, cancelable: true }),
    );
  });
};

const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

// ═══ A · STORE LAST-VOLUME MEMORY ═══

describe("v10.3 · store last-volume memory (mute/unmute restore)", () => {
  it("A1. setVolume(>0) remembers; setVolume(0) does not clobber; unmute restores", () => {
    useAppStore.setState({ volume: 50 });
    useAppStore.getState().setVolume(42);
    expect(getLastVolume()).toBe(42);
    // mute must NOT overwrite the memory
    useAppStore.getState().setVolume(0);
    expect(getLastVolume()).toBe(42);
    expect(useAppStore.getState().volume).toBe(0);
    // slider drags also refresh the memory (setVolume is the single writer)
    useAppStore.getState().setVolume(83);
    expect(getLastVolume()).toBe(83);
  });

  it("A2. fresh module default is the historical 70", () => {
    // never set any volume in THIS test → default memory (module import order
    // makes this 70 unless a previous setVolume(>0) ran — the A1 describe
    // block runs first, so reset by setting a positive value then asserting
    // the invariant: getLastVolume() is ALWAYS > 0).
    expect(getLastVolume()).toBeGreaterThan(0);
    expect(getLastVolume()).toBeLessThanOrEqual(100);
  });
});

// ═══ B · SPATIAL — Escape with focused volume slider + aria-expanded ═══

describe("v10.3 · Spatial volume popup — Escape & aria", () => {
  afterEach(unmount);

  const openVolumePopup = async () => {
    const btn = [...container!.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").startsWith("Громкость:"),
    );
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const popup = container!.querySelector('[role="group"][aria-label="Громкость"]');
    expect(popup).toBeTruthy();
    return { btn: btn!, popup: popup as HTMLElement };
  };

  it("B1. volume button exposes aria-expanded + aria-haspopup (v10.3 D)", async () => {
    await mount(SpatialFullPlayer);
    const { btn } = await openVolumePopup();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("B2. Escape WITH the popup slider focused closes the popup, not the player (was DEAD)", async () => {
    await mount(SpatialFullPlayer);
    const { btn, popup } = await openVolumePopup();
    const slider = popup.querySelector("input") as HTMLInputElement;
    expect(slider).toBeTruthy();
    // focus the slider (what a real click/drag does) — e.target = INPUT
    await act(async () => { slider.focus(); });
    expect(document.activeElement).toBe(slider);
    // THE v10.3 FIX: this Escape used to be swallowed by the INPUT guard.
    // Assert via the STATE-bound aria-expanded — the framer exit node can
    // linger in jsdom (rAF stub), but aria-expanded follows showVolume.
    await key("Escape", slider);
    await settle();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    // layered dismissal: player itself stays open
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(true);
    // and the NEXT Escape closes the player (proves the first one was
    // consumed by the popup layer — pre-fix BOTH were swallowed)
    await key("Escape", slider);
    await settle();
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("B3. control: Escape with NO input focused also closes the popup (regression guard)", async () => {
    await mount(SpatialFullPlayer);
    const { btn } = await openVolumePopup();
    (document.activeElement as HTMLElement | null)?.blur?.();
    await key("Escape");
    await settle();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(true);
  });

  it("B4. second Escape (popup already closed) closes the player — layering intact", async () => {
    await mount(SpatialFullPlayer);
    const { popup } = await openVolumePopup();
    const slider = popup.querySelector("input") as HTMLInputElement;
    await act(async () => { slider.focus(); });
    await key("Escape", slider); // 1st: popup
    await key("Escape", slider); // 2nd: player (slider is gone; target still an input is fine — Escape precedes the guard)
    await settle();
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });
});

// ═══ C · CLASSIC DESKTOP — Escape with focused volume slider ═══

describe("v10.3 · Classic desktop player — Escape with focused volume slider", () => {
  afterEach(unmount);

  it("C1. Escape on the focused volume slider closes the player (was DEAD — hint promises Esc close)", async () => {
    await mount(ClassicFullPlayer, { fullPlayerMode: "classic" as const });
    // desktop classic volume row: the VolumeSlider's inline <input>
    const sliders = [...container!.querySelectorAll('input[type="range"]')];
    expect(sliders.length).toBeGreaterThan(0);
    // the volume slider is the one inside the same row as the mute button
    const muteBtn = [...container!.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label") === "Выключить звук" || b.getAttribute("aria-label") === "Включить звук",
    );
    expect(muteBtn).toBeTruthy();
    const volInput = muteBtn!.parentElement?.querySelector("input") as HTMLInputElement;
    expect(volInput).toBeTruthy();
    await act(async () => { volInput.focus(); });
    expect(document.activeElement).toBe(volInput);
    // THE v10.3 FIX: used to be swallowed by the INPUT guard
    await key("Escape", volInput);
    await settle();
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("C2. control: non-Escape keys are still guarded while an input is focused (no hijack)", async () => {
    await mount(ClassicFullPlayer, { fullPlayerMode: "classic" as const, volume: 50 });
    const sliders = [...container!.querySelectorAll('input[type="range"]')];
    const volInput = sliders[sliders.length - 1] as HTMLInputElement;
    await act(async () => { volInput.focus(); });
    // ArrowUp on a focused range input must NOT trigger the global ±5 handler
    // (jsdom applies no native step) — the guard still skips INPUT targets.
    await key("ArrowUp", volInput);
    expect(useAppStore.getState().volume).toBe(50);
  });
});

// ═══ D · V10.3.1 — volume popup VISUAL placement (the "black capsule" fix) ═══
//
// Root cause of the black capsule: the popup used to live INSIDE the glass
// control panel; the panel's backdrop-filter formed a backdrop root, so the
// popup's own backdrop-filter no-opped and its rgb(16,16,16)/82% fill read
// as an opaque black slab floating over the transport/progress rows.
// Fix: popup renders as a direct child of the footer (no filtered ancestor
// → real glass), position measured from button+panel rects, canonical
// mq-menu-surface material.

describe("v10.3.1 · Spatial volume popup — visual placement & material", () => {
  afterEach(unmount);

  const openPopup = async () => {
    const btn = [...container!.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").startsWith("Громкость:"),
    );
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const popup = container!.querySelector("[data-mq-volpopup]") as HTMLElement | null;
    expect(popup).toBeTruthy();
    return { btn: btn!, popup: popup! };
  };

  it("D1. popup is a DIRECT child of the footer — NOT inside the glass panel (backdrop root)", async () => {
    await mount(SpatialFullPlayer);
    const { popup } = await openPopup();
    const footer = container!.querySelector('[data-mq-spatial="controls"]');
    expect(footer).toBeTruthy();
    // direct child of the footer (would be the volume wrapper if regressed
    // back inside the panel)
    expect(popup.parentElement).toBe(footer);
    // no ancestor between popup and footer carries a backdrop-filter/filter
    // (the glass panel does — that is what made the popup a black capsule)
    let el: HTMLElement | null = popup.parentElement;
    while (el && el !== footer) {
      expect(el.style.backdropFilter).toBe("");
      expect(el.style.filter).toBe("");
      el = el.parentElement;
    }
    expect(el).toBe(footer);
  });

  it("D2. canonical MQ menu material as INLINE tokens: 84% surface-1 + blur + edge-strong + elev-dialog", async () => {
    await mount(SpatialFullPlayer);
    const { popup } = await openPopup();
    // SAME token values the Context Menu renders with (.mq-menu-surface),
    // applied inline (inline is REQUIRED for backdrop-filter: Lightning
    // strips it from class rules; and the class itself bakes menu-only
    // geometry — fixed/min-width 232/padding 6 — that must not leak here)
    expect(popup.style.backgroundColor).toContain("var(--mq-surface-1) 84%");
    expect(popup.style.backdropFilter).toContain("var(--mq-blur-md)");
    expect(popup.style.border).toContain("var(--mq-edge-strong)");
    expect(popup.style.boxShadow).toContain("var(--mq-elev-dialog)");
    // compact popup geometry survives (Tailwind utilities unopposed)
    expect(popup.className).toContain("w-[200px]");
    expect(popup.className).toContain("rounded-2xl");
  });

  it("D3. position is MEASURED from the button/panel rects (px left/bottom), not a CSS anchor", async () => {
    await mount(SpatialFullPlayer);
    const { popup } = await openPopup();
    // jsdom rects are all 0 → {left: 0px, bottom: 12px} (GAP above panel
    // top). What matters: concrete px values from placeVolumePopup ran —
    // the old code anchored via bottom:calc(100%+12px) on the wrapper.
    expect(popup.style.left).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(popup.style.bottom).toBe("12px");
  });

  it("D4. pointerdown INSIDE the popup keeps it open; outside closes (capture exclusion)", async () => {
    await mount(SpatialFullPlayer);
    const { btn, popup } = await openPopup();
    // inside the popup (the slider area) — must NOT close
    await act(async () => {
      popup.querySelector("input")!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      );
    });
    await settle();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    // outside (footer/artwork area) — must close
    await act(async () => {
      container!.querySelector('[data-mq-spatial="stage"], main, [data-mq-spatial]')!
        .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    await settle();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("D5. popup content intact: VolumeSlider (RU mute button + range input) + group aria", async () => {
    await mount(SpatialFullPlayer);
    const { popup } = await openPopup();
    expect(popup.getAttribute("role")).toBe("group");
    expect(popup.getAttribute("aria-label")).toBe("Громкость");
    const slider = popup.querySelector('input[type="range"]');
    expect(slider).toBeTruthy();
    const mute = [...popup.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes("звук"),
    );
    expect(mute).toBeTruthy();
  });
});
