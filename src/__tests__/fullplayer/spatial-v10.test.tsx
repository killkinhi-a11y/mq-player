/**
 * v10 Spatial Full Player polish — regression tests.
 *
 * Covers the four v10 workstreams:
 *  1. HOVER PREVIEW — pure geometry (spatialHoverGeom / spatialFocusGeom /
 *     SPATIAL_HOVER_MS) + mounted hover/focus state wiring on side cards;
 *     center card never gets a preview; mobile gets NO hover states.
 *  2. ARTWORK ARTIFACTS — the background environment is a tiny-canvas
 *     backdrop (source-level fix for GPU-blur banding), not a full-screen
 *     filter:blur(72px) <img>.
 *  3. MORE ACTIONS — the audited action set (Поделиться / Копировать
 *     название / Скачать / К исполнителю / Подписаться на артиста /
 *     Добавить в очередь / Добавить в плейлист) present in ONE menu with
 *     no duplicates; handlers drive the same store state as Classic.
 *  4. MOBILE PLAYER MODE — normal mobile player anatomy (artwork,
 *     identity + like/dislike, progress, transport, secondary) instead
 *     of a shrunken carousel; no hover-only UI on touch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/lyrics-client", () => ({
  fetchLyrics: vi.fn(async () => ({ lyrics: [{ time: 0, text: "ла ла ла" }], plainText: "" })),
}));

vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;

const spatialMod = await import("@/components/mq/fullplayer/SpatialFullPlayer");
const SpatialFullPlayer = spatialMod.default;
const {
  spatialCardGeom,
  spatialHoverGeom,
  spatialFocusGeom,
  SPATIAL_HOVER_MS,
  SPATIAL_TRANSITION_MS,
} = spatialMod as unknown as {
  spatialCardGeom: (offset: number, mobile: boolean) => {
    scale: number; opacity: number; blurPx: number; xPct: number;
    yPct: number; rotateZDeg: number; rotateYDeg: number; zIndex: number;
  };
  spatialHoverGeom: (
    g: { scale: number; opacity: number; blurPx: number; xPct: number; yPct: number; rotateZDeg: number; rotateYDeg: number; zIndex: number },
    mobile: boolean,
  ) => { scale: number; opacity: number; blurPx: number; xPct: number; yPct: number; rotateZDeg: number; rotateYDeg: number; zIndex: number };
  spatialFocusGeom: (
    g: { scale: number; opacity: number; blurPx: number; xPct: number; yPct: number; rotateZDeg: number; rotateYDeg: number; zIndex: number },
    mobile: boolean,
  ) => { scale: number; opacity: number; blurPx: number; xPct: number; yPct: number; rotateZDeg: number; rotateYDeg: number; zIndex: number };
  SPATIAL_HOVER_MS: number;
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
  favoriteArtists: [],
};

// ── mount helpers (same pattern as spatial-actions.test.tsx) ──
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

const clickByLabel = async (label: string, x = 120, y = 300) => {
  const btn = container?.querySelector(`button[aria-label="${label}"]`);
  expect(btn, `button not found: ${label}`).toBeTruthy();
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  });
};

const openMore = async (x = 60, y = 200) => {
  await clickByLabel("Ещё", x, y);
};

// ═══ 1 · HOVER PREVIEW — pure geometry ═══

describe("v10 hover preview — geometry (pure)", () => {
  it("1a. hover lifts a side card inside the spec band (scale/opacity/blur)", () => {
    const g1 = spatialCardGeom(1, false); // depth 1 neighbour
    const h1 = spatialHoverGeom(g1, false);
    expect(h1.scale).toBeGreaterThan(g1.scale);
    expect(h1.scale).toBeLessThanOrEqual(0.76);
    expect(h1.opacity).toBeGreaterThan(g1.opacity);
    expect(h1.opacity).toBeLessThanOrEqual(0.82);
    expect(h1.blurPx).toBeLessThan(g1.blurPx);
    expect(h1.blurPx).toBeGreaterThanOrEqual(0.5);
    // spec: hover ≈ 0.72–0.74 scale / 0.72–0.82 opacity / 0.5–0.8 blur
    expect(h1.scale).toBeGreaterThanOrEqual(0.7);
    expect(h1.opacity).toBeGreaterThanOrEqual(0.7);
    expect(h1.blurPx).toBeLessThanOrEqual(0.8);
  });

  it("1b. hover works for both neighbours and depth-2 stays quieter", () => {
    const prev = spatialCardGeom(-1, false);
    const next = spatialCardGeom(1, false);
    const hp = spatialHoverGeom(prev, false);
    const hn = spatialHoverGeom(next, false);
    expect(hp.scale).toBeCloseTo(hn.scale, 10); // symmetric
    const deep = spatialCardGeom(2, false);
    const hd = spatialHoverGeom(deep, false);
    expect(hd.scale).toBeLessThan(hn.scale);   // deeper cards stay behind
    expect(hd.opacity).toBeLessThan(hn.opacity);
  });

  it("1c. focus is one notch quieter than hover", () => {
    const g = spatialCardGeom(1, false);
    const h = spatialHoverGeom(g, false);
    const f = spatialFocusGeom(g, false);
    expect(f.scale).toBeLessThan(h.scale);
    expect(f.opacity).toBeLessThan(h.opacity);
    expect(f.blurPx).toBeGreaterThanOrEqual(h.blurPx);
    expect(f.scale).toBeGreaterThan(g.scale); // but still visibly focused
    expect(f.opacity).toBeGreaterThan(g.opacity);
  });

  it("1d. mobile NEVER gets hover/focus geometry (no hover-only states on touch)", () => {
    for (const off of [-2, -1, 1, 2]) {
      const g = spatialCardGeom(off, true);
      expect(spatialHoverGeom(g, true)).toBe(g);
      expect(spatialFocusGeom(g, true)).toBe(g);
    }
  });

  it("1e. timing: hover 180–250ms band; carousel stays 500ms", () => {
    expect(SPATIAL_HOVER_MS).toBeGreaterThanOrEqual(180);
    expect(SPATIAL_HOVER_MS).toBeLessThanOrEqual(250);
    expect(SPATIAL_TRANSITION_MS).toBe(500);
  });
});

// ═══ 1 · HOVER PREVIEW — mounted desktop wiring ═══

describe("v10 hover preview — mounted desktop wiring", () => {
  afterEach(unmountSpatial);

  it("1f. side cards carry hover/focus handlers; the center card does not", async () => {
    await mountSpatial();
    const cards = [...container!.querySelectorAll("[data-mq-spatial-card]")];
    // queueIndex=1 → real neighbours: offsets -1,0,+1,+2
    expect(cards.length).toBe(4);
    const center = cards.find((c) => c.getAttribute("data-mq-spatial-card") === "0")!;
    const next = cards.find((c) => c.getAttribute("data-mq-spatial-card") === "1")!;
    // React derives mouseenter/leave from over/out — dispatch those
    await act(async () => {
      next.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    expect(next.getAttribute("data-mq-hover")).toBe("true");
    await act(async () => {
      next.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    expect(next.getAttribute("data-mq-hover")).toBe(null);
    // center card never enters a preview state
    await act(async () => {
      center.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    expect(center.getAttribute("data-mq-hover")).toBe(null);
  });

  it("1g. keyboard focus on a side card shows the quieter focus twin", async () => {
    await mountSpatial();
    const cards = [...container!.querySelectorAll("[data-mq-spatial-card]")];
    const prev = cards.find((c) => c.getAttribute("data-mq-spatial-card") === "-1")!;
    // React onFocus/onBlur use focusin/focusout delegation — dispatch those
    await act(async () => {
      prev.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(prev.getAttribute("data-mq-focus")).toBe("true");
    await act(async () => {
      prev.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(prev.getAttribute("data-mq-focus")).toBe(null);
  });

  it("1h. clicking a side card still switches tracks (500ms deck motion intact)", async () => {
    await mountSpatial();
    // click the NEXT neighbour explicitly (offset +1 → track c)
    const nextCard = container!.querySelector('[data-mq-spatial-card="1"]');
    const btn = nextCard?.querySelector("button");
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // queue advanced to that neighbour (c) and it became the current track
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
    expect(useAppStore.getState().queueIndex).toBe(2);
    // and the previous neighbour works too (from c: offset -1 → track b)
    const prevCard = container!.querySelector('[data-mq-spatial-card="-1"]');
    const prevBtn = prevCard?.querySelector("button");
    await act(async () => {
      prevBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().currentTrack?.id).toBe("b");
    expect(useAppStore.getState().queueIndex).toBe(1);
  });
});

// ═══ 2 · ARTWORK ARTIFACTS — canvas backdrop (source fix) ═══

describe("v10 artwork artifacts — background environment", () => {
  afterEach(unmountSpatial);

  it("2a. the backdrop is a tiny CANVAS, not a full-screen blur(72px) <img>", async () => {
    await mountSpatial();
    const canvas = container!.querySelector('[data-mq-spatial="root"] canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    // the old banding source is gone from the CODE (comments aside)
    const src = readSrc("fullplayer/SpatialFullPlayer.tsx");
    expect(src.includes('filter: "blur(72px)')).toBe(false);
    expect(src.includes("SpatialBackdrop")).toBe(true);
    // small intrinsic size (tiny canvas → smooth upscale, no GPU banding)
    expect([canvas!.width, canvas!.height]).toEqual([144, 144]);
  });

  it("2b. source contract: no masking overlay was added — overlays unchanged", () => {
    const src = readSrc("fullplayer/SpatialFullPlayer.tsx");
    // the pre-existing dark overlay / vignette / readability layers remain
    // the ONLY overlays (no new banding mask was layered on top)
    expect(src.includes("rgba(6, 6, 10, 0.55)")).toBe(true);
    expect(src.includes("radial-gradient(118% 92%")).toBe(true);
    // the v10 preview highlight is a subtle directional gradient (not a mask)
    expect(src.includes('"to left" : "to right"')).toBe(true);
  });

  it("2c. center artwork stays a plain <img> — true square, never cropped", async () => {
    await mountSpatial();
    const centerCard = container!.querySelector('[data-mq-spatial-card="0"]');
    const img = centerCard?.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.className.includes("object-cover")).toBe(true);
  });
});

// ═══ 3 · MORE ACTIONS — full audited set, one menu, no duplicates ═══

describe("v10 More menu — audited action set", () => {
  afterEach(unmountSpatial);

  const MORE_ITEMS = [
    "Поделиться",
    "Копировать название",
    "Скачать",
    "К исполнителю",
    "Подписаться на артиста",
    "Добавить в очередь",
    "Добавить в плейлист",
  ];

  it("3a. More opens ONE menu with every audited action, no duplicates", async () => {
    await mountSpatial();
    await openMore();
    const menu = document.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    const text = menu!.textContent ?? "";
    for (const item of MORE_ITEMS) {
      expect(text.includes(item), `menu missing: ${item}`).toBe(true);
    }
    for (const item of MORE_ITEMS) {
      const count = (text.match(new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
      expect(count, `duplicated menu item: ${item} ×${count}`).toBe(1);
    }
    // Like/Dislike live on the rail — NOT duplicated in the menu
    expect(text.includes("Нравится")).toBe(false);
    expect(text.includes("Не нравится")).toBe(false);
    // Lyrics/Queue live on the control bar — not in the menu
    expect(text.includes("Текст песни")).toBe(false);
    expect(text.includes("Очередь")).toBe(false);
  });

  it("3b. Копировать название writes the title to the clipboard", async () => {
    const writes: string[] = [];
    const clip = { writeText: (t: string) => { writes.push(t); return Promise.resolve(); } };
    const desc = { value: clip, configurable: true, writable: true };
    Object.defineProperty(navigator, "clipboard", desc);
    try {
      await mountSpatial();
      await openMore();
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
        el.textContent?.includes("Копировать название"));
      expect(item).toBeTruthy();
      await act(async () => {
        item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(writes).toEqual(["Track b — Artist b"]);
    } finally {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    }
  });

  it("3c. Добавить в очередь inserts right after the current track", async () => {
    await mountSpatial();
    await openMore();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Добавить в очередь"));
    expect(item).toBeTruthy();
    await act(async () => {
      item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["a", "b", "b", "c", "d", "e", "f"]);
    expect(s.queueIndex).toBe(1); // playback position untouched
  });

  it("3d. Подписаться на артиста adds/removes the artist subscription", async () => {
    await mountSpatial();
    await openMore();
    const sub = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Подписаться на артиста"));
    expect(sub).toBeTruthy();
    await act(async () => {
      sub!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().favoriteArtists.map((a) => a.username)).toContain("Artist b");
    // and unsubscribes back
    await openMore();
    const unsub = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Отписаться от артиста"));
    expect(unsub).toBeTruthy();
    await act(async () => {
      unsub!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().favoriteArtists.map((a) => a.username)).not.toContain("Artist b");
  });

  it("3e. К исполнителю navigates and closes the player (same as before)", async () => {
    await mountSpatial();
    await openMore();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("К исполнителю"));
    expect(item).toBeTruthy();
    await act(async () => {
      item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().selectedArtist?.name).toBe("Artist b");
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(false);
  });

  it("3f. Добавить в плейлист opens the existing picker", async () => {
    await mountSpatial();
    await openMore();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Добавить в плейлист"));
    expect(item).toBeTruthy();
    await act(async () => {
      item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container!.querySelector('[data-mq-spatial="picker"]')).toBeTruthy();
  });

  it("3g. the menu order mirrors Classic (Трек → Поделиться / Копировать название / Скачать first)", async () => {
    await mountSpatial();
    await openMore();
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent ?? "");
    const iShare = items.findIndex((t) => t.includes("Поделиться"));
    const iCopy = items.findIndex((t) => t.includes("Копировать название"));
    const iDownload = items.findIndex((t) => t.includes("Скачать"));
    const iArtist = items.findIndex((t) => t.includes("К исполнителю"));
    const iQueue = items.findIndex((t) => t.includes("Добавить в очередь"));
    const iPlaylist = items.findIndex((t) => t.includes("Добавить в плейлист"));
    expect(iShare).toBeGreaterThanOrEqual(0);
    expect(iShare).toBeLessThan(iCopy);
    expect(iCopy).toBeLessThan(iDownload);
    expect(iDownload).toBeLessThan(iArtist);
    expect(iArtist).toBeLessThan(iQueue);
    expect(iQueue).toBeLessThan(iPlaylist);
  });
});

// ═══ 4 · MOBILE PLAYER MODE ═══

describe("v10 mobile player mode — normal mobile player", () => {
  afterEach(unmountSpatial);

  const mountMobile = async (state: StoreState = {}) => {
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    (window as unknown as { innerWidth: number }).innerWidth = 390;
    (window as unknown as { innerHeight: number }).innerHeight = 844;
    await mountSpatial(state);
    return async () => {
      (window as unknown as { innerWidth: number }).innerWidth = origW;
      (window as unknown as { innerHeight: number }).innerHeight = origH;
      await unmountSpatial();
    };
  };

  it("4a. mobile anatomy: artwork hero, identity row, progress, transport, secondary", async () => {
    const restore = await mountMobile();
    try {
      const root = container!.querySelector('[data-mq-spatial="root"]')!;
      expect(root.querySelector('[data-mq-spatial="mobile-artwork"]')).toBeTruthy();
      const identity = root.querySelector('[data-mq-spatial="mobile-identity"]')!;
      expect(identity.querySelector('button[aria-label="Нравится"]')).toBeTruthy();
      expect(identity.querySelector('button[aria-label="Не нравится"]')).toBeTruthy();
      const controls = root.querySelector('[data-mq-spatial="controls"]')!;
      expect(controls.querySelector('input[aria-label="Позиция воспроизведения"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label="Предыдущий трек"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label="Играть"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label="Следующий трек"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label="Текст песни"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label="Очередь"]')).toBeTruthy();
      expect(controls.querySelector('button[aria-label^="Громкость"]')).toBeTruthy();
    } finally {
      await restore();
    }
  });

  it("4b. like/dislike work from the identity row; dislike advances the queue", async () => {
    const restore = await mountMobile();
    try {
      await clickByLabel("Нравится");
      expect(useAppStore.getState().likedTrackIds).toContain("b");
      await clickByLabel("Не нравится");
      const s = useAppStore.getState();
      expect(s.dislikedTrackIds).toContain("b");
      expect(s.currentTrack?.id).toBe("c");
    } finally {
      await restore();
    }
  });

  it("4c. mobile More (header ⋯) has the SAME audited action set", async () => {
    const restore = await mountMobile();
    try {
      const more = container!.querySelector('header button[aria-label="Ещё"]');
      expect(more).toBeTruthy();
      await act(async () => {
        more!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 350, clientY: 40 }));
      });
      const menu = document.querySelector('[role="menu"]');
      expect(menu).toBeTruthy();
      const text = menu!.textContent ?? "";
      for (const item of ["Поделиться", "Копировать название", "Скачать", "К исполнителю", "Подписаться на артиста", "Добавить в очередь", "Добавить в плейлист"]) {
        expect(text.includes(item), `mobile menu missing: ${item}`).toBe(true);
      }
    } finally {
      await restore();
    }
  });

  it("4d. no hover-only UI on mobile: no carousel cards, no hover markers", async () => {
    const restore = await mountMobile();
    try {
      expect(container!.querySelectorAll("[data-mq-spatial-card]").length).toBe(0);
      expect(container!.querySelectorAll("[data-mq-hover]").length).toBe(0);
      // like the desktop hover markers, the desktop rail is absent too
      expect(container!.querySelector('[data-mq-spatial="action-rail"]')).toBeNull();
      // Left/Right setting does not break the mobile composition
      await act(async () => {
        useAppStore.getState().setSpatialActionsPosition("right");
      });
      expect(container!.querySelector('[data-mq-spatial="mobile-artwork"]')).toBeTruthy();
      expect(container!.querySelector('[data-mq-spatial="action-rail"]')).toBeNull();
    } finally {
      await restore();
    }
  });

  it("4e. progress + transport operate playback (seek commit / play / next)", async () => {
    const restore = await mountMobile();
    try {
      await clickByLabel("Играть");
      expect(useAppStore.getState().isPlaying).toBe(true);
      await clickByLabel("Следующий трек");
      expect(useAppStore.getState().currentTrack?.id).toBe("c");
      await clickByLabel("Предыдущий трек");
      expect(useAppStore.getState().currentTrack?.id).toBe("b");
    } finally {
      await restore();
    }
  });
});

// ═══ 5 · CLASSIC / PERSISTENCE CONTRACTS ═══

describe("v10 — Classic & persistence contracts", () => {
  it("5a. Classic mobile player is untouched (source contract)", () => {
    const src = readSrc("FullTrackViewMobile.tsx");
    expect(src.includes("mq-ft-anim")).toBe(true);
    expect(src.includes("requestClose")).toBe(true);
    expect(src.includes("handleCoverTouchEnd")).toBe(true);
    // Classic keeps its own like wiring and no spatial markers
    expect(src.includes("toggleLike(")).toBe(true);
    expect(src.includes("data-mq-spatial")).toBe(false);
  });

  it("5b. Classic desktop More keeps its own action set (no spatial leakage)", () => {
    const src = readSrc("FullTrackView.tsx");
    expect(src.includes("Копировать название")).toBe(true);
    expect(src.includes("Скачать")).toBe(true);
    expect(src.includes("Эквалайзер")).toBe(true);
    expect(src.includes("data-mq-spatial")).toBe(false);
  });

  it("5c. mode + position persist and rehydrate (reload simulation)", async () => {
    useAppStore.setState({
      fullPlayerMode: "spatial",
      spatialActionsPosition: "right",
      currentTrack: QUEUE[1],
      queue: [...QUEUE],
      queueIndex: 1,
    } as StoreState);
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().fullPlayerMode).toBe("spatial");
    expect(useAppStore.getState().spatialActionsPosition).toBe("right");
    // classic choice survives too
    useAppStore.getState().setFullPlayerMode("classic");
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().fullPlayerMode).toBe("classic");
    useAppStore.getState().setFullPlayerMode("spatial");
  });

  it("5d. Settings states the Left/Right setting applies to the desktop player", () => {
    const src = readSrc("SettingsView.tsx");
    expect(src.includes("Применяется к плееру на компьютере")).toBe(true);
    expect(src.includes("Расположение дополнительных действий")).toBe(true);
    expect(src.includes('data-mq-setting="spatial-actions-position"')).toBe(true);
  });
});
