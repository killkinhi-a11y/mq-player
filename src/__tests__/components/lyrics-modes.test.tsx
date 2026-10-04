/**
 * LyricsView modes + FullscreenLyrics (spec §2 / §11 / §12):
 * panel/fullscreen/focus switching, portal overlay, error normalization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));
vi.mock("@/lib/wasm-audio", () => ({
  currentPlaybackPosition: vi.fn(() => 12),
  seekPlayback: vi.fn(),
}));

import { LyricsView } from "@/components/mq/LyricsView";
import type { LyricLine } from "@/lib/lyrics/types";
import { useAppStore } from "@/store/useAppStore";

const LINES: LyricLine[] = [
  { text: "первая", startMs: 0, endMs: 5000 },
  { text: "вторая", startMs: 5000, endMs: 10000 },
  { text: "третья", startMs: 10000, endMs: 18000 },
];

describe("LyricsView — modes & normalized errors", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // jsdom lacks scrollTo (LiquidLyrics auto-scroll target).
    Element.prototype.scrollTo = Element.prototype.scrollTo || ((): void => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  function render(props: Partial<React.ComponentProps<typeof LyricsView>> = {}) {
    return act(async () => {
      root.render(
        <LyricsView
          lines={LINES}
          plainText=""
          currentTime={12}
          isLoading={false}
          error={null}
          onSeek={() => {}}
          duration={18}
          trackTitle="Песня"
          trackArtist="Артист"
          {...props}
        />,
      );
    });
  }

  it("panel mode renders the synced lyrics + the fullscreen toggle", async () => {
    await render();
    expect(container.textContent).toContain("Текст песни");
    expect(container.textContent).toContain("Synced");
    const expand = container.querySelector('button[aria-label="Текст песни на весь экран"]');
    expect(expand).not.toBeNull();
    // Synced lines rendered as focusable buttons (keyboard reachable).
    const lineBtns = container.querySelectorAll(".ll-line");
    expect(lineBtns.length).toBe(3);
  });

  it("fullscreen button opens the portal stage with mode=fullscreen", async () => {
    await render();
    const expand = container.querySelector('button[aria-label="Текст песни на весь экран"]') as HTMLButtonElement;
    await act(async () => {
      expand.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const stage = document.querySelector("[data-mq-fullscreen-lyrics]") as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.getAttribute("data-mode")).toBe("fullscreen");
    expect(stage.getAttribute("role")).toBe("dialog");
    // Header carries the track identity.
    expect(stage.textContent).toContain("Песня");
    expect(stage.textContent).toContain("Артист");
    // Minimal transport present.
    expect(stage.querySelector('button[aria-label="Пауза"], button[aria-label="Воспроизвести"]')).not.toBeNull();
  });

  it("focus toggle switches the stage to focus mode (spotlight)", async () => {
    await render();
    const expand = container.querySelector('button[aria-label="Текст песни на весь экран"]') as HTMLButtonElement;
    await act(async () => {
      expand.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const stage = document.querySelector("[data-mq-fullscreen-lyrics]") as HTMLElement;
    const focusBtn = stage.querySelector('button[aria-label="Режим фокуса"]') as HTMLButtonElement;
    expect(focusBtn).not.toBeNull();
    await act(async () => {
      focusBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const stage2 = document.querySelector("[data-mq-fullscreen-lyrics]") as HTMLElement;
    expect(stage2.getAttribute("data-mode")).toBe("focus");
    expect(focusBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape closes the stage (layered dismissal)", async () => {
    // Deterministic exit: zero-duration transitions via the store kill-switch.
    useAppStore.setState({ reduceMotion: true });
    await render();
    const expand = container.querySelector('button[aria-label="Текст песни на весь экран"]') as HTMLButtonElement;
    await act(async () => {
      expand.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector("[data-mq-fullscreen-lyrics]")).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // AnimatePresence exit is async — allow the exit transition to settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(document.querySelector("[data-mq-fullscreen-lyrics]")).toBeNull();
  });

  it("normalized error codes map to human messages (never raw errors)", async () => {
    await render({ lines: [], error: "provider_unavailable" });
    expect(container.textContent).toContain("Сервис текстов недоступен");
    expect(container.querySelector("button")?.textContent).toContain("Попробовать снова");
  });

  it("plain lyrics render as readable text (never a fake sync)", async () => {
    await render({ lines: [], plainText: "строка одна\nстрока две" });
    const text = container.textContent ?? "";
    expect(text).toContain("строка одна");
    expect(container.querySelector(".ll-line")).toBeNull(); // no fake synced lines
  });

  it("loading state shows the skeleton, not an error", async () => {
    await render({ isLoading: true });
    expect(container.querySelector(".mq-shimmer")).not.toBeNull();
  });
});
