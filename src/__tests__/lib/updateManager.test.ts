/**
 * Phase M #44 — UpdateManager tests.
 * Covers: no update / new update / accepted / delayed (dismiss) / failed /
 * multi-tab broadcast / reload recovery bounds / stale-chunk detection.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { UpdateManager, isChunkLoadErrorMessage, type BroadcastChannelLike } from "@/lib/updateManager";

// ── Test doubles ──

type Post = { type: string; info?: Record<string, string> };

class FakeChannel {
  sent: Post[] = [];
  listeners: Array<(ev: { data: unknown }) => void> = [];
  peers: FakeChannel[] = [];
  postMessage(data: unknown) {
    this.sent.push(data as Post);
    // Deliver to peers (simulates other tabs)
    this.peers.forEach((p) => p.listeners.forEach((l) => l({ data })));
  }
  addEventListener(_t: "message", listener: (ev: { data: unknown }) => void) {
    this.listeners.push(listener);
  }
  removeEventListener(_t: "message", listener: (ev: { data: unknown }) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  close() {}
  /** simulate an incoming message from another tab */
  receive(data: unknown) {
    this.listeners.forEach((l) => l({ data }));
  }
}

function linkTabs(...chans: FakeChannel[]) {
  chans.forEach((c) => (c.peers = chans.filter((p) => p !== c)));
}

const VERSION_ENDPOINT = "/version.json";

function makeFetch(versionJson: Record<string, string> | null, opts: { ok?: boolean; delay?: number } = {}) {
  // Plain object (not Response) — jsdom lacks the Response global; the
  // manager only consumes .ok / .status / .json().
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (!url.startsWith(VERSION_ENDPOINT)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    if (opts.ok === false) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => versionJson };
  }) as unknown as typeof fetch;
}

function setPageBuild(id: string | null) {
  if (id === null) {
    delete (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__;
  } else {
    (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__ = { buildId: id };
  }
}

describe("isChunkLoadErrorMessage", () => {
  it("recognizes stale-chunk failure messages", () => {
    expect(isChunkLoadErrorMessage("Failed to fetch dynamically imported module: chunk-123")).toBe(true);
    expect(isChunkLoadErrorMessage("ChunkLoadError: Loading chunk 42 failed")).toBe(true);
    expect(isChunkLoadErrorMessage("Importing a module script failed")).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isChunkLoadErrorMessage("Cannot read property of undefined")).toBe(false);
    expect(isChunkLoadErrorMessage("")).toBe(false);
  });
});

describe("UpdateManager", () => {
  let reloadCalls: number;
  let channel: FakeChannel;

  beforeEach(() => {
    sessionStorage.clear();
    reloadCalls = 0;
    channel = new FakeChannel();
    setPageBuild("mq-build-aaaa1111");
  });

  afterEach(() => {
    setPageBuild(null);
    vi.restoreAllMocks();
  });

  function makeManager(opts: { fetchImpl?: typeof fetch; channel?: FakeChannel | null; onBeforeReload?: () => void } = {}) {
    return new UpdateManager({
      fetchImpl: opts.fetchImpl,
      broadcastFactory: () => (opts.channel === undefined ? channel : opts.channel) as unknown as BroadcastChannelLike,
      onBeforeReload: opts.onBeforeReload,
      reloadImpl: () => { reloadCalls++; },
      intervalMs: 60_000,
      initialDelayMs: 1_000,
    });
  }

  it("no update: matching buildId → stays current, no broadcast", async () => {
    const fetchImpl = makeFetch({ version: "5", buildId: "mq-build-aaaa1111" });
    const m = makeManager({ fetchImpl });
    await m.checkNow("test");
    expect(m.getState().state).toBe("current");
    expect(m.getState().info?.version).toBe("5");
    expect(channel.sent.length).toBe(0);
  });

  it("new update: different buildId → available + broadcasts to other tabs", async () => {
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl });
    await m.checkNow("test");
    const s = m.getState();
    expect(s.state).toBe("available");
    expect(s.availableBuildId).toBe("mq-build-bbbb2222");
    expect(s.info?.version).toBe("6");
    // Broadcast sent exactly once — no loop
    expect(channel.sent.filter((x) => x.type === "update-available").length).toBe(1);
  });

  it("multi-tab: receiver shows available WITHOUT re-broadcasting (no loop)", async () => {
    // Tab A (this channel) detects
    const fetchA = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl: fetchA });
    await m.checkNow("test");

    // Tab B: separate channel pair, own manager, same page build
    const chanA = new FakeChannel();
    const chanB = new FakeChannel();
    linkTabs(chanA, chanB);
    const mB = new UpdateManager({
      fetchImpl: makeFetch({ version: "6", buildId: "mq-build-bbbb2222" }),
      broadcastFactory: () => chanB as unknown as BroadcastChannelLike,
      reloadImpl: () => { reloadCalls++; },
      intervalMs: 60_000,
      initialDelayMs: 60_000, // don't fire the initial check inside this test
    });
    mB.start(); // subscribes mB's listener to chanB
    // Tab A posts to ITS channel → linked pair delivers to chanB listeners
    chanA.postMessage({ type: "update-available", info: { version: "6", buildId: "mq-build-bbbb2222" } });
    expect(mB.getState().state).toBe("available");
    // B must NOT re-broadcast
    expect(chanB.sent.length).toBe(0);
    mB.stop();
  });

  it("update accepted: snapshot saved, SW skipWaiting, exactly ONE reload", async () => {
    const onBeforeReload = vi.fn();
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl, onBeforeReload });
    await m.checkNow("test");

    const waitingSw = { postMessage: vi.fn() };
    const reg = { update: vi.fn(async () => {}), waiting: waitingSw };
    (navigator as unknown as { serviceWorker?: unknown }).serviceWorker = {
      getRegistration: async () => reg,
      addEventListener: () => {},
    };

    await m.applyUpdate();

    expect(onBeforeReload).toHaveBeenCalledTimes(1);
    expect(waitingSw.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(m.getState().state).toBe("updating");
    // Exactly one reload, guarded by sessionStorage one-shot key
    expect(reloadCalls).toBe(1);
    expect(sessionStorage.getItem("mq-update-reloading")).toBe("1");
    // Other tabs were told an update is in progress
    expect(channel.sent.some((x) => x.type === "update-started")).toBe(true);
    m.stop();
  });

  it("update delayed: dismiss remembers the buildId for this session", async () => {
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl });
    await m.checkNow("test");
    expect(m.getState().state).toBe("available");

    m.dismiss();
    expect(m.getState().state).toBe("current");
    expect(sessionStorage.getItem("mq-update-dismissed")).toBe("mq-build-bbbb2222");

    // Re-check same build → stays quiet
    await m.checkNow("test");
    expect(m.getState().state).toBe("current");

    // A NEWER deployment later in the same session → banner again
    const fetchNewer = makeFetch({ version: "7", buildId: "mq-build-cccc3333" });
    // swap fetch by constructing fresh manager state via direct check
    const m2 = makeManager({ fetchImpl: fetchNewer, channel });
    await m2.checkNow("test");
    expect(m2.getState().state).toBe("available");
    expect(m2.getState().availableBuildId).toBe("mq-build-cccc3333");
    m2.stop();
  });

  it("update failed: snapshot throw → failed state, app not reloaded", async () => {
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl, onBeforeReload: () => { throw new Error("quota"); } });
    await m.checkNow("test");
    await m.applyUpdate();

    expect(m.getState().state).toBe("failed");
    expect(reloadCalls).toBe(0);
    expect(channel.sent.some((x) => x.type === "update-failed")).toBe(true);
  });

  it("reload recovery: still-old build retries are bounded (no infinite loop)", async () => {
    // Simulate boot right after an update reload: guard key set, page still OLD
    sessionStorage.setItem("mq-update-reloading", "1");
    setPageBuild("mq-build-aaaa1111"); // old build still served
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });

    const m = makeManager({ fetchImpl });
    // verifyAfterReload runs inside start(); stub applyUpdate to observe attempts
    const attempts: number[] = [];
    (m as unknown as { applyUpdate: () => Promise<void> }).applyUpdate = async () => {
      attempts.push(1);
    };
    m.start();
    // Attempt 1 fires after ~1.5s
    await new Promise((r) => setTimeout(r, 1700));
    expect(attempts.length).toBe(1);
    expect(sessionStorage.getItem("mq-update-attempts")).toBe("1");
    m.stop();
  });

  it("reload recovery: guard key consumed — verify only runs after an update reload", async () => {
    sessionStorage.removeItem("mq-update-reloading");
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl });
    const spy = vi.fn();
    (m as unknown as { applyUpdate: () => Promise<void> }).applyUpdate = async () => spy();
    m.start();
    await new Promise((r) => setTimeout(r, 300));
    expect(spy).not.toHaveBeenCalled();
    m.stop();
  });

  it("dev server (no buildId) never reports updates", async () => {
    setPageBuild("development");
    const fetchImpl = makeFetch({ version: "6", buildId: "mq-build-bbbb2222" });
    const m = makeManager({ fetchImpl });
    await m.checkNow("test");
    expect(m.getState().state).toBe("current");
    expect(channel.sent.length).toBe(0);
  });

  it("endpoint error → stays current, never throws", async () => {
    const fetchImpl = makeFetch(null, { ok: false });
    const m = makeManager({ fetchImpl });
    await expect(m.checkNow("test")).resolves.toBeUndefined();
    expect(m.getState().state).toBe("current");
  });
});
