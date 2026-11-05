/**
 * Stage III characterization test — locks the public shape of useAppStore
 * and its persisted format BEFORE/AFTER the slice decomposition.
 * If any snapshot here changes, the refactor changed behaviour or the
 * localStorage contract (STORAGE_KEY / version / partialize / migrate).
 */
import { describe, it, expect } from "vitest";
import { useAppStore } from "@/store/useAppStore";

type AnyState = Record<string, unknown>;
const sampleTrack = {
  id: "t1", title: "Song", artist: "Artist", album: "Album", duration: 180,
  cover: "https://x/c.jpg", genre: "pop", source: "soundcloud",
  scTrackId: 1, scStreamPolicy: "ALLOW", audioUrl: "https://x/a.mp3",
  previewUrl: "https://x/p.mp3", lyrics: "la la", extra: { heavy: true },
};

describe("useAppStore shape (characterization)", () => {
  it("exposes the same keys with the same value kinds", () => {
    const st = useAppStore.getState() as unknown as AnyState;
    const shape = Object.keys(st).sort().map((k) => `${k}:${typeof st[k]}`);
    expect(shape).toMatchSnapshot();
  });

  it("has the same initial (non-function) values", () => {
    const st = useAppStore.getState() as unknown as AnyState;
    const data: AnyState = {};
    for (const k of Object.keys(st).sort()) {
      if (typeof st[k] !== "function" && k !== "_hasHydrated") data[k] = st[k];
    }
    expect(data).toMatchSnapshot();
  });

  it("keeps the persist contract: name + version", () => {
    const opts = useAppStore.persist.getOptions();
    expect({ name: opts.name, version: opts.version }).toMatchSnapshot();
  });

  it("partialize output is unchanged for a populated state", () => {
    const opts = useAppStore.persist.getOptions();
    const base = useAppStore.getState() as unknown as AnyState;
    const populated = {
      ...base,
      isAuthenticated: true, userId: "u1", username: "max", email: "m@x.ru",
      currentTrack: sampleTrack, queue: [sampleTrack, { ...sampleTrack, id: "t2" }],
      upNext: [{ ...sampleTrack, id: "t3" }],
      likedTrackIds: ["t1"], likedTracksData: [sampleTrack],
      history: [{ track: sampleTrack, playedAt: 1700000000000 }],
      volume: 55, currentTheme: "default",
    };
    const out = opts.partialize!(populated as never) as AnyState;
    expect(Object.keys(out).sort()).toMatchSnapshot("persisted keys");
    expect(out).toMatchSnapshot("persisted values");
  });

  it("migrate() output is unchanged for an old v9 payload", async () => {
    const opts = useAppStore.persist.getOptions();
    const old = {
      radioMode: true, radioSeedTrack: sampleTrack, wasmEngineEnabled: true,
      currentTheme: "default", volume: 40, likedTrackIds: ["a"],
    };
    const out = await opts.migrate!(structuredClone(old), 9);
    expect(out).toMatchSnapshot();
  });
});
