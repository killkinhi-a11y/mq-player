/**
 * v9 Final Spatial Player Polish — action rail (Like / Dislike / More)
 * + compact glass control bar + «Расположение дополнительных действий».
 *
 * Owner-mandated cases (§13):
 *  1 default action position = left          (store initial state)
 *  2 switch left → right                      (store; playback untouched)
 *  3 persistence                              (persist → localStorage)
 *  4 reload                                   (persist.rehydrate)
 *  5 Like LEFT                                (mounted, rail on the left)
 *  6 Dislike LEFT                             (mounted; store semantics)
 *  7 More LEFT                                (mounted; existing menu opens)
 *  8 Like RIGHT                               (mounted, rail on the right)
 *  9 Dislike RIGHT
 * 10 More RIGHT
 * 11 playback bar                             (3-row compact glass bar;
 *                                              like/dislike/more NOT in it)
 * 12 Classic unaffected                       (source contract + dispatcher)
 *
 * Plus: pure rail geometry (spatialRailLeft) and the mobile horizontal
 * pill adaptation (§8). Existing 482 tests stay untouched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/lyrics-client", () => ({
  fetchLyrics: vi.fn(async () => ({ lyrics: [{ time: 0, text: "ла ла ла" }], plainText: "" })),
}));

// Component CSS — vitest must not push it through postcss/tailwind
// (same pattern as full-player-themes.test.tsx).
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;

const spatialMod = await import("@/components/mq/fullplayer/SpatialFullPlayer");
const SpatialFullPlayer = spatialMod.default;
const { spatialRailLeft, SPATIAL_RAIL_W } = spatialMod as unknown as {
  spatialRailLeft: (cardW: number, stageW: number, position: "left" | "right") => number;
  SPATIAL_RAIL_W: number;
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

// ── jsdom shims (same as full-player-themes.test.tsx) ──
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
  spatialActionsPosition: "left" as const,
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

// ═══ 1–4 · SETTING + PERSISTENCE (store) ═══

describe("Action position — setting & persistence", () => {
  beforeEach(() => {
    useAppStore.setState({
      spatialActionsPosition: "left",
      currentTrack: QUEUE[1],
      queue: [...QUEUE],
      queueIndex: 1,
      upNext: [],
      progress: 42,
      volume: 55,
      isPlaying: true,
    } as StoreState);
  });

  it("1. default action position = left", () => {
    // the store's true initial value (not just the reset above)
    expect(useAppStore.getInitialState().spatialActionsPosition).toBe("left");
    expect(useAppStore.getState().spatialActionsPosition).toBe("left");
  });

  it("2. switch left → right (playback state untouched)", () => {
    useAppStore.getState().setSpatialActionsPosition("right");
    const s = useAppStore.getState();
    expect(s.spatialActionsPosition).toBe("right");
    // one-field write: track / queue / position / volume preserved
    expect(s.currentTrack?.id).toBe("b");
    expect(s.queue.map((t) => t.id)).toEqual(QUEUE.map((t) => t.id));
    expect(s.progress).toBe(42);
    expect(s.volume).toBe(55);
    expect(s.isPlaying).toBe(true);
    // and back
    useAppStore.getState().setSpatialActionsPosition("left");
    expect(useAppStore.getState().spatialActionsPosition).toBe("left");
  });

  it("3. persistence (persist → localStorage)", () => {
    useAppStore.getState().setSpatialActionsPosition("right");
    const raw = localStorage.getItem("mq-store-v8");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.spatialActionsPosition).toBe("right");
  });

  it("4. reload (rehydrate reads the choice back)", async () => {
    useAppStore.getState().setSpatialActionsPosition("right");
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().spatialActionsPosition).toBe("right");
    // right → left also persists
    useAppStore.getState().setSpatialActionsPosition("left");
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().spatialActionsPosition).toBe("left");
  });
});

// ═══ MOUNTED RAIL — helpers ═══

let container: HTMLDivElement | null;
let root: ReturnType<typeof createRoot> | null;

const mountSpatial = async (state: StoreState = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  useAppStore.setState({ ...BASE_STATE, ...state } as StoreState);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(SpatialFullPlayer));
  });
};

const unmountSpatial = async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  container = null; root = null;
};

const railEl = () => container?.querySelector('[data-mq-spatial="action-rail"]') ?? null;

const clickByLabel = async (label: string, x = 120, y = 300) => {
  const btn = container?.querySelector(`button[aria-label="${label}"]`);
  expect(btn, `button not found: ${label}`).toBeTruthy();
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  });
};

// ═══ 5–7 · ACTIONS LEFT (mounted, desktop vertical rail) ═══

describe("Actions LEFT — floating rail beside the carousel", () => {
  afterEach(unmountSpatial);

  it("5. Like works from the LEFT rail", async () => {
    await mountSpatial({ spatialActionsPosition: "left" });
    const rail = railEl();
    expect(rail).toBeTruthy();
    expect(rail!.getAttribute("data-mq-position")).toBe("left");
    expect(rail!.getAttribute("data-mq-orientation")).toBe("vertical");
    await clickByLabel("Нравится");
    expect(useAppStore.getState().likedTrackIds).toContain("b");
    // active state is visually obvious (aria-pressed flips)
    const liked = container?.querySelector('button[aria-label="Убрать из избранного"]');
    expect(liked?.getAttribute("aria-pressed")).toBe("true");
  });

  it("6. Dislike works from the LEFT rail (store semantics: playing track skips forward)", async () => {
    await mountSpatial({ spatialActionsPosition: "left" });
    await clickByLabel("Не нравится");
    const s = useAppStore.getState();
    expect(s.dislikedTrackIds).toContain("b");
    // established store behaviour (same as Classic): disliking the
    // current track advances the queue
    expect(s.currentTrack?.id).toBe("c");
    expect(s.queueIndex).toBe(2);
  });

  it("7. More opens the EXISTING menu from the LEFT rail", async () => {
    await mountSpatial({ spatialActionsPosition: "left" });
    await clickByLabel("Ещё", 60, 200);
    // MenuCore portals to document.body — same items as before, no new menu
    const body = document.body.textContent ?? "";
    expect(body).toContain("Поделиться");
    expect(body).toContain("К исполнителю");
    expect(body).toContain("Добавить в плейлист");
  });
});

// ═══ 8–10 · ACTIONS RIGHT (mounted, desktop vertical rail) ═══

describe("Actions RIGHT — same component, other side", () => {
  afterEach(unmountSpatial);

  it("8. Like works from the RIGHT rail", async () => {
    await mountSpatial({ spatialActionsPosition: "right" });
    const rail = railEl();
    expect(rail).toBeTruthy();
    expect(rail!.getAttribute("data-mq-position")).toBe("right");
    await clickByLabel("Нравится", 1300, 300);
    expect(useAppStore.getState().likedTrackIds).toContain("b");
  });

  it("9. Dislike works from the RIGHT rail", async () => {
    await mountSpatial({ spatialActionsPosition: "right" });
    await clickByLabel("Не нравится", 1300, 300);
    const s = useAppStore.getState();
    expect(s.dislikedTrackIds).toContain("b");
    expect(s.currentTrack?.id).toBe("c");
  });

  it("10. More opens the EXISTING menu from the RIGHT rail", async () => {
    await mountSpatial({ spatialActionsPosition: "right" });
    await clickByLabel("Ещё", 1300, 300);
    const body = document.body.textContent ?? "";
    expect(body).toContain("Поделиться");
    expect(body).toContain("Добавить в плейлист");
  });
});

// ═══ 11 · PLAYBACK BAR — compact 3-row glass panel ═══

describe("Playback bar — reference-like compact glass panel", () => {
  afterEach(unmountSpatial);

  it("11. bar keeps transport + secondary; Like/Dislike/More live ONLY in the rail", async () => {
    await mountSpatial();
    const bar = container?.querySelector('[data-mq-spatial="controls"]');
    expect(bar).toBeTruthy();
    const barHtml = bar!.innerHTML;
    // transport + progress + secondary present
    for (const label of [
      'aria-label="Предыдущий трек"',
      'aria-label="Следующий трек"',
      'aria-label="Играть"',
      'aria-label="Позиция воспроизведения"',
      'aria-label="Текст песни"',
      'aria-label="Очередь"',
      'aria-label="Громкость',
    ]) {
      expect(barHtml.includes(label), `bar missing: ${label}`).toBe(true);
    }
    // auxiliary actions moved OUT of the bar (into the rail)
    expect(barHtml.includes("Нравится")).toBe(false);
    expect(barHtml.includes("Не нравится")).toBe(false);
    expect(barHtml.includes('aria-label="Ещё"')).toBe(false);
    // ...and they exist exactly once on screen (the rail — no duplicates)
    const rail = railEl();
    expect(rail).toBeTruthy();
    expect(rail!.innerHTML.includes('aria-label="Нравится"')).toBe(true);
    expect(rail!.innerHTML.includes('aria-label="Не нравится"')).toBe(true);
    expect(rail!.innerHTML.includes('aria-label="Ещё"')).toBe(true);
    const allLikeButtons = container?.querySelectorAll('button[aria-label="Нравится"], button[aria-label="Убрать из избранного"]');
    expect(allLikeButtons?.length).toBe(1);
  });

  it("11b. rail geometry: outside the outermost card, clamped, mirrored", () => {
    // 1440×900 / card 432: symmetric placement around the deck centre
    const l = spatialRailLeft(432, 1440, "left");
    const r = spatialRailLeft(432, 1440, "right");
    expect(l).toBeGreaterThan(10);                       // not glued to the edge
    expect(l + SPATIAL_RAIL_W).toBeLessThan(720);        // left of the deck centre
    expect(r).toBeGreaterThan(720);                      // right of the deck centre
    expect(r + SPATIAL_RAIL_W).toBeLessThan(1440 - 10);  // never overflows
    expect(r).toBe(1440 - l - SPATIAL_RAIL_W);           // mirrored composition
    // narrow desktop clamps inside the viewport (no overflow, ever)
    const nl = spatialRailLeft(360, 900, "left");
    const nr = spatialRailLeft(360, 900, "right");
    expect(nl).toBeGreaterThanOrEqual(10);
    expect(nr + SPATIAL_RAIL_W).toBeLessThanOrEqual(900 - 10);
    expect(nl).toBeLessThan(450);
    expect(nr).toBeGreaterThan(450);
  });

  it("11c. v10 mobile = NORMAL player (no carousel, no rail pill); Left/Right setting never breaks it", async () => {
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    (window as unknown as { innerWidth: number }).innerWidth = 390;
    (window as unknown as { innerHeight: number }).innerHeight = 844;
    try {
      await mountSpatial({ spatialActionsPosition: "left" });
      // normal mobile player anatomy — big artwork + identity + like/dislike
      expect(container?.querySelector('[data-mq-spatial="mobile-artwork"]')).toBeTruthy();
      expect(container?.querySelector('[data-mq-spatial="mobile-identity"]')).toBeTruthy();
      expect(container?.querySelector('[data-mq-spatial="mobile-stage"]')).toBeTruthy();
      // NOT a shrunken desktop carousel and NOT the old action pill
      expect(container?.querySelectorAll('[data-mq-spatial-card]').length).toBe(0);
      expect(container?.querySelector('[data-mq-spatial="action-rail"]')).toBeNull();
      expect(container?.querySelector('[data-mq-spatial="action-rail-row"]')).toBeNull();
      // Like works from the identity row
      await clickByLabel("Нравится");
      expect(useAppStore.getState().likedTrackIds).toContain("b");
      // More lives in the header on mobile
      const headerMore = container?.querySelector('header button[aria-label="Ещё"]');
      expect(headerMore).toBeTruthy();
      // controls keep transport + progress + secondary
      const bar = container?.querySelector('[data-mq-spatial="controls"]');
      expect(bar).toBeTruthy();
      const barHtml = bar!.innerHTML;
      for (const label of [
        'aria-label="Предыдущий трек"',
        'aria-label="Следующий трек"',
        'aria-label="Позиция воспроизведения"',
        'aria-label="Текст песни"',
        'aria-label="Очередь"',
        'aria-label="Громкость',
      ]) {
        expect(barHtml.includes(label), `bar missing: ${label}`).toBe(true);
      }
      // the LEFT/RIGHT setting still applies (desktop-only) and switching
      // it must not break the mobile composition
      await act(async () => {
        useAppStore.getState().setSpatialActionsPosition("right");
      });
      expect(useAppStore.getState().spatialActionsPosition).toBe("right");
      expect(container?.querySelector('[data-mq-spatial="mobile-artwork"]')).toBeTruthy();
      expect(container?.querySelector('[data-mq-spatial="action-rail"]')).toBeNull();
    } finally {
      (window as unknown as { innerWidth: number }).innerWidth = origW;
      (window as unknown as { innerHeight: number }).innerHeight = origH;
      await unmountSpatial();
    }
  });
});

// ═══ 12 · CLASSIC UNAFFECTED ═══

describe("Classic Full Player — unaffected", () => {
  it("12a. Classic keeps its own like/dislike wiring (source contract)", () => {
    const src = readSrc("FullTrackView.tsx");
    expect(src.includes("toggleDislike(")).toBe(true);
    expect(src.includes('title="Не нравится"')).toBe(true);
    expect(src.includes("toggleLike(")).toBe(true);
    // Classic layout untouched: 44px icon buttons still present
    expect(src.includes("w-11 h-11 rounded-full")).toBe(true);
  });

  it("12b. dispatcher routing unchanged (classic→FullTrackView / spatial→SpatialFullPlayer)", () => {
    const src = readSrc("FullPlayer.tsx");
    expect(src.includes("FullTrackView")).toBe(true);
    expect(src.includes("FullTrackViewMobile")).toBe(true);
    expect(src.includes("SpatialFullPlayer")).toBe(true);
    expect(src.includes('mode === "spatial"')).toBe(true);
  });

  it("12c. Classic player renders no action rail (spatial-only UI)", async () => {
    // classic mode → the dispatcher renders FullTrackView, not the spatial
    // player: mount the spatial component's host state with classic mode and
    // confirm the rail is a Spatial-only element via the source contract.
    const src = readSrc("FullTrackView.tsx");
    expect(src.includes('data-mq-spatial="action-rail"')).toBe(false);
    // action-position setting must not leak into Classic's source
    expect(src.includes("spatialActionsPosition")).toBe(false);
  });
});

// ═══ SETTINGS UI CONTRACT ═══

describe("Settings — «Расположение дополнительных действий»", () => {
  it("exposes Слева/Справа with a live side preview (inside the Full Player card)", () => {
    const src = readSrc("SettingsView.tsx");
    expect(src.includes("Расположение дополнительных действий")).toBe(true);
    expect(src.includes("Слева")).toBe(true);
    expect(src.includes("Справа")).toBe(true);
    expect(src.includes('data-mq-setting="spatial-actions-position"')).toBe(true);
    expect(src.includes("setSpatialActionsPosition(pos)")).toBe(true);
    expect(src.includes('aria-label="Расположение дополнительных действий"')).toBe(true);
    // preview visually reflects the chosen side (rail dots positioned per side)
    expect(src.includes('pos === "left" ? "left" : "right"')).toBe(true);
  });
});
