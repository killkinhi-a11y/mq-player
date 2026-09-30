/**
 * V10.4.1 — focused bug-fix regression tests (4 confirmed GAPs).
 *
 *  GAP #1  Desktop showed the touch hint «← двойной тап →» at 1440x900 —
 *          the hint was not gated by isMobile (FullTrackView renders on
 *          desktop only). Fix: {showDoubleTapHint && isMobile && ...} —
 *          zero DOM presence on desktop, mobile path preserved.
 *  GAP #2  Capsule volume: ONE trusted ArrowUp/Down applied ±10 — the
 *          local slider onKeyDown (React bubble) ran AND the global
 *          useKeyboardShortcuts window listener handled the same event.
 *          Fix: ownership pattern (stopPropagation, same model as
 *          ProgressBar). These tests mount BOTH handlers — pre-fix the
 *          volume jumps +10/-10, post-fix exactly +5/-5.
 *  GAP #3  Mobile swipe-down called setOpen(false) directly — instant
 *          unmount, no exit animation. Fix: requestClose() — the SAME
 *          lifecycle as the Close button (closing=true → mqFtSlideDown →
 *          animationend → setOpen(false) → unmount).
 *  GAP #4  Volume popup overflow: the "27" value rendered 14px (spatial)
 *          / 10px (mobile) OUTSIDE the capsule. Root cause (measured in a
 *          real browser): input.mq-hslider-input's flex automatic minimum
 *          size (min-width:auto) resolved to the intrinsic 129px input
 *          width — flex-1 could not shrink it. Fix: min-w-0 on the input.
 *          (Real geometry is proven by the browser E2E; these jsdom tests
 *          pin the CONTRACT: min-w-0 present, popup geometry intact, and
 *          NO overflow:hidden masking was introduced.)
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

const hooksMod = await import("@/hooks/useKeyboardShortcuts");
const useKeyboardShortcuts = hooksMod.useKeyboardShortcuts;

const classicMod = await import("@/components/mq/FullTrackView");
const ClassicFullPlayer = classicMod.default;

const mobileMod = await import("@/components/mq/FullTrackViewMobile");
const FullTrackViewMobile = mobileMod.default;

const barMod = await import("@/components/mq/PlayerBar");
const PlayerBar = barMod.default;

const spatialMod = await import("@/components/mq/fullplayer/SpatialFullPlayer");
const SpatialFullPlayer = spatialMod.default;

import type { Track } from "@/lib/musicApi";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const readSrc = (...f: string[]) =>
  readFileSync(join(process.cwd(), "src", ...f), "utf8");

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
  fullPlayerMode: "classic" as const,
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

const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const key = async (k: string, target?: HTMLElement) => {
  await act(async () => {
    (target ?? window).dispatchEvent(
      new KeyboardEvent("keydown", { key: k, code: k, bubbles: true, cancelable: true }),
    );
  });
};

/** Synthetic touch event with the geometry the swipe handlers read. */
const touch = (el: Element, type: "touchstart" | "touchend", pts: { clientX: number; clientY: number }[], changed: { clientX: number; clientY: number }[]) => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: pts });
  Object.defineProperty(ev, "changedTouches", { value: changed });
  el.dispatchEvent(ev);
};

const HINT_TEXT = "← двойной тап →";

/** Harness: mounts the capsule PlayerBar WITH the global shortcut hook —
 *  exactly the production pairing that double-fired ArrowUp/Down. */
const CapsuleHarness = () => {
  useKeyboardShortcuts();
  return React.createElement(PlayerBar);
};

// ═══ GAP #1 · double-tap hint gate ═══

describe("v10.4.1 GAP#1 · double-tap hint — desktop absent, mobile preserved", () => {
  const realWidth = window.innerWidth;
  afterEach(async () => {
    (window as unknown as { innerWidth: number }).innerWidth = realWidth;
    await unmount();
  });

  it("G1a. DESKTOP (innerWidth 1024): the «← двойной тап →» hint has ZERO DOM presence", async () => {
    (window as unknown as { innerWidth: number }).innerWidth = 1024;
    await mount(ClassicFullPlayer, { fullPlayerMode: "classic" as const });
    // the hint used to mount instantly with opacity animating 0→0.5→0
    const nodes = [...container!.querySelectorAll("*")].filter((el) =>
      [...el.childNodes].some((n) => n.textContent === HINT_TEXT),
    );
    expect(nodes.length).toBe(0);
    expect(container!.textContent).not.toContain("двойной тап");
    // 4s later it must STILL never have existed (old auto-hide window)
    await settle(100);
    expect(container!.textContent).not.toContain("двойной тап");
  });

  it("G1b. MOBILE (innerWidth 390): the first-open hint is PRESERVED by the gate", async () => {
    (window as unknown as { innerWidth: number }).innerWidth = 390;
    await mount(ClassicFullPlayer, { fullPlayerMode: "classic" as const });
    const nodes = [...container!.querySelectorAll("*")].filter((el) =>
      [...el.childNodes].some((n) => n.textContent === HINT_TEXT),
    );
    // the isMobile branch of the gate still renders the hint
    // (matches the motion.div + its ancestors that carry the same text)
    expect(nodes.length).toBeGreaterThan(0);
    expect(container!.textContent).toContain(HINT_TEXT);
  });

  it("G1c. source contract: the render gate is `showDoubleTapHint && isMobile`", () => {
    const src = readSrc("components/mq/FullTrackView.tsx");
    expect(src).toContain("{showDoubleTapHint && isMobile && (");
  });
});

// ═══ GAP #2 · capsule volume ±5 (ownership, no double-fire) ═══

describe("v10.4.1 GAP#2 · capsule volume — exactly ±5 per trusted key (global handler mounted)", () => {
  afterEach(async () => { await unmount(); });

  const sliderEl = () => {
    const el = container!.querySelector('div[role="slider"][aria-label="Громкость"]') as HTMLElement | null;
    expect(el).toBeTruthy();
    return el!;
  };

  it("G2a. ArrowUp = exactly +5 (was +10 with both handlers firing)", async () => {
    // player CLOSED = the production state where the capsule is used
    await mount(CapsuleHarness, { isFullTrackViewOpen: false, volume: 80 });
    const slider = sliderEl();
    await act(async () => { slider.focus(); });
    await key("ArrowUp", slider);
    expect(useAppStore.getState().volume).toBe(85);
    await key("ArrowUp", slider);
    expect(useAppStore.getState().volume).toBe(90);
    // boundary: at 100 an ArrowUp stays at 100 (clamped, still one update)
    await act(async () => { useAppStore.setState({ volume: 98 }); });
    await key("ArrowUp", slider);
    expect(useAppStore.getState().volume).toBe(100);
    await key("ArrowUp", slider);
    expect(useAppStore.getState().volume).toBe(100);
  });

  it("G2b. ArrowDown = exactly −5 (was −10 with both handlers firing)", async () => {
    await mount(CapsuleHarness, { isFullTrackViewOpen: false, volume: 90 });
    const slider = sliderEl();
    await act(async () => { slider.focus(); });
    await key("ArrowDown", slider);
    expect(useAppStore.getState().volume).toBe(85);
    await key("ArrowDown", slider);
    expect(useAppStore.getState().volume).toBe(80);
    // boundary: at 0 an ArrowDown stays at 0
    await act(async () => { useAppStore.setState({ volume: 2 }); });
    await key("ArrowDown", slider);
    expect(useAppStore.getState().volume).toBe(0);
    await key("ArrowDown", slider);
    expect(useAppStore.getState().volume).toBe(0);
  });

  it("G2c. ownership does NOT break GLOBAL shortcuts — arrows with the slider unfocused still ±5 (global handler)", async () => {
    await mount(CapsuleHarness, { isFullTrackViewOpen: false, volume: 50 });
    (document.activeElement as HTMLElement | null)?.blur?.();
    await key("ArrowUp");
    expect(useAppStore.getState().volume).toBe(55);
    await key("ArrowDown");
    expect(useAppStore.getState().volume).toBe(50);
  });

  it("G2d. source contract: slider onKeyDown stops propagation for owned keys (ProgressBar ownership model)", () => {
    const src = readSrc("components/mq/PlayerBar.tsx");
    const onKeyDown = src.slice(src.indexOf('aria-label="Громкость"'));
    const handler = onKeyDown.slice(0, onKeyDown.indexOf("className="));
    expect(handler).toContain("stopPropagation");
    expect(handler).toContain("ArrowUp");
    expect(handler).toContain("ArrowDown");
  });
});

// ═══ GAP #3 · swipe-down close lifecycle ═══

describe("v10.4.1 GAP#3 · mobile swipe-down — requestClose lifecycle, not hard unmount", () => {
  afterEach(async () => { await unmount(); });

  const rootDialog = () => {
    const el = container!.querySelector('[role="dialog"][aria-label^="Полноэкранный плеер"]') as HTMLElement | null;
    expect(el).toBeTruthy();
    return el!;
  };

  const swipeDown = async () => {
    const art = container!.querySelector("[data-mq-artwork]") as HTMLElement | null;
    expect(art).toBeTruthy();
    await act(async () => {
      touch(art!, "touchstart", [{ clientX: 195, clientY: 250 }], [{ clientX: 195, clientY: 250 }]);
    });
    await act(async () => {
      // dy = 310 > 80, dy > |dx|*1.5, fast — the swipe-down gesture
      touch(art!, "touchend", [], [{ clientX: 195, clientY: 560 }]);
    });
  };

  it("G3a. swipe-down invokes the close lifecycle: closing state + mqFtSlideDown (player NOT hard-unmounted)", async () => {
    await mount(FullTrackViewMobile);
    await swipeDown();
    const dlg = rootDialog();
    // the exit animation is armed on the ROOT (same as the Close button)
    expect(dlg.style.animation).toContain("mqFtSlideDown");
    // and the player is still mounted/open — the store flag flips only on
    // animationend (pre-fix: setOpen(false) had already unmounted it)
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(true);
  });

  /** jsdom quirk: jsdom lacks `onanimationend`, so React's vendor-prefix
 *  resolver registers the delegated listener as "webkitAnimationEnd".
 *  (In a real browser the name is "animationend" — the component code is
 *  browser-correct; only the synthetic dispatch needs the jsdom name.) */
  const ANIM_END = "webkitAnimationEnd";

  it("G3b. swipe-down exit animation COMPLETES: animationend → store close → unmount", async () => {
    await mount(FullTrackViewMobile);
    await swipeDown();
    const dlg = rootDialog();
    await act(async () => {
      // bubbles:true so the React-delegated root listener runs the handler;
      // target === the dialog itself (the handler's own element)
      dlg.dispatchEvent(new Event(ANIM_END, { bubbles: true }));
    });
    await settle();
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
    // component returns null when closed → dialog leaves the DOM
    expect(container!.querySelector('[role="dialog"][aria-label^="Полноэкранный плеер"]')).toBeNull();
  });

  it("G3c. the CLOSE BUTTON follows the SAME lifecycle (parity — both paths mqFtSlideDown)", async () => {
    await mount(FullTrackViewMobile);
    const closeBtn = [...container!.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Закрыть",
    );
    expect(closeBtn).toBeTruthy();
    await act(async () => {
      closeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dlg = rootDialog();
    expect(dlg.style.animation).toContain("mqFtSlideDown");
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(true);
    await act(async () => {
      dlg.dispatchEvent(new Event(ANIM_END, { bubbles: true }));
    });
    await settle();
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("G3d. source contract: the swipe-down branch calls requestClose (not setOpen)", () => {
    const src = readSrc("components/mq/FullTrackViewMobile.tsx");
    const i = src.indexOf("handleCoverTouchEnd");
    const body = src.slice(i, src.indexOf("}, [requestClose", i));
    expect(body).toContain("requestClose(); return;");
    expect(body).not.toContain("setOpen(false)");
  });
});

// ═══ GAP #4 · volume popup internal geometry contracts ═══

describe("v10.4.1 GAP#4 · volume popup internal geometry — content really fits (no masking)", () => {
  afterEach(async () => { await unmount(); });

  const openSpatialPopup = async () => {
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
    return popup!;
  };

  it("G4a. SPATIAL popup: slider can shrink (min-w-0), value inside the row, popup 200px with NO overflow masking", async () => {
    await mount(SpatialFullPlayer, { fullPlayerMode: "spatial" as const });
    const popup = await openSpatialPopup();
    // the fix: the flex input may shrink below its intrinsic 129px
    const input = popup.querySelector('input[type="range"]') as HTMLElement;
    expect(input.className).toContain("min-w-0");
    expect(input.className).toContain("flex-1");
    // the numeric value span is the LAST flex child, shrink-0, INSIDE the row
    const row = popup.firstElementChild as HTMLElement;
    const value = [...popup.querySelectorAll("span")].find((s) => /font-mono/.test(s.className));
    expect(value).toBeTruthy();
    expect(value!.className).toContain("flex-shrink-0");
    expect(value!.parentElement).toBe(row);
    // popup geometry unchanged (v10.3.1 contract) and NOT masked:
    expect(popup.className).toContain("w-[200px]");
    expect(popup.className).not.toContain("overflow-hidden");
    expect(popup.style.overflow).not.toBe("hidden");
  });

  it("G4b. MOBILE popup: same contract, 220px capsule", async () => {
    await mount(FullTrackViewMobile);
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
    const input = popup!.querySelector('input[type="range"]') as HTMLElement;
    expect(input.className).toContain("min-w-0");
    const value = [...popup!.querySelectorAll("span")].find((s) => /font-mono/.test(s.className));
    expect(value).toBeTruthy();
    expect(popup!.className).toContain("w-[220px]");
    expect(popup!.className).not.toContain("overflow-hidden");
    expect(popup!.style.overflow).not.toBe("hidden");
  });

  it("G4c. source contract: the horizontal VolumeSlider input carries min-w-0 (the measured 129px intrinsic clamp fix)", () => {
    const src = readSrc("components/ui/volume-slider.tsx");
    expect(src).toContain('className="mq-hslider-input flex-1 min-w-0"');
  });
});
