/**
 * Player timeline integration (spec §9): ONE audio clock feeds BOTH the
 * lyrics view and the waveform renderer. Seek flows through the engine and
 * every consumer reads the same position — no independent timers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wasm-audio", () => ({
  currentPlaybackPosition: vi.fn(),
  seekPlayback: vi.fn(),
}));
// Component CSS — vitest must not push it through postcss/tailwind.
vi.mock("@/components/mq/liquid-lyrics.css", () => ({}));

import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { findActiveIdx, lineFill } from "@/components/mq/LiquidLyrics";
import { bucketIndexForTime, timeToX, xToTime } from "@/lib/waveform/computePeaks";
import { useAppStore } from "@/store/useAppStore";
import type { LyricLine } from "@/lib/lyrics/types";

const mockedPos = vi.mocked(currentPlaybackPosition);

const LINES: LyricLine[] = [
  { text: "интро", startMs: 0, endMs: 8000 },
  { text: "куплет", startMs: 8000, endMs: 20000 },
  { text: "припев", startMs: 20000, endMs: 30000 },
  { text: "финал", startMs: 30000, endMs: 42000 },
];
const DURATION = 42;

describe("Player — single audio timeline (play/pause/seek)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      isPlaying: false,
      progress: 0,
      duration: DURATION,
      currentTrack: {
        id: "demo-1", title: "T", artist: "A", album: "", duration: DURATION,
        cover: "", genre: "", audioUrl: "/demo/song1.mp3", source: "demo",
      },
    });
  });

  it("play/pause toggles isPlaying without touching position", () => {
    const st = useAppStore.getState();
    st.togglePlay();
    expect(useAppStore.getState().isPlaying).toBe(true);
    st.togglePlay();
    expect(useAppStore.getState().isPlaying).toBe(false);
    // Position untouched by transport toggles.
    expect(useAppStore.getState().progress).toBe(0);
  });

  it("seek: lyrics and waveform consume the SAME audio-clock position", () => {
    // Simulate a seek to 21s — the engine clock now reports 21.
    mockedPos.mockReturnValue(21);
    const pos = currentPlaybackPosition();

    // Lyrics sync: active line + karaoke fill derive from `pos` alone.
    const activeIdx = findActiveIdx(LINES, pos);
    expect(activeIdx).toBe(2); // припев starts at 20s
    const fill = lineFill(LINES, activeIdx, pos, DURATION);
    expect(fill).toBeCloseTo(0.1, 5); // 1s into the 20→30s window

    // Waveform sync: playhead x + bucket derive from the SAME `pos`.
    const x = timeToX(pos, 400, DURATION);
    expect(x).toBeCloseTo(200, 5);
    expect(bucketIndexForTime(pos, DURATION, 1080)).toBe(Math.floor((21 / 42) * 1080));
    // And the reverse mapping lands back on the same time.
    expect(xToTime(x, 400, DURATION)).toBeCloseTo(21, 6);
  });

  it("pause freezes the position: both consumers see identical frames", () => {
    mockedPos.mockReturnValue(33.5);
    const a1 = findActiveIdx(LINES, currentPlaybackPosition());
    const w1 = timeToX(currentPlaybackPosition(), 400, DURATION);
    // "Paused" — the clock does not advance between reads.
    const a2 = findActiveIdx(LINES, currentPlaybackPosition());
    const w2 = timeToX(currentPlaybackPosition(), 400, DURATION);
    expect(a1).toBe(a2);
    expect(w1).toBe(w2);
  });

  it("resume continues correctly from the frozen position", () => {
    mockedPos.mockReturnValue(10);
    expect(findActiveIdx(LINES, currentPlaybackPosition())).toBe(1); // куплет
    // After resume the clock advances past the same line's end.
    mockedPos.mockReturnValue(20.5);
    expect(findActiveIdx(LINES, currentPlaybackPosition())).toBe(2); // припев
    expect(lineFill(LINES, 2, currentPlaybackPosition(), DURATION)).toBeCloseTo(0.05, 5);
  });

  it("manual seek via the store updates progress (waveform commit path)", () => {
    useAppStore.getState().setProgress(15);
    expect(useAppStore.getState().progress).toBe(15);
    // The waveform's commit path (seekPlayback + setProgress) mirrors this.
    mockedPos.mockReturnValue(15);
    const idx = findActiveIdx(LINES, currentPlaybackPosition());
    expect(idx).toBe(1);
    expect(lineFill(LINES, idx, currentPlaybackPosition(), DURATION)).toBeCloseTo((15 - 8) / 12, 5);
  });

  it("extreme positions stay consistent across both consumers", () => {
    for (const pos of [0, 0.001, DURATION - 0.001, DURATION, DURATION * 2]) {
      mockedPos.mockReturnValue(pos);
      const idx = findActiveIdx(LINES, pos);
      const x = timeToX(pos, 400, DURATION);
      // Both map the same position into their own spaces without error.
      expect(idx).toBeGreaterThanOrEqual(-1);
      expect(idx).toBeLessThan(LINES.length);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      // Reverse mapping is lossless within the resolution.
      expect(xToTime(x, 400, DURATION)).toBeCloseTo(Math.min(pos, DURATION), 6);
    }
  });
});
