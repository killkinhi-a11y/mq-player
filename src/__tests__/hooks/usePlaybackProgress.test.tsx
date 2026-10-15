/**
 * usePlaybackProgress — P0 contract tests (stuck-0:00 fix).
 *
 * The hook must:
 *  1. reflect the engine position on mount (never a stale 0 when audio is
 *     already playing / paused mid-track);
 *  2. tick from the unified PlaybackClock while playing;
 *  3. re-read the engine position immediately on track change (after
 *     «next» the UI must read 0 on the very first render, not the previous
 *     track's position);
 *  4. unsubscribe on unmount (one clock listener per mounted surface);
 *  5. clamp non-finite engine positions to a safe 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React 19 act() contract for the jsdom test env.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/wasm-audio", () => ({
  currentPlaybackPosition: vi.fn(),
}));

type ClockListener = (pos: number, dur: number) => void;
let clockListeners: ClockListener[];

vi.mock("@/lib/playback/clock", () => ({
  subscribeClock: vi.fn((fn: ClockListener) => {
    clockListeners.push(fn);
    return () => { clockListeners = clockListeners.filter((l) => l !== fn); };
  }),
}));

import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { useAppStore } from "@/store/useAppStore";

const mockedPos = vi.mocked(currentPlaybackPosition);

function setTrack(id: string) {
  useAppStore.setState({
    currentTrack: {
      id, title: "T", artist: "A", album: "", duration: 200,
      cover: "", genre: "", audioUrl: "/demo/song1.mp3", source: "demo",
      scTrackId: 0,
    } as never,
  });
}

/** Probe renders the hook value into the DOM — read it via textContent. */
function Probe() {
  const pos = usePlaybackProgress(250);
  return <span data-testid="probe">{String(pos)}</span>;
}

function mount(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function value(h: { container: HTMLElement }): number {
  return Number(h.container.textContent);
}

function emitClock(pos: number) {
  act(() => {
    for (const l of [...clockListeners]) l(pos, 200);
  });
}

describe("usePlaybackProgress (P0 — ticking position)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clockListeners = [];
    mockedPos.mockReturnValue(0);
    setTrack("t1");
  });

  afterEach(() => {
    useAppStore.setState({ currentTrack: null });
  });

  it("subscribes to the unified clock and unsubscribes on unmount", () => {
    const h = mount();
    expect(clockListeners.length).toBe(1);
    h.unmount();
    expect(clockListeners.length).toBe(0);
  });

  it("reflects the live engine position on mount (paused mid-track remount)", () => {
    mockedPos.mockReturnValue(83.5);
    const h = mount();
    expect(value(h)).toBe(83.5);
    h.unmount();
  });

  it("ticks while the clock fires (playing)", () => {
    const h = mount();
    expect(value(h)).toBe(0);
    emitClock(42);
    expect(value(h)).toBe(42);
    emitClock(43.25);
    expect(value(h)).toBe(43.25);
    h.unmount();
  });

  it("re-reads the position immediately when the track changes (next → 0)", () => {
    mockedPos.mockReturnValue(120);
    const h = mount();
    expect(value(h)).toBe(120);

    // «Next» pressed: engine resets, track id swaps — no waiting a tick.
    mockedPos.mockReturnValue(0);
    act(() => {
      setTrack("t2");
    });
    expect(value(h)).toBe(0);

    // And the next track's early seconds show up immediately.
    mockedPos.mockReturnValue(1.2);
    act(() => {
      setTrack("t3");
    });
    expect(value(h)).toBe(1.2);
    h.unmount();
  });

  it("ignores non-finite / negative clock payloads", () => {
    const h = mount();
    emitClock(Number.NaN);
    emitClock(-5);
    expect(value(h)).toBe(0);
    emitClock(7);
    expect(value(h)).toBe(7);
    h.unmount();
  });

  it("clamps non-finite engine positions to a safe 0 on mount", () => {
    mockedPos.mockReturnValue(Number.NaN);
    const h = mount();
    expect(value(h)).toBe(0);
    h.unmount();
  });
});
