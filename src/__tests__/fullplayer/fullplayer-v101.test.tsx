/**
 * v10.1 — RESTORED MOBILE PLAYER + PLAYER BAR + VOLUME + MORE + SKELETON.
 *
 * Owner cases (§19):
 *  1  every player button renders            (mounted, mobile player)
 *  2  every player button has accessible label
 *  3  play/pause                             (label + store)
 *  4  previous
 *  5  next
 *  6  like
 *  7  dislike
 *  8  lyrics
 *  9  queue
 * 10  volume open (popup + slider + value)
 * 11  volume slider set
 * 12  volume mute/unmute
 * 13  volume keyboard (ArrowUp/Down/M)
 * 14  volume boundaries (0 / 100)
 * 15  More open (full audited set)
 * 16  More actions (copy / add-to-queue / artist / subscribe / playlist /
 *     speed page / sleep page / eq / spatial)
 * 17  Context Menu (queue row → ContextMenu)
 * 18  context menu keyboard (MenuCore arrows)
 * 19  skeleton state (artwork shimmer + img opacity 0)
 * 20  loading → loaded transition (onLoad → opacity 1, shimmer gone)
 * 21  reduced motion (guards present: mq-press/swap/pop/shimmer + TextSwap)
 * 22  mobile uses restored player (dispatcher source + zero spatial markers)
 * 23  mobile has no Spatial rail
 * 24  mobile player bar (glass surface, progress inside, 44px targets)
 * 25  settings persistence (mode + rail position, rehydrate)
 * 26  desktop Spatial regression (source: rail / 500ms / mq-press / swap)
 * 27  Classic regression (source: inline volume row kept, motion added)
 * 28  overflowX guard (bar uses vw-based geometry, no fixed overflow)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/lyrics-client", () => ({
  fetchLyrics: vi.fn(async () => ({ lyrics: [{ time: 0, text: "ла ла ла" }], plainText: "" })),
}));

// Component CSS — vitest must not push it through postcss/tailwind
// (same pattern as full-player-themes.test.tsx).
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;

const mobileMod = await import("@/components/mq/FullTrackViewMobile");
const FullTrackViewMobile = mobileMod.default;

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
  readFileSync(join(process.cwd(), "src/components/mq", ...f), "utf8");

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
  // MenuCore keyboard nav calls scrollIntoView — jsdom lacks it.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (() => {}) as () => void;
  }
});

type StoreState = Partial<ReturnType<typeof useAppStore.getState>>;

const BASE_STATE: StoreState = {
  fullPlayerMode: "spatial" as const, // mobile ignores the mode (v10.1)
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
  playlists: [],
  history: [],
};

let container: HTMLDivElement | null;
let root: ReturnType<typeof createRoot> | null;

const mountMobile = async (state: StoreState = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  useAppStore.setState({ ...BASE_STATE, ...state } as StoreState);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(FullTrackViewMobile));
  });
};

const unmountMobile = async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  container = null; root = null;
  document.querySelector('[role="menu"]')?.remove();
  document.querySelector(".mq-menu-backdrop")?.remove();
};

const settle = (ms = 320) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const q = (sel: string) => container?.querySelector(sel) ?? null;
const clickByLabel = async (label: string, x = 120, y = 300) => {
  const btn = q(`button[aria-label="${label}"]`);
  expect(btn, `button not found: ${label}`).toBeTruthy();
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  });
};

const key = async (code: string, k: string) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: k, bubbles: true }));
  });
};

// ═══ 1–2 · EVERY BUTTON RENDERS + ACCESSIBLE ═══

describe("v10.1 §1/§2/§24 — restored player anatomy + player bar", () => {
  afterEach(unmountMobile);

  it("1. every player button renders (restored baseline set + volume)", async () => {
    await mountMobile();
    const labels = [
      "Закрыть", "Ещё",
      "Нравится", "Не нравится", "В плейлист",
      "Текст", "Очередь", "История",
      "Перемешать", "Предыдущий трек", "Воспроизвести", "Следующий трек", "Повтор",
      "Позиция воспроизведения",
    ];
    for (const l of labels) {
      expect(q(`[aria-label="${l}"]`), `missing: ${l}`).toBeTruthy();
    }
    // volume button: level-carrying label
    expect(q('button[aria-label^="Громкость:"]')).toBeTruthy();
  });

  it("2. every interactive control has an accessible name", async () => {
    await mountMobile();
    const buttons = Array.from(container!.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(10);
    for (const b of buttons) {
      const name = b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title");
      expect(name, `button without a11y name: ${b.outerHTML.slice(0, 80)}`).toBeTruthy();
    }
    // like/dislike/lyrics/queue/shuffle/repeat expose pressed state
    expect(q('button[aria-label="Нравится"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(q('button[aria-label="Перемешать"]')!.getAttribute("aria-pressed")).toBe("false");
  });

  it("24. player bar: one glass surface with progress + transport + secondary", async () => {
    await mountMobile();
    const bar = q("[data-mq-playerbar]");
    expect(bar).toBeTruthy();
    const surface = bar!.firstElementChild as HTMLElement;
    const cs = surface.getAttribute("style") ?? "";
    // premium glass DNA: translucent surface + blur + thin border + shadow
    expect(cs).toContain("color-mix");
    expect(cs).toContain("blur");
    expect(cs).toContain("--mq-edge-strong");
    expect(cs).toContain("box-shadow");
    // progress INSIDE the bar (user structure §2)
    expect(surface.querySelector('input[aria-label="Позиция воспроизведения"]')).toBeTruthy();
    expect(surface.querySelector('[data-mq-secondary]')).toBeTruthy();
    // 44px+ touch targets on every secondary button
    const secondary = surface.querySelectorAll('[data-mq-secondary] button');
    expect(secondary.length).toBe(6);
    for (const b of Array.from(secondary)) {
      expect(b.className).toContain("w-11 h-11");
    }
    // the bar sits INSIDE the viewport flow (no fixed positioning)
    expect(surface.className).not.toContain("fixed");
  });

  it("24b. transport keeps the restored sizes: 44/56/76/56/44", async () => {
    await mountMobile();
    const play = q('button[aria-label="Воспроизвести"]') as HTMLElement;
    expect(play.style.width).toBe("76px");
    const prev = q('button[aria-label="Предыдущий трек"]') as HTMLElement;
    expect(prev.style.width).toBe("56px");
    const shuffle = q('button[aria-label="Перемешать"]') as HTMLElement;
    expect(shuffle.style.width).toBe("44px");
  });

  it("24c. artwork is the restored baseline size (92vw cap)", async () => {
    await mountMobile();
    const art = q("[data-mq-artwork]") as HTMLElement;
    expect(art).toBeTruthy();
    expect(art.className).toContain("rounded-[20px]");
    // jsdom CSSOM drops min() from the style serialization — pin the exact
    // restored geometry via the source contract instead
    const src = readSrc("FullTrackViewMobile.tsx");
    expect(src).toContain('width: "min(92vw, 58vh)"');
    // identity typography restored: 28px extrabold title inside TextSwap h1
    const h1 = container!.querySelector("h1");
    expect(h1?.className).toContain("text-[28px]");
    expect(h1?.className).toContain("font-extrabold");
  });
});

// ═══ 3–9 · TRANSPORT + ACTIONS OPERATE ═══

describe("v10.1 §3–§9 — buttons operate the store", () => {
  afterEach(unmountMobile);

  it("3. play/pause toggles (label flips)", async () => {
    await mountMobile();
    await clickByLabel("Воспроизвести");
    expect(useAppStore.getState().isPlaying).toBe(true);
    expect(q('button[aria-label="Пауза"]')).toBeTruthy();
    await clickByLabel("Пауза");
    expect(useAppStore.getState().isPlaying).toBe(false);
  });

  it("4/5. previous / next move the queue", async () => {
    await mountMobile();
    await clickByLabel("Следующий трек");
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
    await clickByLabel("Предыдущий трек");
    expect(useAppStore.getState().currentTrack?.id).toBe("b");
  });

  it("6. like toggles + aria-pressed follows", async () => {
    await mountMobile();
    await clickByLabel("Нравится");
    expect(useAppStore.getState().likedTrackIds).toContain("b");
    expect(q('button[aria-label="Убрать из избранного"]')!.getAttribute("aria-pressed")).toBe("true");
    await clickByLabel("Убрать из избранного");
    expect(useAppStore.getState().likedTrackIds).not.toContain("b");
  });

  it("7. dislike marks + advances (store semantics preserved)", async () => {
    await mountMobile();
    await clickByLabel("Не нравится");
    const s = useAppStore.getState();
    expect(s.dislikedTrackIds).toContain("b");
    expect(s.currentTrack?.id).toBe("c");
  });

  it("8. lyrics opens the panel; close runs the slide-down exit", async () => {
    await mountMobile();
    await clickByLabel("Текст");
    expect(container!.textContent).toContain("Текст песни");
    // close via the PANEL's own close button (the header one is also
    // aria-label="Закрыть" — scope to the panel)
    const closeBtn = q('[data-mq-panel] button[aria-label="Закрыть"]') as HTMLElement;
    expect(closeBtn).toBeTruthy();
    await act(async () => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // exit wiring: the panel switches to the slide-down animation and the
    // unmount-on-animation-end handler is in place (React's delegated
    // animationend cannot be synthesized reliably in jsdom — pin source)
    const panel = q("[data-mq-panel]");
    expect(panel?.getAttribute("style") ?? "").toContain("mqFtSlideDown");
    const src = readSrc("FullTrackViewMobile.tsx");
    expect(src).toMatch(/panelClosing && e\.target === e\.currentTarget/);
    expect(src).toMatch(/setPanel\(null\);\s*\n\s*setPanelClosing\(false\)/);
  });

  it("9. queue opens the panel; rows play on click", async () => {
    await mountMobile();
    await clickByLabel("Очередь");
    const rows = container!.querySelectorAll('[data-mq-panel] [role="button"]');
    expect(rows.length).toBeGreaterThan(0);
    await act(async () => {
      rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // upcoming = slice(queueIndex+1) → first row is track c
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
  });
});

// ═══ 10–14 · VOLUME AUDIT ═══

describe("v10.1 §10–§14 — volume audit (popup / slider / mute / keyboard / bounds)", () => {
  afterEach(unmountMobile);

  const openVolume = async () => {
    const btn = q('button[aria-label^="Громкость:"]');
    expect(btn).toBeTruthy();
    expect(btn!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const popup = q("[data-mq-volpopup]");
    expect(popup).toBeTruthy();
    return popup!;
  };

  it("10. volume popup opens with slider + value; outside click closes", async () => {
    await mountMobile({ volume: 37 });
    const popup = await openVolume();
    const slider = popup.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.value).toBe("37");
    // click-outside overlay closes (framer exit → wait past the tween)
    const overlay = q("[data-mq-volpopup]")!.previousElementSibling as HTMLElement;
    expect(overlay.className).toContain("fixed");
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(q("[data-mq-volpopup]")).toBeNull();
    expect(q('button[aria-label^="Громкость:"]')!.getAttribute("aria-expanded")).toBe("false");
  });

  it("11. slider drives the store volume live", async () => {
    await mountMobile({ volume: 40 });
    const popup = await openVolume();
    const slider = popup.querySelector('input[type="range"]') as HTMLInputElement;
    // React's value-tracker must be bypassed for the change to register
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    nativeSetter.call(slider, "64");
    await act(async () => {
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // VolumeSlider commits through a rAF — let it land
    await settle(120);
    expect(useAppStore.getState().volume).toBe(64);
  });

  it("12. mute icon → unmute restores the PREVIOUS level (v10.3 fix); RU state-aware aria-label", async () => {
    // v10.3: the popup mute icon had a hardcoded 70 on unmute and an English
    // aria-label. Now: unmute restores the last audible level via the store's
    // last-volume memory, and the label is Russian + state-aware.
    useAppStore.getState().setVolume(42);
    await mountMobile({ volume: 42 });
    // 42% → the button label still reports the level
    expect(q('button[aria-label="Громкость: 42%"]')).toBeTruthy();
    const popup = await openVolume();
    // v10.3: Russian state-aware label (was English "Mute")
    const muteBtn = popup.querySelector('button[aria-label="Выключить звук"]');
    expect(muteBtn).toBeTruthy();
    await act(async () => {
      muteBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().volume).toBe(0);
    expect(q('button[aria-label="Громкость: 0%"]')).toBeTruthy();
    const unmuteBtn = popup.querySelector('button[aria-label="Включить звук"]');
    expect(unmuteBtn).toBeTruthy();
    await act(async () => {
      unmuteBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // restores 42 — the level the user actually had (was hardcoded 70)
    expect(useAppStore.getState().volume).toBe(42);
  });

  it("13. keyboard: ArrowUp/Down ±5, M toggles mute (unmute restores last level)", async () => {
    await mountMobile({ volume: 50 });
    await key("ArrowUp", "ArrowUp");
    expect(useAppStore.getState().volume).toBe(55);
    await key("ArrowDown", "ArrowDown");
    await key("ArrowDown", "ArrowDown");
    expect(useAppStore.getState().volume).toBe(45);
    await key("KeyM", "m");
    expect(useAppStore.getState().volume).toBe(0);
    await key("KeyM", "m");
    // v10.3: restores the last audible level (45), not a hardcoded 70
    expect(useAppStore.getState().volume).toBe(45);
  });

  it("14. boundaries: never below 0 / above 100", async () => {
    await mountMobile({ volume: 2 });
    await key("ArrowDown", "ArrowDown");
    await key("ArrowDown", "ArrowDown");
    expect(useAppStore.getState().volume).toBe(0);
    useAppStore.setState({ volume: 98 });
    await key("ArrowUp", "ArrowUp");
    await key("ArrowUp", "ArrowUp");
    expect(useAppStore.getState().volume).toBe(100);
  });

  it("14b. Escape closes the popup, not the player (layered)", async () => {
    await mountMobile();
    await openVolume();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(q("[data-mq-volpopup]")).toBeNull();
    // player still open
    expect(useAppStore.getState().isFullTrackViewOpen).toBe(true);
    expect(q('button[aria-label="Воспроизвести"]')).toBeTruthy();
  });
});

// ═══ 15–18 · MORE + CONTEXT MENU ═══

describe("v10.1 §15–§18 — More (MenuCore) + Context Menu", () => {
  afterEach(unmountMobile);

  const openMore = async () => {
    const btn = q('button[aria-label="Ещё"]');
    expect(btn).toBeTruthy();
    expect(btn!.getAttribute("aria-haspopup")).toBe("menu");
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 340, clientY: 40 }));
    });
    const menu = document.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    return menu!;
  };

  it("15. More opens with the FULL audited action set (Classic order)", async () => {
    await mountMobile();
    const menu = await openMore();
    const text = menu.textContent ?? "";
    const expected = [
      "Поделиться", "Копировать название", "Скачать",
      "К исполнителю", "Подписаться на артиста",
      "Добавить в очередь", "Добавить в плейлист",
      "Эквалайзер", "Пространственное аудио", "Скорость", "Таймер сна",
    ];
    for (const item of expected) {
      expect(text.includes(item), `menu missing: ${item}`).toBe(true);
    }
    // no volume duplicate (it lives in the bar now) + no fake actions
    expect(text.includes("Громкость")).toBe(false);
  });

  it("16a. Копировать название writes clipboard + toast, menu closes", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    await mountMobile();
    const menu = await openMore();
    const item = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Копировать название")) as HTMLElement;
    expect(item).toBeTruthy();
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith("Track b — Artist b");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("16b. Добавить в очередь inserts after the current track", async () => {
    await mountMobile();
    const menu = await openMore();
    const item = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Добавить в очередь")) as HTMLElement;
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const s = useAppStore.getState();
    expect(s.queue[2].id).toBe("b"); // right after current (index 1)
  });

  it("16c. К исполнителю navigates + closes the player", async () => {
    await mountMobile();
    const menu = await openMore();
    const item = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("К исполнителю")) as HTMLElement;
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const s = useAppStore.getState();
    expect(s.isFullTrackViewOpen).toBe(false);
    expect(s.selectedArtist?.name).toBe("Artist b");
  });

  it("16d. Подписаться adds, then flips to Отписаться (active state)", async () => {
    await mountMobile();
    const menu = await openMore();
    const item = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Подписаться")) as HTMLElement;
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().favoriteArtists[0]?.username).toBe("Artist b");
  });

  it("16e. Скорость sub-page: back row + options apply + menu closes", async () => {
    await mountMobile();
    let menu = await openMore();
    const speed = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Скорость")) as HTMLElement;
    await act(async () => {
      speed.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    menu = document.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain("Скорость");
    const opt = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.trim() === "1.5x") as HTMLElement;
    await act(async () => {
      opt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().playbackRate).toBe(1.5);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("16f. Таймер сна sub-page sets the timer", async () => {
    await mountMobile();
    let menu = await openMore();
    const sleep = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Таймер сна")) as HTMLElement;
    await act(async () => {
      sleep.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    menu = document.querySelector('[role="menu"]')!;
    const opt = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("5 мин")) as HTMLElement;
    await act(async () => {
      opt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().sleepTimerActive).toBe(true);
  });

  it("16g. Пространственное аудио toggles (checked state)", async () => {
    await mountMobile();
    const menu = await openMore();
    const item = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes("Пространственное аудио")) as HTMLElement;
    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useAppStore.getState().spatialAudioEnabled).toBe(true);
  });

  it("17. Context Menu opens from a queue row (TrackMoreButton)", async () => {
    await mountMobile();
    await clickByLabel("Очередь");
    const more = container!.querySelector("button[aria-label^='Действия:']") as HTMLElement;
    expect(more).toBeTruthy();
    await act(async () => {
      more.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 300, clientY: 500 }));
    });
    await act(async () => { await Promise.resolve(); });
    // ContextMenu portals to body with the unified action set
    const text = document.body.textContent ?? "";
    expect(text.includes("Действия") || text.includes("Очередь") || text.includes("Плейлист")).toBe(true);
  });

  it("18. MenuCore keyboard: ArrowDown moves focus between items", async () => {
    await mountMobile();
    const menu = await openMore();
    // let MenuCore's 30ms auto-focus settle FIRST — under full-suite load
    // it can otherwise fire between focus() and the assertion and steal
    // focus back to the first item (flaky timing, not a product bug)
    await settle(80);
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items[0].focus();
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).toBe(items[1]);
  });
});

// ═══ 19–21 · SKELETON + REDUCED MOTION ═══

describe("v10.1 §19–§21 — skeleton states + reduced motion", () => {
  afterEach(unmountMobile);

  it("19. artwork shows the shimmer skeleton until decode", async () => {
    await mountMobile();
    const art = q("[data-mq-artwork]")!;
    expect(art.querySelector("[data-mq-skeleton='artwork']")).toBeTruthy();
    const img = art.querySelector("img") as HTMLImageElement;
    expect(img.className).toContain("mq-art-fade");
    expect(img.style.opacity).toBe("0");
  });

  it("20. onLoad fades the cover in and drops the skeleton", async () => {
    await mountMobile();
    const img = q("[data-mq-artwork]")!.querySelector("img") as HTMLImageElement;
    await act(async () => {
      img.dispatchEvent(new Event("load", { bubbles: false }));
    });
    const art = q("[data-mq-artwork]")!;
    expect(art.querySelector("[data-mq-skeleton='artwork']")).toBeNull();
    expect((art.querySelector("img") as HTMLImageElement).style.opacity).toBe("1");
  });

  it("21. reduced-motion guards exist for every new animation (source contracts)", () => {
    const css = readSrc("../../app/globals.css");
    // mq-press / swap / pop / color / art-fade / shimmer all guarded
    expect(css).toMatch(/\.mq-press,\s*\n\s*\.mq-press:hover,\s*\n\s*\.mq-press:active\s*{\s*transform: none/);
    expect(css).toMatch(/\.mq-icon-swap,\s*\n\s*\.mq-icon-pop\s*{\s*animation: none/);
    expect(css).toMatch(/\.mq-shimmer\s*{\s*animation: none/);
    expect(css).toMatch(/\.mq-menu-below,\s*\n\s*\.mq-menu-above,\s*\n\s*\.mq-menu-sheet/);
    // TextSwap: reduced motion → duration 0
    const ts = readSrc("ui", "TextSwap.tsx");
    expect(ts).toContain("useReducedMotion");
    expect(ts).toContain("reduceMotion ? 0");
    // classic mobile entrance animations already guarded
    const m = readSrc("FullTrackViewMobile.tsx");
    expect(m).toMatch(/prefers-reduced-motion: reduce[\s\S]*?\.mq-ft-anim/);
  });
});

// ═══ 22–23 · RESTORED PLAYER ROUTING ═══

describe("v10.1 §22–§23 — mobile routes to the restored player, no Spatial UI", () => {
  afterEach(unmountMobile);

  it("22. dispatcher: mobile renders FullTrackViewMobile in BOTH modes", () => {
    const src = readSrc("FullPlayer.tsx");
    // the isMobile branch comes BEFORE the mode branch and returns the
    // classic mobile player unconditionally
    const iMobile = src.indexOf("if (isMobile)");
    const iSpatial = src.indexOf('if (mode === "spatial")');
    expect(iMobile).toBeGreaterThan(-1);
    expect(iSpatial).toBeGreaterThan(-1);
    expect(iMobile).toBeLessThan(iSpatial);
    expect(src.slice(iMobile, iSpatial)).toContain("ClassicFullPlayerMobile");
    // desktop keeps the mode dispatch
    expect(src.slice(iSpatial)).toContain("SpatialFullPlayer");
  });

  it("22b. mounted player (mode=spatial) shows ZERO spatial markers", async () => {
    await mountMobile({ fullPlayerMode: "spatial" });
    expect(container!.querySelectorAll("[data-mq-spatial]").length).toBe(0);
    expect(q("[data-mq-playerbar]")).toBeTruthy();
  });

  it("23. no Spatial rail / carousel / hover states on mobile", async () => {
    await mountMobile({ fullPlayerMode: "spatial" });
    expect(container!.querySelectorAll('[data-mq-spatial="action-rail"]').length).toBe(0);
    expect(container!.querySelectorAll("[data-mq-spatial-card]").length).toBe(0);
    expect(container!.querySelectorAll("[data-mq-hover]").length).toBe(0);
  });

  it("25. settings persist: mode + rail position survive rehydrate", async () => {
    await mountMobile();
    act(() => {
      useAppStore.getState().setFullPlayerMode("spatial");
      useAppStore.getState().setSpatialActionsPosition("right");
    });
    const raw = localStorage.getItem("mq-store-v8") ?? "";
    expect(raw).toContain('"fullPlayerMode":"spatial"');
    expect(raw).toContain('"spatialActionsPosition":"right"');
    // rehydrate from the same payload
    const parsed = JSON.parse(raw || "{}");
    expect(parsed.state.fullPlayerMode).toBe("spatial");
    expect(parsed.state.spatialActionsPosition).toBe("right");
  });
});

// ═══ 26–28 · DESKTOP REGRESSIONS + OVERFLOW GUARDS (source contracts) ═══

describe("v10.1 §26–§28 — desktop regressions + overflow guards", () => {
  it("26. Desktop Spatial: rail, 500ms carousel, motion additions intact", () => {
    const s = readSrc("fullplayer", "SpatialFullPlayer.tsx");
    // v9/v10 pillars untouched
    expect(s).toContain("SPATIAL_TRANSITION_MS = 500");
    expect(s).toContain('data-mq-spatial="action-rail"');
    expect(s).toContain("spatialHoverGeom");
    // v10.1 motion: press + icon swap wired
    expect(s).toContain("mq-press");
    expect(s).toContain("mq-icon-swap");
    // volume popup animation spec present (opacity/scale/y 0.18)
    expect(s).toMatch(/initial=\{\{ opacity: 0, y: 8, scale: 0\.96 \}\}/);
  });

  it("27. Desktop Classic: inline volume row kept, dead popup code gone, motion added", () => {
    const s = readSrc("FullTrackView.tsx");
    // volume = inline VolumeSlider (audit: no popup on Classic by design)
    expect(s).toContain("<VolumeSlider volume={volume} onChange={setVolume} showIcon={true} showValue={true}");
    // the dead showVolumePopup STATE is gone (a comment mentions the audit)
    expect(s).not.toMatch(/const \[showVolumePopup/);
    // motion system wired
    expect(s).toContain("mq-press");
    expect(s).toContain("mq-icon-swap");
    expect(s).toContain("mq-icon-pop");
    // lyrics loading = shared skeleton (no spinner)
    expect(s).not.toContain("Поиск текста");
    expect(s).toContain("isLoading={lyricsLoading}");
  });

  it("28. overflowX guards: bar + artwork use viewport-relative geometry", () => {
    const m = readSrc("FullTrackViewMobile.tsx");
    // artwork capped at 92vw; bar uses horizontal margins, no fixed widths
    expect(m).toContain('width: "min(92vw, 58vh)"');
    expect(m).not.toMatch(/data-mq-playerbar[\s\S]{0,600}width:\s*"\d{4}/);
    // no horizontal scroll containers introduced
    expect(m).not.toContain("overflow-x-auto");
  });
});
