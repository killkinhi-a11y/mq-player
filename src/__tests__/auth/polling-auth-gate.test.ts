/**
 * Phase 2C regression tests — protected-route polling auth gate.
 *
 * Root cause these tests guard against: demo mode sets
 * `isAuthenticated: true` + `userId: "demo-user-id"`, and every polling
 * hook used those two flags alone to decide whether to poll protected API
 * routes. Demo sessions (no session cookie) therefore polled forever:
 * 401 → retry → 401 → … (~650 wasted requests measured in 2.5 minutes of
 * anonymous/demo mode on production).
 *
 * Spec:
 *   AUTHENTICATED → polling allowed
 *   DEMO / UNAUTHENTICATED → protected polling disabled
 *   401 → controlled recovery → stop repeated requests
 *   login resumes polling; logout stops polling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  canPollProtected,
  isDemoUser,
  suspendPolling,
  isPollingSuspended,
  getPollingSuspensionReason,
  resetPollingSuspension,
  controlled401Recovery,
} from "@/lib/authGate";

beforeEach(() => {
  resetPollingSuspension();
});

afterEach(() => {
  resetPollingSuspension();
  vi.restoreAllMocks();
});

describe("authGate — demo / unauthenticated sessions never poll", () => {
  it("unauthenticated user does not poll protected routes (gate blocks before any fetch)", async () => {
    expect(canPollProtected(null, false)).toBe(false);
    expect(canPollProtected(undefined, false)).toBe(false);
    // No fetch should even be attempted — simulate the poller contract:
    // hooks call canPollProtected() BEFORE fetch().
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { updateMyListeningStatus } = await import("@/hooks/useFriendsListening");
    await updateMyListeningStatus(
      { id: "t1", title: "x", artist: "y", album: "", cover: "", audioUrl: "", duration: 1, genre: "", source: "soundcloud" },
      true, 0, 1,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("demo session (isAuthenticated=true, userId=demo-user-id) is treated as NOT pollable", () => {
    expect(isDemoUser("demo-user-id")).toBe(true);
    // This is the exact store shape demo login produces — must be false.
    expect(canPollProtected("demo-user-id", true)).toBe(false);
  });

  it("real authenticated session is pollable", () => {
    expect(isDemoUser("user-abc")).toBe(false);
    expect(canPollProtected("user-abc", true)).toBe(true);
  });

  it("store sync actions are no-ops for demo sessions (no 401 round-trips)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    const { useAppStore } = await import("@/store/useAppStore");
    useAppStore.getState().setAuth("demo-user-id", "Демо", "demo@mq-player.internal");
    const fetchSpy = vi.mocked(globalThis.fetch);
    fetchSpy.mockClear();
    await useAppStore.getState().syncToServer();
    await useAppStore.getState().syncFeedbackToServer();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("authGate — 401 stops polling (controlled recovery)", () => {
  it("a 401 suspends polling: no repeated requests after the first failure", () => {
    expect(canPollProtected("user-abc", true)).toBe(true);

    // First 401 arrives → controlled recovery suspends the gate.
    suspendPolling("401 from social/now-listening");

    expect(isPollingSuspended()).toBe(true);
    expect(canPollProtected("user-abc", true)).toBe(false); // ← loop broken here
    expect(getPollingSuspensionReason()).toContain("now-listening");
  });

  it("controlled401Recovery probes /api/auth/me exactly once and keeps the gate suspended when the session is dead", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    // Two pollers hit 401 at the "same" time — the probe must be single-flight.
    await Promise.all([
      controlled401Recovery("a"),
      controlled401Recovery("b"),
    ]);

    // exactly ONE recovery probe — no retry loop
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/auth/me");
    expect(isPollingSuspended()).toBe(true);
    expect(canPollProtected("user-abc", true)).toBe(false);
  });

  it("a transient 401 (auth/me still OK) resumes polling immediately", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: {} }),
    } as Response);

    suspendPolling("401 from messages/unread-count");
    await controlled401Recovery("messages/unread-count");

    expect(isPollingSuspended()).toBe(false);
    expect(canPollProtected("user-abc", true)).toBe(true);
  });
});

describe("authGate — login resumes polling, logout stops polling", () => {
  it("login (setAuth) resets the suspension — polling resumes for real sessions", async () => {
    suspendPolling("401 from social/rec-updates");
    expect(canPollProtected("user-xyz", true)).toBe(false);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    const { useAppStore } = await import("@/store/useAppStore");
    useAppStore.getState().setAuth("user-xyz", "u", "e@x.com");
    useAppStore.getState().logout();

    // after logout: definitely not pollable
    expect(canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)).toBe(false);

    // fresh login: gate is clean again → polling allowed
    useAppStore.getState().setAuth("user-xyz", "u", "e@x.com");
    expect(isPollingSuspended()).toBe(false);
    expect(canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)).toBe(true);
  });

  it("logout clears authenticated state so canPollProtected is false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    const { useAppStore } = await import("@/store/useAppStore");
    useAppStore.getState().setAuth("user-1", "u", "e@x.com");
    useAppStore.getState().logout();
    const s = useAppStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(canPollProtected(s.userId, s.isAuthenticated)).toBe(false);
  });
});
