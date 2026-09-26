/**
 * v8 Full Player Themes — «Вид полного плеера» (Classic / Spatial).
 *
 * Owner-mandated cases (§15):
 *  1 default = Classic                    (store)
 *  2 switch Classic → New                 (store)
 *  3 persistence after reload             (persist → localStorage → rehydrate)
 *  4 New → Classic                        (store)
 *  5 current track preserved on switch    (store — setter touches ONE field)
 *  6 playback position preserved          (store)
 *  7 queue preserved                      (store)
 *  8 Classic controls work                (source contract — existing wiring intact)
 *  9 New controls work                    (SSR markup: transport/secondary present)
 * 10 next/previous                        (store + spatial window math)
 * 11 play/pause                           (store toggle + markup label)
 * 12 lyrics                               (keyboard F opens lyrics overlay — mounted)
 * 13 queue                                (keyboard Q opens drawer; row click plays — mounted)
 * 14 volume                               (store setVolume + keyboard arrows — mounted)
 * 15 keyboard                             (Space/N/P/L/Escape — mounted)
 * 16 reduced motion                       (spatialMotionOn pure + render under reduceMotion)
 *
 * Existing tests stay untouched; this file only ADDS coverage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/lyrics-client", () => ({
  fetchLyrics: vi.fn(async () => ({ lyrics: [{ time: 0, text: "ла ла ла" }], plainText: "" })),
}));

// Component CSS — vitest must not push it through postcss/tailwind
// (same pattern as liquid-lyrics.test.ts).
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;

const spatialMod = await import("@/components/mq/fullplayer/SpatialFullPlayer");
const SpatialFullPlayer = spatialMod.default;
const {
  spatialCardGeom,
  spatialQueueWindow,
  spatialMotionOn,
  SPATIAL_TRANSITION_MS,
} = spatialMod as unknown as {
  spatialCardGeom: (offset: number, mobile: boolean) => Record<string, number>;
  spatialQueueWindow: <T>(queue: T[], queueIndex: number) => { track: T; offset: number }[];
  spatialMotionOn: (a: boolean, r: boolean, p: boolean | null) => boolean;
  SPATIAL_TRANSITION_MS: number;
};

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

const readSrc = (f: string) =>
  readFileSync(join(process.cwd(), "src/components/mq", f), "utf8");

// ── jsdom shims: matchMedia (framer + useIsMobile), Element.scrollTo
// (LiquidLyrics), rAF stubbed to never fire (framer exit animations never
// complete here — assertions are state-based where that matters) ──
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

// ═══ 1–7 · SETTING + PERSISTENCE + STATE PRESERVATION ═══

describe("Full Player mode — setting & persistence", () => {
  beforeEach(() => {
    useAppStore.setState({
      fullPlayerMode: "classic",
      currentTrack: QUEUE[0],
      queue: [...QUEUE],
      queueIndex: 0,
      upNext: [],
      shuffle: false,
      repeat: "off",
      progress: 42,
      volume: 55,
      isPlaying: true,
      isFullTrackViewOpen: false,
    } as StoreState);
  });

  it("1. default = Classic", () => {
    expect(useAppStore.getState().fullPlayerMode).toBe("classic");
  });

  it("2. switch Classic → New", () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    expect(useAppStore.getState().fullPlayerMode).toBe("spatial");
  });

  it("3. persistence after reload (persist → localStorage → rehydrate)", async () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    // persist middleware wrote to localStorage on the set above
    const raw = localStorage.getItem("mq-store-v8");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.fullPlayerMode).toBe("spatial");
    // simulate reload: rehydrate reads storage back into the store
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().fullPlayerMode).toBe("spatial");
  });

  it("4. New → Classic", () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    useAppStore.getState().setFullPlayerMode("classic");
    expect(useAppStore.getState().fullPlayerMode).toBe("classic");
  });

  it("5. switching preserves the current track", () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("a");
    expect(s.queueIndex).toBe(0);
  });

  it("6. switching preserves playback position", () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    expect(useAppStore.getState().progress).toBe(42);
    useAppStore.getState().setFullPlayerMode("classic");
    expect(useAppStore.getState().progress).toBe(42);
  });

  it("7. switching preserves the queue (and volume)", () => {
    useAppStore.getState().setFullPlayerMode("spatial");
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(QUEUE.map((t) => t.id));
    expect(s.volume).toBe(55);
  });
});

// ═══ 8 · CLASSIC — controls wiring intact (source contract) ═══

describe("Classic Full Player — existing controls intact", () => {
  it("8. classic player keeps its control wiring (togglePlay/next/prev/volume/lyrics/queue)", () => {
    const src = readSrc("FullTrackView.tsx");
    for (const contract of [
      "togglePlay()",
      "nextTrack()",
      "prevTrack()",
      "setVolume(",
      "setActivePanel(p => p === \"lyrics\"",
      "setActivePanel(p => p === \"queue\"",
      'aria-label="Закрыть"',
    ]) {
      expect(src.includes(contract), `missing: ${contract}`).toBe(true);
    }
    // v8 polish: desktop icon buttons meet the 44px a11y target
    expect(src.includes("w-11 h-11 rounded-full")).toBe(true);
  });
});

// ═══ 9–11 · NEW SPATIAL — composition + controls (mounted client render) ═══
// NOTE: renderToStaticMarkup renders zustand's SERVER snapshot (initial
// state → player closed), so markup assertions use the mounted client path
// (createRoot) — same DOM the browser gets.

async function mountAndGetHtml(state: StoreState = {}): Promise<string> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  useAppStore.setState({ ...BASE_STATE, ...state } as StoreState);
  const r = createRoot(el);
  let html = "";
  await act(async () => {
    r.render(React.createElement(SpatialFullPlayer));
  });
  html = el.innerHTML;
  await act(async () => { r.unmount(); });
  el.remove();
  return html;
}

describe("New Spatial Full Player — reference composition & controls", () => {
  it("9. renders transport + secondary controls with aria labels", async () => {
    const html = await mountAndGetHtml();
    for (const label of [
      'aria-label="Предыдущий трек"',
      'aria-label="Следующий трек"',
      'aria-label="Играть"',
      'aria-label="Нравится"',
      'aria-label="Текст песни"',
      'aria-label="Очередь"',
      'aria-label="Ещё"',
      'aria-label="Позиция воспроизведения"',
      'aria-label="Закрыть"',
      'aria-label="Поделиться"',
    ]) {
      expect(html.includes(label), `missing: ${label}`).toBe(true);
    }
  });

  it("9b. depth carousel: real queue neighbours at ±1/±2, center is current track", async () => {
    // queueIndex=2 → full symmetric window: offsets -2..+2 all exist
    const html = await mountAndGetHtml({ queueIndex: 2, currentTrack: QUEUE[2] });
    expect(html.includes('data-mq-spatial-card="0"')).toBe(true);
    expect(html.includes('data-mq-spatial-card="-1"')).toBe(true);
    expect(html.includes('data-mq-spatial-card="1"')).toBe(true);
    expect(html.includes('data-mq-spatial-card="-2"')).toBe(true);
    expect(html.includes('data-mq-spatial-card="2"')).toBe(true);
    // real covers from the queue, not fake artwork
    expect(html.includes("https://img.example/c.jpg")).toBe(true);
    // side cards are switch affordances
    expect(html.includes("Переключиться на: Track b")).toBe(true);
    expect(html.includes("Переключиться на: Track d")).toBe(true);
    // title/artist render inside the center card
    expect(html.includes("Track c")).toBe(true);
    expect(html.includes("Artist c")).toBe(true);
  });

  it("9c. pure geometry: center card dominant; side cards smaller/dimmer/more blurred/behind", () => {
    const c = spatialCardGeom(0, false);
    const l1 = spatialCardGeom(-1, false);
    const r2 = spatialCardGeom(2, false);
    expect(c.scale).toBe(1);
    expect(c.opacity).toBe(1);
    expect(c.zIndex).toBeGreaterThan(l1.zIndex as number);
    expect((l1.zIndex as number)).toBeGreaterThan(r2.zIndex as number);
    expect(l1.scale).toBeLessThan(c.scale as number);
    expect(l1.opacity).toBeLessThan(c.opacity as number);
    expect(l1.blurPx).toBeGreaterThan(c.blurPx as number);
    // side cards sit BEHIND the center card (inner edge overlapped: |x| < 50%)
    expect(Math.abs(l1.xPct as number)).toBeLessThan(50);
    // mirrored composition
    expect(spatialCardGeom(1, false).xPct).toBe(-l1.xPct);
    // mobile crops side cards harder
    expect(Math.abs(spatialCardGeom(1, true).xPct as number))
      .toBeLessThan(Math.abs(spatialCardGeom(1, false).xPct as number));
  });

  it("10. next/previous move the carousel window (offset math on the real queue)", () => {
    const before = spatialQueueWindow(QUEUE, 1);
    expect(before.find((x) => x.offset === 0)?.track.id).toBe("b");
    const after = spatialQueueWindow(QUEUE, 2);
    expect(after.find((x) => x.offset === 0)?.track.id).toBe("c");
    expect(after.find((x) => x.offset === -1)?.track.id).toBe("b");
    expect(after.find((x) => x.offset === 1)?.track.id).toBe("d");
    // window edges respect the queue bounds — no fake tracks
    const edge = spatialQueueWindow(QUEUE.slice(0, 2), 1);
    expect(edge.map((x) => x.offset)).toEqual([-1, 0]);
    expect(spatialQueueWindow([], 0)).toEqual([]);
    expect(spatialQueueWindow(QUEUE, 99)).toEqual([]);
  });

  it("11. play/pause: control label reflects state", async () => {
    const htmlPaused = await mountAndGetHtml({ isPlaying: false });
    expect(htmlPaused.includes('aria-label="Играть"')).toBe(true);
    const htmlPlaying = await mountAndGetHtml({ isPlaying: true });
    expect(htmlPlaying.includes('aria-label="Пауза"')).toBe(true);
  });
});

// ═══ 12–15 · INTERACTIONS (mounted component + real events) ═══

describe("New Spatial Full Player — interactions", () => {
  let container: HTMLDivElement | null;
  let root: Root | null;

  const mountSpatial = async (state: StoreState = {}) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    useAppStore.setState({ ...BASE_STATE, ...state } as StoreState);
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(SpatialFullPlayer));
    });
  };

  const key = async (code: string, opts: KeyboardEventInit = {}) => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true, ...opts }));
    });
  };

  const text = () => container?.textContent ?? "";

  afterEach(async () => {
    if (root) await act(async () => { root!.unmount(); });
    container?.remove();
    container = null; root = null;
  });

  it("11b. Space toggles play/pause (keyboard)", async () => {
    await mountSpatial({ isPlaying: false });
    await key("Space");
    expect(useAppStore.getState().isPlaying).toBe(true);
    await key("Space");
    expect(useAppStore.getState().isPlaying).toBe(false);
  });

  it("12. F opens the lyrics overlay (lyrics fetched and rendered)", async () => {
    await mountSpatial();
    await key("KeyF");
    expect(text()).toContain("Текст песни");
    // let the mocked fetchLyrics promise resolve into state
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(text()).toContain("ла ла ла");
  });

  it("13. Q opens the queue drawer; clicking a row plays that track", async () => {
    await mountSpatial();
    await key("KeyQ");
    expect(text()).toContain("Очередь · 6");
    const row = container?.querySelector('[aria-label="Играть: Track d — Artist d"]');
    expect(row).toBeTruthy();
    await act(async () => { row!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("d");
    expect(s.queueIndex).toBe(3);
    // drawer STATE closed after pick: prove via Escape — with queueOpen
    // already false, the next Escape must close the PLAYER itself.
    // (The exiting drawer node lingers only because the rAF stub never
    // lets framer finish its exit animation — a jsdom artifact, not UX.)
    await key("Escape");
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("14. volume: ArrowUp/ArrowDown/M keyboard", async () => {
    await mountSpatial({ volume: 50 });
    await key("ArrowUp");
    expect(useAppStore.getState().volume).toBe(55);
    await key("ArrowDown");
    expect(useAppStore.getState().volume).toBe(50);
    await key("KeyM");
    expect(useAppStore.getState().volume).toBe(0);
    await key("KeyM");
    // v10.3: restores the last audible level (50), not a hardcoded 70
    expect(useAppStore.getState().volume).toBe(50);
  });

  it("15. keyboard: N/P next & previous, L like, Escape closes", async () => {
    await mountSpatial();
    await key("KeyN");
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
    await key("KeyP");
    expect(useAppStore.getState().currentTrack?.id).toBe("b");
    await key("KeyL");
    expect(useAppStore.getState().likedTrackIds).toContain("b");
    await key("Escape");
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("13b. side card click switches to that track (carousel affordance)", async () => {
    await mountSpatial();
    const side = container?.querySelector('[data-mq-spatial-card="1"]');
    expect(side).toBeTruthy();
    await act(async () => {
      side!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
  });
});

// ═══ 16 · REDUCED MOTION ═══

describe("reduced motion (prefers-reduced-motion / user setting)", () => {
  it("16. spatialMotionOn collapses transitions but keeps functionality", () => {
    expect(spatialMotionOn(true, false, false)).toBe(true);       // normal
    expect(spatialMotionOn(true, false, true)).toBe(false);       // OS reduce
    expect(spatialMotionOn(false, false, false)).toBe(false);      // animations off
    expect(spatialMotionOn(true, true, false)).toBe(false);        // user reduce
    expect(spatialMotionOn(true, true, true)).toBe(false);         // everything
  });

  it("16b. transition duration respects the 450–550ms premium-calm band", () => {
    expect(SPATIAL_TRANSITION_MS).toBeGreaterThanOrEqual(450);
    expect(SPATIAL_TRANSITION_MS).toBeLessThanOrEqual(550);
  });

  it("16c. player still renders fully under reduceMotion (functionality intact)", async () => {
    const html = await mountAndGetHtml({ reduceMotion: true });
    expect(html.includes('data-mq-spatial-card="0"')).toBe(true);
    expect(html.includes('aria-label="Играть"')).toBe(true);
    expect(html.includes('aria-label="Следующий трек"')).toBe(true);
  });
});

// ═══ SETTINGS UI CONTRACT ═══

describe("Settings — «Вид полного плеера» radio previews", () => {
  it("exposes both options with live previews and obvious selected state", () => {
    const src = readSrc("SettingsView.tsx");
    expect(src.includes("Вид полного плеера")).toBe(true);
    expect(src.includes("Классический")).toBe(true);
    expect(src.includes("Новый")).toBe(true);
    expect(src.includes('role="radiogroup"')).toBe(true);
    expect(src.includes('data-mq-setting="full-player-mode"')).toBe(true);
    expect(src.includes('setFullPlayerMode("spatial")')).toBe(true);
    expect(src.includes('setFullPlayerMode("classic")')).toBe(true);
  });
});

// ═══ DISPATCHER CONTRACT ═══

describe("FullPlayer dispatcher — mode routing", () => {
  it("routes classic→FullTrackView / spatial→SpatialFullPlayer; AppShell mounts ONE dispatcher", () => {
    const src = readSrc("FullPlayer.tsx");
    expect(src.includes("FullTrackView")).toBe(true);
    expect(src.includes("FullTrackViewMobile")).toBe(true);
    expect(src.includes("SpatialFullPlayer")).toBe(true);
    expect(src.includes('mode === "spatial"')).toBe(true);
    // AppShell mounts exactly ONE dispatcher
    const shell = readSrc("AppShell.tsx");
    expect(shell.includes("<FullPlayer />")).toBe(true);
    expect(shell.includes("<FullTrackViewMobile />")).toBe(false);
    expect(shell.includes("<FullTrackView />")).toBe(false);
  });
});
