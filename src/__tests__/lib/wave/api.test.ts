/**
 * Wave API layer tests (§29, §30, §32): user identity resolution (server
 * side), per-user isolation of the feedback store, user-scoped cache keys,
 * signal parsing/validation, session ownership.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/soundcloud", () => ({
  searchSCTracks: vi.fn(async () => []),
  getSoundCloudClientId: vi.fn(async () => null),
}));

vi.mock("@/lib/music-utils", () => ({
  fetchSCTrackRelated: vi.fn(async () => []),
}));

import { getSession } from "@/lib/get-session";
import {
  resolveWaveUser,
  recordWaveEvent,
  getServerTaste,
  waveCacheKey,
  waveCacheSet,
  waveCacheGet,
  createWaveServerSession,
  getWaveServerSession,
  touchWaveServerSession,
} from "@/lib/wave/server";
import { parseSignals } from "@/lib/wave/route-helpers";

const mockedGetSession = vi.mocked(getSession);

function fakeRequest(params: Record<string, string> = {}, headers: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockedGetSession.mockReset();
});

describe("resolveWaveUser — server-side identity (§30)", () => {
  it("rejects requests with no identity at all", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect(await resolveWaveUser(fakeRequest())).toBeNull();
  });

  it("rejects malformed anon ids (spoofing guard)", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect(await resolveWaveUser(fakeRequest({ anonId: "short" }))).toBeNull();
    expect(await resolveWaveUser(fakeRequest({ anonId: "bad chars!@#" }))).toBeNull();
    expect(await resolveWaveUser(fakeRequest({ anonId: "x".repeat(100) }))).toBeNull();
  });

  it("accepts a valid anonId from the query (anonymous-first model)", async () => {
    mockedGetSession.mockResolvedValue(null);
    const user = await resolveWaveUser(fakeRequest({ anonId: "anon-1234-abcd" }));
    expect(user).toEqual({ userId: "a:anon-1234-abcd", authenticated: false });
  });

  it("accepts a valid anonId from the x-mq-anon-id header", async () => {
    mockedGetSession.mockResolvedValue(null);
    const user = await resolveWaveUser(fakeRequest({}, { "x-mq-anon-id": "hdr-abcd-5678" }));
    expect(user).toEqual({ userId: "a:hdr-abcd-5678", authenticated: false });
  });

  it("a valid session cookie wins over anonId → authenticated user", async () => {
    mockedGetSession.mockResolvedValue({ userId: "real-user-42", role: "user" } as Awaited<ReturnType<typeof getSession>>);
    const user = await resolveWaveUser(fakeRequest({ anonId: "attacker-anon-999" }));
    expect(user).toEqual({ userId: "u:real-user-42", authenticated: true });
  });

  it("session verification failure degrades to the anon path (no crash)", async () => {
    mockedGetSession.mockRejectedValue(new Error("db down"));
    const user = await resolveWaveUser(fakeRequest({ anonId: "fallback-anon-ok" }));
    expect(user).toEqual({ userId: "a:fallback-anon-ok", authenticated: false });
  });
});

describe("per-user feedback store isolation (§30, §32 API)", () => {
  const ev = (over: Record<string, unknown> = {}) =>
    ({
      type: "track_liked",
      trackId: "t1",
      artist: "Shared Artist",
      genre: "pop",
      at: Date.now(),
      ...over,
    }) as Parameters<typeof recordWaveEvent>[1];

  it("user A's events never leak into user B's taste", () => {
    recordWaveEvent("a:user-A", ev());
    recordWaveEvent("a:user-A", ev({ type: "play_completed", artist: "Completed A" }));
    const tasteB = getServerTaste("a:user-B");
    expect(tasteB.artists).toEqual({});
    const tasteA = getServerTaste("a:user-A");
    expect(tasteA.artists["shared artist"]).toBeGreaterThan(0);
    expect(tasteA.artists["completed a"]).toBeGreaterThan(0);
  });

  it("early skips are stronger negatives than late skips (§4)", () => {
    recordWaveEvent("a:skips", ev({ type: "track_skipped", artist: "Early Skipper", position: 4, duration: 200 }));
    recordWaveEvent("a:skips", ev({ type: "track_skipped", artist: "Late Skipper", position: 150, duration: 200 }));
    const taste = getServerTaste("a:skips");
    expect(Math.abs(taste.artists["early skipper"] || 0)).toBeGreaterThan(
      Math.abs(taste.artists["late skipper"] || 0),
    );
  });

  it("more_like_this boosts, less_like_this suppresses + unboosts (§17, §18)", () => {
    recordWaveEvent("a:steer", ev({ type: "more_like_this", artist: "Boosted One" }));
    expect(getServerTaste("a:steer").boostArtists).toContain("boosted one");
    recordWaveEvent("a:steer", ev({ type: "less_like_this", artist: "Boosted One" }));
    const taste = getServerTaste("a:steer");
    expect(taste.boostArtists).not.toContain("boosted one");
    expect(taste.suppressArtists).toContain("boosted one");
  });
});

describe("user-scoped response cache (§22, §30)", () => {
  it("cache keys are user-scoped — different users, different keys", () => {
    const k1 = waveCacheKey("a:user-1", "track:5", "v1.1", "ctx-a");
    const k2 = waveCacheKey("a:user-2", "track:5", "v1.1", "ctx-a");
    expect(k1).not.toBe(k2);
    expect(k1.startsWith("wave:a:user-1:")).toBe(true);
  });

  it("cache set/get round-trips and TTL-expires", () => {
    waveCacheSet("wave:test:key", { hello: 1 }, 60_000);
    expect(waveCacheGet<{ hello: number }>("wave:test:key")).toEqual({ hello: 1 });
    waveCacheSet("wave:test:expired", { x: 1 }, -1);
    expect(waveCacheGet("wave:test:expired")).toBeNull();
  });
});

describe("wave server sessions (§29)", () => {
  it("session records are owned by their creator and touchable", () => {
    const s = createWaveServerSession("u:owner-1", { kind: "taste", label: "Ваш вкус" });
    expect(getWaveServerSession(s.id)?.userId).toBe("u:owner-1");
    touchWaveServerSession(s.id, 12);
    const after = getWaveServerSession(s.id);
    expect(after?.batches).toBe(1);
    expect(after?.tracksServed).toBe(12);
  });

  it("unknown session id → null (no cross-user confirmation)", () => {
    expect(getWaveServerSession("ws_nonexistent")).toBeNull();
  });
});

describe("parseSignals — validation + clamping (§24, §29)", () => {
  it("parses a full valid payload", () => {
    const signals = parseSignals({
      likedArtists: ["A", "B"],
      likedScIds: [1, 2],
      historyScIds: [3, 4],
      excludeIds: ["x1"],
      recentWaveArtists: ["aa"],
      recentWaveGenres: ["gg"],
      recentWaveTrackIds: ["t1"],
      sessionEvents: [{ type: "track_liked", trackId: "t1", at: 1 }],
      seed: { kind: "artist", artist: "A", label: "A" },
      language: "russian",
    });
    expect(signals.likedArtists).toEqual(["A", "B"]);
    expect(signals.seed?.kind).toBe("artist");
    expect(signals.language).toBe("russian");
    expect(signals.sessionEvents).toHaveLength(1);
  });

  it("drops malformed events and clamps oversized arrays", () => {
    const signals = parseSignals({
      sessionEvents: [
        { type: "track_liked", trackId: "ok" },
        { type: "not_a_real_type", trackId: "x" }, // invalid type → filtered
        { trackId: "no-type" }, // missing type → filtered
        "garbage", // not an object → filtered
      ],
      likedArtists: Array.from({ length: 100 }, (_, i) => `A${i}`),
    });
    expect(signals.sessionEvents).toHaveLength(1);
    expect(signals.likedArtists!.length).toBeLessThanOrEqual(10);
  });

  it("rejects invalid language values", () => {
    expect(parseSignals({ language: "klingon" }).language).toBeUndefined();
  });

  it("caps session events at the configured bound (§21 bounded)", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ type: "play_started", trackId: `t${i}`, at: i }));
    expect(parseSignals({ sessionEvents: many }).sessionEvents!.length).toBeLessThanOrEqual(
      300,
    );
  });
});
