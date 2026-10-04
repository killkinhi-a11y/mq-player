/**
 * WaveformView — component contract tests.
 *
 * Canvas 2D is NOT implemented in jsdom (draw() no-ops safely — that's part
 * of the contract under test: the component must never crash without a 2D
 * context). Interaction math is driven through patched getBoundingClientRect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { createPortal } from "react-dom";

vi.mock("@/lib/wasm-audio", () => ({
  currentPlaybackPosition: vi.fn(() => 30),
  seekPlayback: vi.fn(),
}));
vi.mock("@/lib/waveform/useWaveform", () => ({
  useWaveform: vi.fn(() => ({
    status: "ready",
    data: {
      key: "t1|180|v1",
      trackId: "t1",
      version: 1,
      fingerprint: "180",
      bucketCount: 1080,
      durationSec: 180,
      peaks: new Float32Array(1080).fill(0.6),
      coverage: 1,
      complete: true,
      updatedAt: 1,
    },
    reload: vi.fn(),
  })),
}));
vi.mock("@/lib/waveform/liveSampler", () => ({
  getLiveSampled: vi.fn(() => null),
}));

import { WaveformView } from "@/components/mq/WaveformView";
import { currentPlaybackPosition } from "@/lib/wasm-audio";

const T = {
  id: "demo-1", title: "Demo", artist: "A", album: "", duration: 180, cover: "",
  genre: "", audioUrl: "/demo/song1.mp3", source: "demo" as const,
};

const RECT = { left: 0, top: 0, width: 200, height: 52, right: 200, bottom: 52, x: 0, y: 0, toJSON: () => ({}) };

describe("WaveformView — render + a11y", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const origRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () => RECT as DOMRect;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = origRect;
    act(() => root.unmount());
    container.remove();
  });

  it("renders a canvas slider with correct ARIA (role, min/max, label)", async () => {
    await act(async () => {
      root.render(<WaveformView track={T} duration={180} />);
    });
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("role")).toBe("slider");
    expect(canvas.getAttribute("aria-label")).toContain("Позиция воспроизведения");
    expect(canvas.getAttribute("aria-valuemin")).toBe("0");
    expect(canvas.getAttribute("aria-valuemax")).toBe("180");
    expect(canvas.getAttribute("tabIndex")).toBe("0");
    // Data status reflects the (mocked) complete waveform.
    expect(container.querySelector("[data-mq-waveform]")!.getAttribute("data-status")).toBe("ready");
    // jsdom has no 2D context — the component must NOT crash on that.
  });

  it("reports live value text (current / total) without per-frame renders", async () => {
    await act(async () => {
      root.render(<WaveformView track={T} duration={180} />);
    });
    // ariaNow refreshes on a ~250 ms interval (NOT per frame) — let one tick land.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    const now = canvas.getAttribute("aria-valuenow");
    expect(now).toBe("30"); // from the mocked audio clock
    expect(canvas.getAttribute("aria-valuetext")).toContain("0:30");
  });
});

describe("WaveformView — interactions", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const origRect = Element.prototype.getBoundingClientRect;
  let seekCalls: number[] = [];

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () => RECT as DOMRect;
    seekCalls = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = origRect;
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    return act(async () => {
      root.render(
        <WaveformView
          track={T}
          duration={180}
          onSeek={(t) => seekCalls.push(t)}
        />,
      );
    });
  }

  it("click-to-seek maps x → time through the track duration", async () => {
    await render();
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    // 200px wide track of 180s: click at x=100 → 90s.
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, bubbles: true }));
    });
    expect(seekCalls).toEqual([90]);
  });

  it("drag-to-seek commits ONCE on release (scrub preview, no spam)", async () => {
    await render();
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 20, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: 60, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, bubbles: true }));
    });
    expect(seekCalls).toHaveLength(1); // committed once — no seek spam
    expect(seekCalls[0]).toBeCloseTo((140 / 200) * 180, 6);
  });

  it("keyboard: arrows seek ±5s, Home/End jump (slider semantics)", async () => {
    await render();
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    // The canvas owns arrows via a WINDOW-CAPTURE listener while focused.
    const key = (k: string) =>
      act(async () => {
        canvas.focus();
        canvas.dispatchEvent(
          new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
        );
      });
    await key("ArrowRight"); // 30 + 5
    await key("ArrowLeft");  // 30 - 5
    await key("Home");       // 0
    await key("End");        // 180
    expect(seekCalls).toEqual([35, 25, 0, 180]);
  });

  it("clamps seeks into [0, duration] (no out-of-range positions)", async () => {
    await render();
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: -50, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: -50, bubbles: true }));
    });
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 9999, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: 9999, bubbles: true }));
    });
    expect(seekCalls).toEqual([0, 180]);
  });

  // ── v11 regression: double keyboard seek ──────────────────────────────
  // Root cause of the live +10/+11 double seek: a stale build still ran the
  // OLD React onKeyDown handler (no native stopPropagation), so the event
  // ALSO reached the player-level window-bubble handlers (FullTrackView /
  // SpatialFullPlayer ±5) and the global ±10 shortcut — two owners at once.
  // The architectural rule: EXACTLY ONE owner of keyboard seek per context.
  // While the canvas is focused, the waveform's WINDOW-CAPTURE listener owns
  // the key and stopPropagation keeps every other handler out; unfocused, it
  // stays silent so the player-level handler keeps its ownership.
  it("keyboard seek is SINGLE-OWNER: focused canvas stops propagation, player-level handlers never double-seek", async () => {
    await render();
    const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;

    // Mimic the player-level owners: window BUBBLE listeners that also seek
    // on ArrowRight (exactly how FullTrackView/SpatialFullPlayer/global are
    // registered in production).
    let playerHandlerSawArrow = 0;
    const playerLike = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") playerHandlerSawArrow++;
    };
    window.addEventListener("keydown", playerLike);
    try {
      // Focused canvas → waveform seeks once; propagation is stopped at the
      // window-capture node → the bubble-phase player handler never runs.
      act(() => canvas.focus());
      act(() => {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      });
      expect(seekCalls).toHaveLength(1); // ONE seek (waveform slider +5)
      expect(seekCalls[0]).toBe(35);    // 30 + 5
      expect(playerHandlerSawArrow).toBe(0); // player handler: blocked

      // Unfocused canvas → the waveform stays silent and does NOT steal the
      // key: the player-level handler keeps its ownership (exactly one seek
      // from exactly one owner in both focus states).
      act(() => canvas.blur());
      act(() => {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      });
      expect(seekCalls).toHaveLength(1); // no second waveform seek
      expect(playerHandlerSawArrow).toBe(1); // player handler: got it
    } finally {
      window.removeEventListener("keydown", playerLike);
    }
  });

  it("keyboard seek is single-owner ALSO when the window listener is registered BEFORE the waveform mounts", async () => {
    // Registration-order robustness: the global shortcut hook mounts once at
    // app start, long before any player opens. Capture-phase dispatch order
    // is determined by the EVENT PATH, not registration order, so a
    // pre-existing bubble listener must still be suppressed by the focused
    // waveform's stopPropagation.
    let preExistingSawArrow = 0;
    const preExisting = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") preExistingSawArrow++;
    };
    window.addEventListener("keydown", preExisting);
    try {
      await render(); // waveform mounts AFTER the listener above
      const canvas = container.querySelector("[data-mq-waveform] canvas") as HTMLCanvasElement;
      act(() => canvas.focus());
      act(() => {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      });
      expect(seekCalls).toHaveLength(1);
      expect(preExistingSawArrow).toBe(0); // still blocked
    } finally {
      window.removeEventListener("keydown", preExisting);
    }
  });
});

// Silence unused-import lint for portals (kept import-parity with siblings).
void createPortal;
void currentPlaybackPosition;
