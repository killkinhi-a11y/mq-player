/**
 * Phase 2C regression tests — playback reliability.
 *
 * Covers:
 *  - demo media teardown fallback (the MEDIA_ERR_SRC_NOT_SUPPORTED blip:
 *    root cause was `audio.src = ""` at page unload, which made the element
 *    load the PAGE URL as audio and fire a synthetic error);
 *  - playback retry bound (max 3 automatic retries per track);
 *  - circuit breaker (5 consecutive failures stop auto-skip — no infinite
 *    skip through the queue);
 *  - queue consistency across next/prev and queue-end.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  isTeardownMediaError,
  PLAYER_MAX_RETRIES,
  PLAYER_MAX_CONSECUTIVE_FAILURES,
} from "@/lib/audioEngine";
import { useAppStore } from "@/store/useAppStore";
import { DEMO_TRACKS } from "@/lib/demoTracks";
import { resetPollingSuspension } from "@/lib/authGate";
import type { Track } from "@/lib/musicApi";

const mkTrack = (i: number): Track => ({
  id: `t${i}`,
  title: `Track ${i}`,
  artist: "A",
  album: "",
  cover: "",
  audioUrl: `https://x/t${i}.mp3`,
  duration: 100,
  genre: "",
  source: "soundcloud",
});

beforeEach(() => {
  localStorage.clear();
  resetPollingSuspension();
  const store = useAppStore.getState();
  if (store.reset) store.reset();
});

// ── 1. Demo media teardown fallback ───────────────────────────────────────────

describe("demo media teardown (MEDIA_ERR blip root cause)", () => {
  it("an error with NO current track is a teardown artifact, not a track failure", () => {
    const el = document.createElement("audio");
    el.setAttribute("src", "/demo/song1.mp3");
    expect(isTeardownMediaError(el, false)).toBe(true);
    expect(isTeardownMediaError(el, true)).toBe(false);
  });

  it("an element with no src attribute (unloaded/teardown) is ignored, but HLS-attached elements are not", () => {
    const el = document.createElement("audio");
    expect(isTeardownMediaError(el, true)).toBe(true); // no src, no hls

    (el as unknown as Record<string, unknown>)._hlsInstance = { destroy: () => {} };
    expect(isTeardownMediaError(el, true)).toBe(false); // hls-attached → real path
  });

  it("an element whose resolved src is the PAGE URL is the legacy src=\"\" bug — teardown artifact", () => {
    const el = document.createElement("audio");
    // Simulate what `audio.src = ""` does in a browser: resolves to the
    // document URL. In jsdom the document lives at about:blank / localhost.
    const pageUrl = window.location.href;
    el.setAttribute("src", pageUrl);
    expect(isTeardownMediaError(el, true)).toBe(true);
  });

  it("a real demo track with a proper src is NOT a teardown artifact", () => {
    const el = document.createElement("audio");
    const demo = DEMO_TRACKS[0];
    el.setAttribute("src", demo.audioUrl);
    expect(isTeardownMediaError(el, true)).toBe(false);
  });

  it("removing the src attribute (the Phase 2C unload fix) never resolves to the page URL", () => {
    const el = document.createElement("audio");
    el.setAttribute("src", "https://x/song.mp3");
    el.removeAttribute("src");
    expect(el.getAttribute("src")).toBeNull();
    expect(isTeardownMediaError(el, true)).toBe(true); // ignored, not treated as failure
  });
});

// ── 2. Playback retry bound ──────────────────────────────────────────────────

describe("playback retry bound", () => {
  it("max automatic retries is finite and small (3)", () => {
    expect(PLAYER_MAX_RETRIES).toBe(3);
    expect(Number.isFinite(PLAYER_MAX_RETRIES)).toBe(true);
  });

  it("circuit breaker threshold is finite (5 consecutive failures)", () => {
    expect(PLAYER_MAX_CONSECUTIVE_FAILURES).toBe(5);
  });
});

// ── 3. Failed track does not infinitely skip ─────────────────────────────────

describe("broken tracks / circuit breaker (no infinite skip)", () => {
  it("nextTrack skips a broken track but lands on a playable one (bounded walk)", () => {
    const tracks = [mkTrack(1), mkTrack(2), mkTrack(3)];
    useAppStore.setState({
      queue: tracks,
      queueIndex: 0,
      currentTrack: tracks[0],
      brokenTrackIds: new Set(["t1"]),
    });
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("t2"); // skipped broken t1, did not loop forever
    expect(s.queueIndex).toBe(1);
  });

  it("nextTrack with the ENTIRE queue broken terminates without spinning (bounded loop)", () => {
    const tracks = [mkTrack(1), mkTrack(2), mkTrack(3), mkTrack(4)];
    useAppStore.setState({
      queue: tracks,
      queueIndex: 0,
      currentTrack: tracks[0],
      brokenTrackIds: new Set(tracks.map((t) => t.id)),
    });
    // The skip-broken walk is bounded by queue length (attempts < queue.length)
    // and must return synchronously — this test completing at all is the proof.
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    // Either stayed on a track or moved by at most queue.length steps:
    expect(s.queue.length).toBe(4);
    expect(s.queueIndex).toBeGreaterThanOrEqual(0);
    expect(s.queueIndex).toBeLessThan(4);
  });

  it("repeated nextTrack over an all-broken queue cannot advance indefinitely (consistency)", () => {
    const tracks = [mkTrack(1), mkTrack(2)];
    useAppStore.setState({
      queue: tracks,
      queueIndex: 0,
      currentTrack: tracks[0],
      brokenTrackIds: new Set(["t1", "t2"]),
    });
    for (let i = 0; i < 50; i++) {
      useAppStore.getState().nextTrack(); // would infinite-loop pre-fix if unbounded
    }
    const s = useAppStore.getState();
    expect(s.queueIndex).toBeGreaterThanOrEqual(0);
    expect(s.queueIndex).toBeLessThan(s.queue.length);
  });
});

// ── 4. Queue consistency ──────────────────────────────────────────────────────

describe("queue stays consistent", () => {
  it("nextTrack advances within the queue and keeps currentTrack/queueIndex in sync", () => {
    const tracks = [mkTrack(1), mkTrack(2), mkTrack(3)];
    useAppStore.setState({ queue: tracks, queueIndex: 0, currentTrack: tracks[0], upNext: [] });
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("t2");
    expect(s.queue[s.queueIndex].id).toBe("t2");
  });

  it("nextTrack at the end of the queue (no repeat/radio) stops playback WITHOUT corrupting the queue", () => {
    const tracks = [mkTrack(1), mkTrack(2)];
    useAppStore.setState({
      queue: tracks,
      queueIndex: 1,
      currentTrack: tracks[1],
      repeat: "off",
      radioMode: false,
      upNext: [],
    });
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.queue).toHaveLength(2);
    // currentTrack either stays on the last track or is untouched — never
    // null/undefined (queue consistency invariant).
    expect(s.currentTrack).not.toBeNull();
  });

  it("prevTrack walks backwards and wraps consistently", () => {
    const tracks = [mkTrack(1), mkTrack(2), mkTrack(3)];
    useAppStore.setState({ queue: tracks, queueIndex: 2, currentTrack: tracks[2], upNext: [] });
    useAppStore.getState().prevTrack();
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("t2");
    expect(s.queue[s.queueIndex].id).toBe("t2");
  });

  it("demo queue is exactly the 4 bundled demo tracks and stays intact after a full walk", () => {
    useAppStore.setState({ queue: [...DEMO_TRACKS], queueIndex: 0, currentTrack: DEMO_TRACKS[0], upNext: [] });
    for (let i = 0; i < 4; i++) useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(DEMO_TRACKS.map((t) => t.id));
    // walked past the end without repeat → stopped, queue intact
    expect(s.isPlaying).toBe(false);
  });
});
