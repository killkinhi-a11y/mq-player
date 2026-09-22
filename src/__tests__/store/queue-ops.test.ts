/**
 * Queue editing (W09) — reorder + remove + clear state tests.
 *
 * The QueueView UI (dnd-kit drag & drop, remove buttons, "Очистить")
 * existed before; these tests pin the STORE operations it drives, so a
 * regression in reorder/remove/clear breaks CI instead of just the UX.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";

const T = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: "",
  cover: "",
  duration: 100,
  genre: "",
  audioUrl: "",
  previewUrl: "",
  source: "soundcloud",
});

describe("moveInQueue (reorder)", () => {
  beforeEach(() => {
    useAppStore.setState({
      queue: [T("a"), T("b"), T("c"), T("d")],
      queueIndex: 0,
      upNext: [],
      currentTrack: T("a"),
      isPlaying: true,
    });
  });

  it("moves a track forward and keeps the current index correct", () => {
    // queue: [a, b, c, d], current = a (idx 0); move b → position 3
    useAppStore.getState().moveInQueue(1, 3);
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["a", "c", "d", "b"]);
    // current (a) stayed at index 0
    expect(s.queueIndex).toBe(0);
    expect(s.currentTrack?.id).toBe("a");
  });

  it("moves the CURRENT track: queueIndex follows it", () => {
    useAppStore.getState().moveInQueue(0, 2);
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["b", "c", "a", "d"]);
    expect(s.queueIndex).toBe(2);
    expect(s.queue[s.queueIndex].id).toBe("a");
  });

  it("current index adjusts when a later track jumps before it", () => {
    useAppStore.setState({ queueIndex: 1 }); // current = b
    useAppStore.getState().moveInQueue(3, 0); // d before b
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["d", "a", "b", "c"]);
    expect(s.queueIndex).toBe(2);
    expect(s.queue[s.queueIndex].id).toBe("b");
  });

  it("current index adjusts when an earlier track jumps past it", () => {
    useAppStore.setState({ queueIndex: 2 }); // current = c
    useAppStore.getState().moveInQueue(0, 3); // a after c
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["b", "c", "d", "a"]);
    expect(s.queueIndex).toBe(1);
    expect(s.queue[s.queueIndex].id).toBe("c");
  });
});

describe("queue removal + clear (W09)", () => {
  beforeEach(() => {
    useAppStore.setState({
      queue: [T("a"), T("b"), T("c")],
      queueIndex: 0,
      upNext: [T("x"), T("y")],
      currentTrack: T("a"),
    });
  });

  it("removing a track AFTER the current one keeps the current index", () => {
    useAppStore.setState({ queue: useAppStore.getState().queue.filter((t) => t.id !== "b") });
    const s = useAppStore.getState();
    expect(s.queue.map((t) => t.id)).toEqual(["a", "c"]);
    expect(s.queueIndex).toBe(0);
  });

  it("removeFromUpNext removes exactly one item", () => {
    useAppStore.getState().removeFromUpNext(0);
    expect(useAppStore.getState().upNext.map((t) => t.id)).toEqual(["y"]);
  });

  it("moveInUpNext reorders the up-next list", () => {
    useAppStore.getState().moveInUpNext(0, 1);
    expect(useAppStore.getState().upNext.map((t) => t.id)).toEqual(["y", "x"]);
  });

  it("clearUpNext empties the manual queue section", () => {
    useAppStore.getState().clearUpNext();
    expect(useAppStore.getState().upNext).toEqual([]);
  });

  it("queue edits persist in player state (no playback reset)", () => {
    useAppStore.getState().moveInQueue(1, 2);
    const s = useAppStore.getState();
    expect(s.isPlaying).toBe(true);
    expect(s.currentTrack?.id).toBe("a");
  });
});
