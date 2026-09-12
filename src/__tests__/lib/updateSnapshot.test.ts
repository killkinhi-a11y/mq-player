/**
 * Phase M #25/#26 — updateSnapshot tests: save → reload → restore roundtrip.
 * Verifies: queue/currentTrack/position/volume restored, paused stays paused,
 * one-shot consumption, corrupted snapshot rejected without poisoning store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import {
  saveUpdateSnapshot,
  readUpdateSnapshot,
  clearUpdateSnapshot,
  restoreUpdateSnapshot,
} from "@/lib/updateSnapshot";

const track: Track = {
  id: "t-1",
  title: "Test Track",
  artist: "Test Artist",
  duration: 200,
  source: "demo",
} as unknown as Track;

const otherTrack: Track = {
  id: "t-2",
  title: "Next",
  artist: "Other",
  duration: 100,
  source: "demo",
} as unknown as Track;

const fakeAudio = (readyState: number) =>
  ({ src: "x", readyState, currentTime: 0, duration: 200 }) as unknown as HTMLAudioElement;

describe("updateSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 80,
    });
  });

  it("save → read roundtrip captures playback context", () => {
    useAppStore.setState({
      currentTrack: track,
      queue: [track, otherTrack],
      queueIndex: 0,
      isPlaying: true,
      progress: 42.5,
      volume: 55,
    });
    saveUpdateSnapshot();
    const snap = readUpdateSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.trackId).toBe("t-1");
    expect(snap!.position).toBe(42.5);
    expect(snap!.isPlaying).toBe(true);
    expect(snap!.volume).toBe(55);
    expect(snap!.queue.length).toBe(2);
  });

  it("nothing playing → no snapshot written", () => {
    useAppStore.setState({ currentTrack: null });
    saveUpdateSnapshot();
    expect(readUpdateSnapshot()).toBeNull();
  });

  it("restore: queue + position + volume; PAUSED stays paused (#26)", () => {
    useAppStore.setState({
      currentTrack: track,
      queue: [track, otherTrack],
      queueIndex: 0,
      isPlaying: false,
      progress: 61,
      volume: 40,
    });
    saveUpdateSnapshot();
    // Simulate fresh boot: reset store
    useAppStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      progress: 0,
      volume: 80,
    });

    const audio = fakeAudio(1);
    const restored = restoreUpdateSnapshot(() => audio);
    expect(restored).toBe(true);

    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("t-1");
    expect(s.queue.length).toBe(2);
    expect(s.progress).toBe(61);
    expect(s.volume).toBe(40);
    expect(s.isPlaying).toBe(false); // paused pre-reload → paused after

    // One-shot: snapshot consumed
    expect(readUpdateSnapshot()).toBeNull();
  });

  it("corrupted snapshot → rejected, store untouched", () => {
    localStorage.setItem("mq-update-snapshot-v1", "{corrupted json");
    useAppStore.setState({ currentTrack: null, queue: [], progress: 0 });
    const restored = restoreUpdateSnapshot(() => fakeAudio(1));
    expect(restored).toBe(false);
    expect(useAppStore.getState().currentTrack).toBeNull();
  });

  it("missing track in queue → cleared quietly", () => {
    localStorage.setItem(
      "mq-update-snapshot-v1",
      JSON.stringify({ v: 1, trackId: "gone", track: null, queue: [], queueIndex: 0, position: 5, isPlaying: false, volume: 50 })
    );
    const restored = restoreUpdateSnapshot(() => fakeAudio(1));
    expect(restored).toBe(false);
    expect(readUpdateSnapshot()).toBeNull();
  });
});
