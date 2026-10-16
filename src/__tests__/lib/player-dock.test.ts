/**
 * Player Dock Mode (lib/playerDock) — contract tests.
 *
 * The dock mode is the user's persisted choice of desktop player
 * placement ("bottom" | "side" | "hidden"). Contract:
 *  - default is "bottom" when nothing is stored (no route context)
 *  - ROUTE-AWARE DEFAULT (v14): with no stored choice, chat routes
 *    ("messenger") on desktop resolve to "side"; everything else stays
 *    "bottom". A stored choice ALWAYS wins over the route context.
 *  - invalid storage values fall back to the route-aware default
 *  - setPlayerDock persists to localStorage AND notifies subscribers
 *  - subscribePlayerDock emits the current value immediately (late
 *    subscribers sync), unsubscribe stops delivery
 *  - setPlayerDock ignores same-value writes (no spurious events)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPlayerDock,
  setPlayerDock,
  restorePlayerDock,
  subscribePlayerDock,
  subscribePlayerRouteView,
  getPlayerRouteView,
  setDockRouteContext,
  hasUserDockChoice,
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

  it("chat routes on desktop auto-default to side until the user chooses", () => {
    setDockRouteContext("messenger", true);
    expect(getPlayerDock()).toBe("side");
    // Non-chat routes keep the classic bottom default
    setDockRouteContext("library", true);
    expect(getPlayerDock()).toBe("bottom");
    // Mobile viewports never auto-side (PlayerBar is null there anyway)
    setDockRouteContext("messenger", false);
    expect(getPlayerDock()).toBe("bottom");
  });

  it("an explicit user choice wins over the route context", () => {
    setPlayerDock("bottom");
    setDockRouteContext("messenger", true);
    expect(getPlayerDock()).toBe("bottom");
    expect(hasUserDockChoice()).toBe(true);
  });

  it("hasUserDockChoice is false until a mode is picked", () => {
    setDockRouteContext("messenger", true);
    expect(hasUserDockChoice()).toBe(false);
    setPlayerDock("side");
    expect(hasUserDockChoice()).toBe(true);
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

describe("playerDock restore (v16 — the hidden chip's single action)", () => {
  beforeEach(() => {
    resetPlayerDockForTest();
  });

  afterEach(() => {
    resetPlayerDockForTest();
  });

  it("restore returns to the last VISIBLE mode (side → hidden → side)", () => {
    setPlayerDock("side");
    setPlayerDock("hidden");
    expect(getPlayerDock()).toBe("hidden");
    restorePlayerDock();
    expect(getPlayerDock()).toBe("side");
  });

  it("restore returns to bottom when the capsule was hidden (bottom → hidden → bottom)", () => {
    setPlayerDock("bottom");
    setPlayerDock("hidden");
    restorePlayerDock();
    expect(getPlayerDock()).toBe("bottom");
  });

  it("hiding does NOT overwrite the last visible mode", () => {
    setPlayerDock("bottom");
    setPlayerDock("hidden");
    setPlayerDock("hidden"); // second hide — still bottom underneath
    expect(window.localStorage.getItem("mq-player-last-dock")).toBe("bottom");
    restorePlayerDock();
    expect(getPlayerDock()).toBe("bottom");
  });

  it("restore with no history falls back to the route-aware default", () => {
    // First-ever hide came from the auto route default → no last-dock yet.
    window.localStorage.setItem("mq-player-dock", "hidden");
    setDockRouteContext("messenger", true); // chat route on desktop
    restorePlayerDock();
    expect(getPlayerDock()).toBe("side");
    // And on a non-chat route the same fallback lands on the capsule.
    resetPlayerDockForTest();
    window.localStorage.setItem("mq-player-dock", "hidden");
    setDockRouteContext("library", true);
    restorePlayerDock();
    expect(getPlayerDock()).toBe("bottom");
  });

  it("route listeners sync even when an explicit dock choice exists", () => {
    setPlayerDock("hidden"); // explicit choice — mode listeners would stop here
    const seen: string[] = [];
    const unsub = subscribePlayerRouteView((view) => seen.push(view));
    expect(seen).toEqual([""]); // immediate emit of the current (empty) route
    setDockRouteContext("messenger", true);
    setDockRouteContext("main", true);
    expect(seen).toEqual(["", "messenger", "main"]);
    expect(getPlayerRouteView()).toBe("main");
    expect(getPlayerDock()).toBe("hidden"); // the mode itself is untouched
    unsub();
    setDockRouteContext("library", true);
    expect(seen).toEqual(["", "messenger", "main"]); // unsubscribed
  });
});
