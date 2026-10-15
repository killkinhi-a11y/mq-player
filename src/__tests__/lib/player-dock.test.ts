/**
 * Player Dock Mode (lib/playerDock) — contract tests.
 *
 * The dock mode is the user's persisted choice of desktop player
 * placement ("bottom" | "side" | "hidden"). Contract:
 *  - default is "bottom" when nothing is stored
 *  - invalid storage values fall back to "bottom" (storage is
 *    user-editable — never trust it blindly)
 *  - setPlayerDock persists to localStorage AND notifies subscribers
 *  - subscribePlayerDock emits the current value immediately (late
 *    subscribers sync), unsubscribe stops delivery
 *  - setPlayerDock ignores same-value writes (no spurious events)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPlayerDock,
  setPlayerDock,
  subscribePlayerDock,
  resetPlayerDockForTest,
  PLAYER_DOCK_MODES,
} from "@/lib/playerDock";

describe("playerDock", () => {
  beforeEach(() => {
    resetPlayerDockForTest();
  });

  afterEach(() => {
    resetPlayerDockForTest();
  });

  it("defaults to bottom when nothing is stored", () => {
    expect(getPlayerDock()).toBe("bottom");
  });

  it("invalid stored values fall back to bottom", () => {
    window.localStorage.setItem("mq-player-dock", "diagonal");
    expect(getPlayerDock()).toBe("bottom");
  });

  it("exposes exactly the three dock modes", () => {
    expect([...PLAYER_DOCK_MODES]).toEqual(["bottom", "side", "hidden"]);
  });

  it("setPlayerDock persists and notifies subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribePlayerDock((mode) => seen.push(mode));

    // Immediate sync emit for late subscribers
    expect(seen).toEqual(["bottom"]);

    setPlayerDock("side");
    expect(window.localStorage.getItem("mq-player-dock")).toBe("side");
    expect(getPlayerDock()).toBe("side");
    expect(seen).toEqual(["bottom", "side"]);

    setPlayerDock("hidden");
    expect(getPlayerDock()).toBe("hidden");
    expect(seen).toEqual(["bottom", "side", "hidden"]);

    unsub();
    setPlayerDock("bottom");
    // Unsubscribed — no further deliveries
    expect(seen).toEqual(["bottom", "side", "hidden"]);
    expect(getPlayerDock()).toBe("bottom");
  });

  it("same-value writes do not emit", () => {
    const seen: string[] = [];
    subscribePlayerDock((mode) => seen.push(mode));
    setPlayerDock("bottom"); // already bottom
    expect(seen).toEqual(["bottom"]);
  });

  it("reads back the stored value on a fresh cache", () => {
    setPlayerDock("side");
    resetPlayerDockForTest(); // clears cache but NOT the assertion target
    // (reset also removes storage — set it manually like a returning user)
    window.localStorage.setItem("mq-player-dock", "hidden");
    expect(getPlayerDock()).toBe("hidden");
  });
});
