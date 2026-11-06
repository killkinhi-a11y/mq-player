/**
 * Store-level regressions for the shared queue rules (src/lib/core/queue.ts,
 * shared/test-fixtures/queue.cases.json). Each test failed before Stage V.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { resetPollingSuspension } from "@/lib/authGate";
import { partializeState, mergeState } from "@/store/persist";
import type { Track } from "@/lib/musicApi";
import type { AppState } from "@/store/types";

const mk = (id: string): Track => ({
  id, title: id, artist: `artist-${id}`, album: "", cover: "", audioUrl: `https://x/${id}.mp3`,
  duration: 100, genre: "", source: "soundcloud",
});
const ids = (ts: Track[]) => ts.map((t) => t.id);

beforeEach(() => {
  localStorage.clear();
  resetPollingSuspension();
  const s = useAppStore.getState();
  if (s.reset) s.reset();
  useAppStore.setState({ shuffle: false, repeat: "off", radioMode: false, smartQueueAutoplay: false, brokenTrackIds: new Set() });
});

describe("queue parity — web store", () => {
  it("after upNext items the queue continues after the old current track (not from the top)", () => {
    const q = ["a", "b", "c", "d"].map(mk);
    useAppStore.setState({ queue: q, queueIndex: 1, currentTrack: q[1], upNext: [mk("x"), mk("y")] });
    const st = useAppStore.getState;
    st().nextTrack();
    expect(st().currentTrack?.id).toBe("x");
    st().nextTrack();
    expect(st().currentTrack?.id).toBe("y");
    st().nextTrack();
    expect(st().currentTrack?.id).toBe("c"); // was "a"
    expect(ids(st().queue)).toEqual(["a", "b", "x", "y", "c", "d"]);
  });

  it("several upNext items play FIFO", () => {
    const q = ["a", "b"].map(mk);
    useAppStore.setState({ queue: q, queueIndex: 0, currentTrack: q[0], upNext: [] });
    useAppStore.getState().addToUpNext(mk("x"));
    useAppStore.getState().addToUpNext(mk("y"));
    useAppStore.getState().nextTrack();
    expect(useAppStore.getState().currentTrack?.id).toBe("x");
    useAppStore.getState().nextTrack();
    expect(useAppStore.getState().currentTrack?.id).toBe("y");
  });

  it("Previous at the first track with repeat off restarts instead of wrapping to the last", () => {
    const q = ["a", "b", "c"].map(mk);
    useAppStore.setState({ queue: q, queueIndex: 0, currentTrack: q[0], progress: 1, repeat: "off" });
    useAppStore.getState().prevTrack();
    expect(useAppStore.getState().currentTrack?.id).toBe("a");
    expect(useAppStore.getState().queueIndex).toBe(0);
    expect(useAppStore.getState().progress).toBe(0);
  });

  it("Previous at the first track with repeat all wraps to the last", () => {
    const q = ["a", "b", "c"].map(mk);
    useAppStore.setState({ queue: q, queueIndex: 0, currentTrack: q[0], progress: 1, repeat: "all" });
    useAppStore.getState().prevTrack();
    expect(useAppStore.getState().currentTrack?.id).toBe("c");
  });

  it("broken-track skip does not wrap to the top with repeat off", () => {
    const q = ["a", "b", "c"].map(mk);
    useAppStore.setState({ queue: q, queueIndex: 0, currentTrack: q[0], isPlaying: true, brokenTrackIds: new Set(["b", "c"]) });
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("a"); // did not jump back to "a" as a *new* play / wrap
    expect(s.queueIndex).toBe(0);
    expect(s.isPlaying).toBe(false);
  });

  it("persisted queue window always contains the current track (index ≥ 50)", () => {
    const q = Array.from({ length: 80 }, (_, i) => mk(`t${i}`));
    useAppStore.setState({ queue: q, queueIndex: 70, currentTrack: q[70] });
    const persisted = partializeState(useAppStore.getState()) as { queue: Track[]; queueIndex: number };
    expect(persisted.queue.length).toBe(50);
    expect(persisted.queue[persisted.queueIndex].id).toBe("t70");
  });

  it("restore repairs a stale index from older persisted states", () => {
    const q = ["a", "b", "c"].map(mk);
    const current = useAppStore.getState() as AppState;
    const merged = mergeState({ queue: q, queueIndex: 70, currentTrack: q[2] }, current) as AppState;
    expect(merged.queueIndex).toBe(2);
    expect(merged.isPlaying).toBe(false); // restore never autoplays
  });
});
