/**
 * Stage III — store slices: structure + cross-slice interaction tests.
 * Slices share one store; these tests pin that an action in one slice
 * correctly reads/writes state "owned" by another slice through get()/set().
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore, getLastVolume } from "@/store/useAppStore";
import { initialState } from "@/store/initialState";
import * as slices from "@/store/slices";
import type { Track } from "@/lib/musicApi";

const T = (id: string): Track => ({
  id, title: `Track ${id}`, artist: `Artist ${id}`, album: "", cover: "",
  duration: 100, genre: "", audioUrl: "", previewUrl: "", source: "soundcloud",
});

const factories = Object.entries(slices).filter(([k]) => k.startsWith("create")) as [
  string, (set: unknown, get: unknown, api: unknown) => Record<string, unknown>,
][];
const noop = () => {};
const sliceKeys = factories.map(([name, f]) => [name, Object.keys(f(noop, () => useAppStore.getState(), {}))] as const);

describe("slice structure", () => {
  it("every slice exposes only functions (state lives in initialState)", () => {
    for (const [name, f] of factories) {
      const obj = f(noop, () => useAppStore.getState(), {});
      for (const [k, v] of Object.entries(obj)) expect(typeof v, `${name}.${k}`).toBe("function");
    }
  });

  it("slices are disjoint — no action is defined twice", () => {
    const all = sliceKeys.flatMap(([, ks]) => ks);
    expect(new Set(all).size).toBe(all.length);
  });

  it("slices + reset cover every action of the store", () => {
    const st = useAppStore.getState() as unknown as Record<string, unknown>;
    const storeFns = Object.keys(st).filter((k) => typeof st[k] === "function").sort();
    const sliceFns = [...sliceKeys.flatMap(([, ks]) => ks), "reset"].sort();
    expect(sliceFns).toEqual(storeFns);
  });

  it("no slice redefines state keys from initialState", () => {
    const stateKeys = new Set(Object.keys(initialState));
    for (const [name, ks] of sliceKeys) for (const k of ks) expect(stateKeys.has(k), `${name}.${k}`).toBe(false);
  });
});

describe("cross-slice interactions", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialState, _hasHydrated: true });
  });

  it("queue (upNext) feeds playback.nextTrack — upNext has priority", () => {
    useAppStore.setState({ queue: [T("a"), T("b"), T("c")], queueIndex: 0, currentTrack: T("a") });
    useAppStore.getState().addToUpNext(T("x"));
    useAppStore.getState().nextTrack();
    const s = useAppStore.getState();
    expect(s.currentTrack?.id).toBe("x");
    expect(s.upNext).toHaveLength(0);
  });

  it("playback.setVolume updates the shared last-volume memory (helpers)", () => {
    useAppStore.getState().setVolume(42);
    expect(getLastVolume()).toBe(42);
    useAppStore.getState().setVolume(0);
    expect(useAppStore.getState().volume).toBe(0);
    expect(getLastVolume()).toBe(42);
  });

  it("library.toggleLike is visible through library.isTrackLiked and survives queue ops", () => {
    const t = T("liked");
    useAppStore.getState().toggleLike(t.id, t);
    useAppStore.getState().addToUpNext(t);
    useAppStore.getState().clearUpNext();
    expect(useAppStore.getState().isTrackLiked(t.id)).toBe(true);
  });

  it("auth.logout resets state owned by other slices (queue, library, messenger, ui)", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
    useAppStore.setState({
      isAuthenticated: true, userId: "u1",
      queue: [T("a")], upNext: [T("b")], likedTrackIds: ["a"],
      searchQuery: "hello", unreadCounts: { c1: 3 } as never,
    });
    useAppStore.getState().logout();
    const s = useAppStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.upNext).toEqual([]);
    expect(s.likedTrackIds).toEqual([]);
    expect(s.searchQuery).toBe("");
    expect(s._hasHydrated).toBe(true);
    vi.unstubAllGlobals();
  });

  it("reset (root) restores initial values for every slice", () => {
    useAppStore.getState().setTheme("default");
    useAppStore.getState().startSleepTimer(10);
    useAppStore.getState().setSearchQuery("q");
    useAppStore.getState().reset();
    const s = useAppStore.getState() as unknown as Record<string, unknown>;
    for (const k of ["sleepTimerActive", "searchQuery", "currentTheme", "queue"]) {
      expect(s[k], k).toEqual((initialState as Record<string, unknown>)[k]);
    }
  });
});
