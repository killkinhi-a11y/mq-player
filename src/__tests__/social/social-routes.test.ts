/**
 * Phase 3 regression tests — social API routes.
 *
 * Pins the route contract after the Prisma→adapter migration:
 *   - authorization: no session → 401 (same bodies as before)
 *   - host-only guard on session updates → 403
 *   - 404 for unknown sessions
 *   - DB failure → graceful fallback responses (not crashes)
 *   - response shapes byte-identical to the pre-migration routes
 *   - import boundary: social routes must import @/lib/database, never @/lib/db
 *
 * The adapter (@/lib/database) is mocked here on purpose — its dual-backend
 * contract has its own test file (social-db-adapter.test.ts). These tests
 * verify ROUTE behavior: auth, status codes, error handling, mapping.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Module mocks (hoisted) ──────────────────────────────────────────────────
vi.mock("@/lib/database", () => ({
  database: {
    findAcceptedFriendIds: vi.fn(),
    findActiveListeningStatuses: vi.fn(),
    upsertListeningStatus: vi.fn(),
    findActiveLiveSessions: vi.fn(),
    findLiveSessionById: vi.fn(),
    findLiveSessionIdByCode: vi.fn(),
    findLiveSessionMembers: vi.fn(),
    createLiveSession: vi.fn(),
    updateLiveSession: vi.fn(),
    deleteLiveSession: vi.fn(),
    addLiveSessionMember: vi.fn(),
    removeLiveSessionMember: vi.fn(),
    findUserSyncDataByKeys: vi.fn(),
    findUserById: vi.fn(),
  },
  isTurso: vi.fn(() => false),
  getTursoClient: vi.fn(),
  tursoQuery: vi.fn(),
  ensureTursoSchema: vi.fn(),
}));

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

// Rate limiter → passthrough so tests exercise the real handler logic.
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_preset: unknown, handler: unknown) => handler,
  rateLimit: vi.fn(() => ({ success: true, limit: 60, remaining: 59, resetIn: 0 })),
  RATE_LIMITS: {
    auth: { limit: 10, window: 60 },
    upload: { limit: 5, window: 60 },
    read: { limit: 60, window: 60 },
    write: { limit: 30, window: 60 },
    search: { limit: 20, window: 60 },
  },
}));

const SESSION = { userId: "u1", username: "user1", role: "user" };

// Routes are the rate-limit passthrough of the real handler (req, ctx).
type RouteHandler = (
  req: Request,
  ctx?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

async function sessionFor(user: typeof SESSION | null) {
  const { getSession } = await import("@/lib/get-session");
  vi.mocked(getSession).mockResolvedValue(user);
  return getSession;
}

async function getDb() {
  const { database } = await import("@/lib/database");
  return database as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("now-listening — auth + fallback parity", () => {
  it("returns 401 with friends:[] when unauthenticated", async () => {
    await sessionFor(null);
    const { GET } = (await import("@/app/api/social/now-listening/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/now-listening"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ friends: [] });
  });

  it("maps adapter rows to the exact pre-migration response shape", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findAcceptedFriendIds.mockResolvedValue(["u2"]);
    db.findActiveListeningStatuses.mockResolvedValue([
      {
        id: "s1", userId: "u2", trackId: "t1", trackTitle: "Song", trackArtist: "Artist",
        trackCover: "c.jpg", scTrackId: 42, isPlaying: true, progress: 10,
        duration: 200, source: "soundcloud", updatedAt: "2026-09-03T10:00:00.000Z",
        user: { id: "u2", username: "alice", avatar: "a.png" },
      },
    ]);
    const { GET } = (await import("@/app/api/social/now-listening/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/now-listening"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toEqual([
      {
        userId: "u2", username: "alice", avatar: "a.png", trackTitle: "Song",
        trackArtist: "Artist", trackCover: "c.jpg", isPlaying: true,
        progress: 10, duration: 200, scTrackId: 42,
      },
    ]);
    // 5-minute window handed to the adapter
    const since = db.findActiveListeningStatuses.mock.calls[0][1] as number;
    expect(Date.now() - since).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000);
    expect(Date.now() - since).toBeLessThan(5 * 60 * 1000 + 1000);
  });

  it("DB failure degrades to friends:[] (no 500 crash)", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findAcceptedFriendIds.mockRejectedValue(new Error("turso down"));
    const { GET } = (await import("@/app/api/social/now-listening/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/now-listening"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ friends: [] });
  });

  it("no friends → empty list without querying statuses", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findAcceptedFriendIds.mockResolvedValue([]);
    const { GET } = (await import("@/app/api/social/now-listening/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/now-listening"));
    expect(await res.json()).toEqual({ friends: [] });
    expect(db.findActiveListeningStatuses).not.toHaveBeenCalled();
  });
});

describe("update-status — auth + validation parity", () => {
  it("returns 401 when unauthenticated", async () => {
    await sessionFor(null);
    const { POST } = (await import("@/app/api/social/update-status/route")) as unknown as { POST: RouteHandler };

    const res = await POST(new Request("http://localhost/api/social/update-status", {
      method: "POST",
      body: JSON.stringify({ trackId: "t1", trackTitle: "S", trackArtist: "A" }),
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects missing required fields with 400", async () => {
    await sessionFor(SESSION);
    const { POST } = (await import("@/app/api/social/update-status/route")) as unknown as { POST: RouteHandler };

    const res = await POST(new Request("http://localhost/api/social/update-status", {
      method: "POST",
      body: JSON.stringify({ trackId: "t1" }),
    }));
    expect(res.status).toBe(400);
  });

  it("upserts the listening status and returns { ok: true }", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.upsertListeningStatus.mockResolvedValue(undefined);
    const { POST } = (await import("@/app/api/social/update-status/route")) as unknown as { POST: RouteHandler };

    const res = await POST(new Request("http://localhost/api/social/update-status", {
      method: "POST",
      body: JSON.stringify({ trackId: "t1", trackTitle: "S", trackArtist: "A", progress: 5 }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.upsertListeningStatus).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ trackId: "t1", progress: 5, isPlaying: true })
    );
  });
});

describe("sessions — auth + creation parity", () => {
  it("GET returns 401 when unauthenticated", async () => {
    await sessionFor(null);
    const { GET } = (await import("@/app/api/social/sessions/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/sessions"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ sessions: [] });
  });

  it("GET includes own id in host list (own sessions visible)", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findAcceptedFriendIds.mockResolvedValue(["u2"]);
    db.findActiveLiveSessions.mockResolvedValue([]);
    const { GET } = (await import("@/app/api/social/sessions/route")) as unknown as { GET: RouteHandler };

    await GET(new Request("http://localhost/api/social/sessions"));
    const hostIds = db.findActiveLiveSessions.mock.calls[0][0] as string[];
    expect(hostIds).toContain("u1");
    expect(hostIds).toContain("u2");
  });

  it("POST rejects missing track fields with 400", async () => {
    await sessionFor(SESSION);
    const { POST } = (await import("@/app/api/social/sessions/route")) as unknown as { POST: RouteHandler };

    const res = await POST(new Request("http://localhost/api/social/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("POST returns 404 when the host user no longer exists", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findUserById.mockResolvedValue(null);
    const { POST } = (await import("@/app/api/social/sessions/route")) as unknown as { POST: RouteHandler };

    const res = await POST(new Request("http://localhost/api/social/sessions", {
      method: "POST",
      body: JSON.stringify({ trackId: "t", trackTitle: "S", trackArtist: "A" }),
    }));
    expect(res.status).toBe(404);
  });
});

describe("sessions/[id] — host guard + join + leave", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("GET returns 404 for an unknown session", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findLiveSessionById.mockResolvedValue(null);
    const { GET } = (await import("@/app/api/social/sessions/[id]/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/sessions/s404"), ctx("s404"));
    expect(res.status).toBe(404);
  });

  it("POST returns 403 when a non-host tries to update playback", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findLiveSessionById.mockResolvedValue({ id: "s1", hostId: "someoneelse" });
    const { POST } = (await import("@/app/api/social/sessions/[id]/route")) as unknown as { POST: RouteHandler };

    const res = await POST(
      new Request("http://localhost/api/social/sessions/s1", { method: "POST", body: JSON.stringify({ isPlaying: false }) }),
      ctx("s1")
    );
    expect(res.status).toBe(403);
    expect(db.updateLiveSession).not.toHaveBeenCalled();
  });

  it("GET with matching ?code= joins the session (member added, then members refreshed)", async () => {
    await sessionFor({ ...SESSION, userId: "guest1" });
    const db = await getDb();
    db.findLiveSessionById
      .mockResolvedValueOnce({ id: "s1", hostId: "host1", code: "ABC123" })
      .mockResolvedValueOnce({
        id: "s1", hostId: "host1", code: "ABC123", trackId: "t1", trackTitle: "S",
        trackArtist: "A", trackCover: "", scTrackId: null, audioUrl: "", source: "soundcloud",
        progress: 0, isPlaying: true, guestCount: 2, createdAt: "x", updatedAt: "x",
      });
    db.findLiveSessionMembers
      .mockResolvedValueOnce([{ userId: "host1", username: "host", avatar: "", id: "m1", sessionId: "s1", joinedAt: "x", lastSyncAt: "x" }])
      .mockResolvedValueOnce([
        { userId: "host1", username: "host", avatar: "", id: "m1", sessionId: "s1", joinedAt: "x", lastSyncAt: "x" },
        { userId: "guest1", username: "user1", avatar: "", id: "m2", sessionId: "s1", joinedAt: "x", lastSyncAt: "x" },
      ]);
    db.findUserById.mockResolvedValue({ id: "guest1", username: "user1", avatar: "" });
    db.addLiveSessionMember.mockResolvedValue(undefined);
    const { GET } = (await import("@/app/api/social/sessions/[id]/route")) as unknown as { GET: RouteHandler };

    const res = await GET(
      new Request("http://localhost/api/social/sessions/s1?code=ABC123"),
      ctx("s1")
    );
    expect(res.status).toBe(200);
    expect(db.addLiveSessionMember).toHaveBeenCalledWith("s1", "guest1", "user1", "");
    const body = await res.json();
    expect(body.session.members).toHaveLength(2);
    expect(body.session.isHost).toBe(false);
  });

  it("DELETE removes the whole session when the host leaves", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findLiveSessionById.mockResolvedValue({ id: "s1", hostId: "u1" });
    db.deleteLiveSession.mockResolvedValue(undefined);
    const { DELETE } = (await import("@/app/api/social/sessions/[id]/route")) as unknown as { DELETE: RouteHandler };

    const res = await DELETE(new Request("http://localhost/api/social/sessions/s1", { method: "DELETE" }), ctx("s1"));
    expect(res.status).toBe(200);
    expect(db.deleteLiveSession).toHaveBeenCalledWith("s1");
    expect(db.removeLiveSessionMember).not.toHaveBeenCalled();
  });

  it("DELETE removes only the member when a guest leaves", async () => {
    await sessionFor({ ...SESSION, userId: "guest1" });
    const db = await getDb();
    db.findLiveSessionById.mockResolvedValue({ id: "s1", hostId: "host1" });
    db.removeLiveSessionMember.mockResolvedValue(true);
    const { DELETE } = (await import("@/app/api/social/sessions/[id]/route")) as unknown as { DELETE: RouteHandler };

    const res = await DELETE(new Request("http://localhost/api/social/sessions/s1", { method: "DELETE" }), ctx("s1"));
    expect(res.status).toBe(200);
    expect(db.removeLiveSessionMember).toHaveBeenCalledWith("s1", "guest1");
    expect(db.deleteLiveSession).not.toHaveBeenCalled();
  });
});

describe("rec-updates — hash parity", () => {
  it("returns 401 with empty hash when unauthenticated", async () => {
    await sessionFor(null);
    const { GET } = (await import("@/app/api/social/rec-updates/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/rec-updates"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.hash).toBe("");
  });

  it("computes the same likes:dislikes:history:ts hash format", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findUserSyncDataByKeys.mockResolvedValue([
      { id: "r1", userId: "u1", key: "likedTrackIds", data: '["a","b","c"]', updatedAt: "2026-09-03T10:00:00.000Z" },
      { id: "r2", userId: "u1", key: "dislikedTrackIds", data: '["x"]', updatedAt: "2026-09-03T09:00:00.000Z" },
      { id: "r3", userId: "u1", key: "history", data: "[]", updatedAt: "2026-09-03T08:00:00.000Z" },
    ]);
    const { GET } = (await import("@/app/api/social/rec-updates/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/rec-updates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.likes).toBe(3);
    expect(body.dislikes).toBe(1);
    expect(body.history).toBe(0);
    expect(body.hash).toBe(`3:1:0:${Date.parse("2026-09-03T10:00:00.000Z")}`);
    // Only the three expected keys requested
    expect(db.findUserSyncDataByKeys).toHaveBeenCalledWith("u1", ["likedTrackIds", "dislikedTrackIds", "history"]);
  });

  it("DB failure degrades to an empty hash (client keeps its cached recommendations)", async () => {
    await sessionFor(SESSION);
    const db = await getDb();
    db.findUserSyncDataByKeys.mockRejectedValue(new Error("db down"));
    const { GET } = (await import("@/app/api/social/rec-updates/route")) as unknown as { GET: RouteHandler };

    const res = await GET(new Request("http://localhost/api/social/rec-updates"));
    expect(res.status).toBe(200);
    expect((await res.json()).hash).toBe("");
  });
});

describe("import boundary — social routes never bypass the adapter", () => {
  it("the 5 social routes import @/lib/database and never @/lib/db", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const routes = [
      "src/app/api/social/now-listening/route.ts",
      "src/app/api/social/update-status/route.ts",
      "src/app/api/social/sessions/route.ts",
      "src/app/api/social/sessions/[id]/route.ts",
      "src/app/api/social/rec-updates/route.ts",
    ];
    for (const rel of routes) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
      expect(src, `${rel} must not import the Prisma client directly`).not.toContain('from "@/lib/db"');
      expect(src, `${rel} must use the unified adapter`).toContain('from "@/lib/database"');
    }
  });
});
