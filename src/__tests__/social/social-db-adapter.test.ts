/**
 * Phase 3 regression tests — social DB adapter (src/lib/database.ts).
 *
 * Root cause these tests guard against: the social API routes
 * (now-listening / update-status / sessions / rec-updates) imported the
 * Prisma client directly, so in production (Turso) they silently targeted
 * PostgreSQL/Neon — a split-brain database while every other route used
 * the unified adapter. These tests pin the adapter contract for BOTH
 * backends so the migration cannot silently regress:
 *
 *   - Turso path (isTurso() === true): SQL shape, args, row mapping
 *   - Prisma path (isTurso() === false): same semantics via Prisma models
 *   - guestCount bookkeeping: guarded decrement (no negative counts)
 *   - DB failures propagate (routes catch them)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Module mocks (hoisted) ──────────────────────────────────────────────────
// Prisma client — never constructed in tests.
vi.mock("@/lib/db", () => ({
  db: {
    friend: {
      findMany: vi.fn(),
    },
    listeningStatus: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    liveSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    liveSessionMember: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    userSync: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  prismaRetry: vi.fn((fn: () => unknown) => fn()),
  USE_TURSO: false,
}));

// Turso client — replaced with a controllable fake.
const executeMock = vi.fn();
const batchMock = vi.fn();
vi.mock("@/lib/turso", () => ({
  getTurso: () => ({ execute: executeMock, batch: batchMock }),
  initTursoSchema: vi.fn(),
  ensureTursoSchema: vi.fn(),
  tursoQuery: (fn: () => Promise<unknown>) => fn(),
}));

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

beforeEach(() => {
  process.env.TURSO_DATABASE_URL = "libsql://fake-test-db";
  executeMock.mockReset();
  batchMock.mockReset();
});

afterEach(() => {
  delete process.env.TURSO_DATABASE_URL;
  vi.clearAllMocks();
});

describe("database adapter — Turso path (production backend)", () => {
  it("findAcceptedFriendIds maps both friendship directions to the OTHER user's id", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValue({
      rows: [
        { requesterId: "me", addresseeId: "alice" }, // I sent → friend is alice
        { requesterId: "bob", addresseeId: "me" },   // I received → friend is bob
      ],
    });

    const ids = await database.findAcceptedFriendIds("me");

    expect(ids).toEqual(["alice", "bob"]);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const call = executeMock.mock.calls[0][0];
    expect(call.sql).toContain("status = 'accepted'");
    expect(call.args).toEqual(["me", "me"]);
  });

  it("findActiveListeningStatuses skips the DB entirely for an empty friend list", async () => {
    const { database } = await import("@/lib/database");
    const result = await database.findActiveListeningStatuses([], Date.now() - 300_000);
    expect(result).toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("findActiveListeningStatuses joins User and maps row → status + user, passing an ISO cutoff", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValue({
      rows: [
        {
          id: "s1", userId: "u1", trackId: "t1", trackTitle: "Song", trackArtist: "Artist",
          trackCover: "cover.jpg", scTrackId: 42, isPlaying: 1, progress: 12.5,
          duration: 200, source: "soundcloud", updatedAt: "2026-09-03T10:00:00.000Z",
          u_id: "u1", u_username: "alice", u_avatar: "a.png",
        },
      ],
    });

    const sinceMs = Date.parse("2026-09-03T09:55:00.000Z");
    const result = await database.findActiveListeningStatuses(["u1"], sinceMs);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: "u1",
      trackTitle: "Song",
      scTrackId: 42,
      isPlaying: true, // INTEGER 1 → boolean
      progress: 12.5,
      user: { id: "u1", username: "alice", avatar: "a.png" },
    });
    const call = executeMock.mock.calls[0][0];
    expect(call.sql).toContain("JOIN User u");
    expect(call.args[1]).toBe(new Date(sinceMs).toISOString());
    expect(ISO_RE.test(call.args[1])).toBe(true);
  });

  it("upsertListeningStatus INSERTs when the user has no status row yet", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValueOnce({ rows: [] }); // existence check → absent
    executeMock.mockResolvedValueOnce({ rows: [] }); // insert

    await database.upsertListeningStatus("u1", {
      trackId: "t1", trackTitle: "Song", trackArtist: "Artist", trackCover: "",
      scTrackId: null, isPlaying: true, progress: 0, duration: 180, source: "soundcloud",
    });

    const insertCall = executeMock.mock.calls[1][0];
    expect(insertCall.sql).toContain("INSERT INTO ListeningStatus");
    expect(insertCall.args[0]).toMatch(/^c/); // cuid-like id
    expect(insertCall.args[1]).toBe("u1");
  });

  it("upsertListeningStatus UPDATEs the existing row (one status per user)", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValueOnce({ rows: [{ id: "existing" }] });
    executeMock.mockResolvedValueOnce({ rows: [] });

    await database.upsertListeningStatus("u1", {
      trackId: "t2", trackTitle: "Song2", trackArtist: "Artist2", trackCover: "c",
      scTrackId: 7, isPlaying: false, progress: 30, duration: 200, source: "soundcloud",
    });

    const updateCall = executeMock.mock.calls[1][0];
    expect(updateCall.sql).toContain("UPDATE ListeningStatus");
    expect(updateCall.sql).toContain("WHERE userId = ?");
    // SET order: trackId, trackTitle, trackArtist, trackCover, scTrackId, isPlaying, progress, duration, source, updatedAt
    expect(updateCall.args[5]).toBe(0); // isPlaying false → 0 for libSQL INTEGER
    expect(updateCall.args[6]).toBe(30); // progress
    expect(ISO_RE.test(updateCall.args[9])).toBe(true); // updatedAt ISO
    expect(updateCall.args[10]).toBe("u1"); // WHERE userId
  });

  it("createLiveSession writes session + host member atomically (batch, mode write) and reports guestCount 1", async () => {
    const { database } = await import("@/lib/database");
    batchMock.mockResolvedValue([{}, {}]);

    const session = await database.createLiveSession(
      {
        hostId: "host1", code: "ABC234", trackId: "t1", trackTitle: "Song",
        trackArtist: "Artist", trackCover: "", scTrackId: null, audioUrl: "",
        source: "soundcloud",
      },
      { username: "host", avatar: "h.png" }
    );

    expect(batchMock).toHaveBeenCalledTimes(1);
    const [stmts, mode] = batchMock.mock.calls[0];
    expect(mode).toBe("write");
    expect(stmts).toHaveLength(2);
    expect(stmts[0].sql).toContain("INSERT INTO LiveSession");
    expect(stmts[1].sql).toContain("INSERT INTO LiveSessionMember");
    expect(stmts[1].args[2]).toBe("host1"); // member userId = host

    expect(session).toMatchObject({ id: expect.any(String), code: "ABC234", guestCount: 1, progress: 0, isPlaying: true });
  });

  it("addLiveSessionMember batches member insert + guestCount increment", async () => {
    const { database } = await import("@/lib/database");
    batchMock.mockResolvedValue([{}, {}]);

    await database.addLiveSessionMember("sess1", "guest1", "guest", "g.png");

    const [stmts, mode] = batchMock.mock.calls[0];
    expect(mode).toBe("write");
    expect(stmts[0].sql).toContain("INSERT INTO LiveSessionMember");
    expect(stmts[1].sql).toContain("guestCount = guestCount + 1");
    expect(stmts[1].args[1]).toBe("sess1");
  });

  it("removeLiveSessionMember leaves guestCount untouched when the user was not a member (no negative counts)", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValueOnce({ rows: [], rowsAffected: 0 }); // delete → nothing removed

    const removed = await database.removeLiveSessionMember("sess1", "ghost");

    expect(removed).toBe(false);
    expect(executeMock).toHaveBeenCalledTimes(1); // no decrement UPDATE issued
  });

  it("removeLiveSessionMember decrements guestCount when a member row is removed", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });
    executeMock.mockResolvedValueOnce({ rows: [] });

    const removed = await database.removeLiveSessionMember("sess1", "guest1");

    expect(removed).toBe(true);
    const updateCall = executeMock.mock.calls[1][0];
    expect(updateCall.sql).toContain("guestCount = MAX(guestCount - 1, 0)");
  });

  it("findUserSyncDataByKeys queries only the requested keys", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockResolvedValue({
      rows: [
        { id: "r1", userId: "u1", key: "likedTrackIds", data: '["a","b"]', updatedAt: "2026-09-03T10:00:00.000Z" },
        { id: "r2", userId: "u1", key: "history", data: "[]", updatedAt: "2026-09-03T09:00:00.000Z" },
      ],
    });

    const rows = await database.findUserSyncDataByKeys("u1", ["likedTrackIds", "dislikedTrackIds", "history"]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: "likedTrackIds", data: '["a","b"]' });
    const call = executeMock.mock.calls[0][0];
    expect(call.sql).toContain("key IN (?,?,?)");
    expect(call.args).toEqual(["u1", "likedTrackIds", "dislikedTrackIds", "history"]);
  });

  it("adapter propagates DB failures instead of swallowing them (routes do the catching)", async () => {
    const { database } = await import("@/lib/database");
    executeMock.mockRejectedValue(new Error("libsql: network error"));

    await expect(database.findAcceptedFriendIds("u1")).rejects.toThrow("network error");
  });
});

describe("database adapter — Prisma path (local dev backend)", () => {
  beforeEach(() => {
    delete process.env.TURSO_DATABASE_URL;
  });

  it("findAcceptedFriendIds merges sent + received friendships", async () => {
    const { db } = await import("@/lib/db");
    const { database } = await import("@/lib/database");
    vi.mocked(db.friend.findMany)
      .mockResolvedValueOnce([{ addresseeId: "alice" } as never])
      .mockResolvedValueOnce([{ requesterId: "bob" } as never]);

    const ids = await database.findAcceptedFriendIds("me");

    expect(ids).toEqual(["alice", "bob"]);
    expect(db.friend.findMany).toHaveBeenCalledWith({
      where: { requesterId: "me", status: "accepted" },
      select: { addresseeId: true },
    });
    expect(db.friend.findMany).toHaveBeenCalledWith({
      where: { addresseeId: "me", status: "accepted" },
      select: { requesterId: true },
    });
  });

  it("upsertListeningStatus delegates to prisma.listeningStatus.upsert with identical create/update payloads", async () => {
    const { db } = await import("@/lib/db");
    const { database } = await import("@/lib/database");
    vi.mocked(db.listeningStatus.upsert).mockResolvedValue({} as never);

    await database.upsertListeningStatus("u1", {
      trackId: "t1", trackTitle: "Song", trackArtist: "Artist", trackCover: "c",
      scTrackId: 5, isPlaying: true, progress: 1, duration: 2, source: "soundcloud",
    });

    expect(db.listeningStatus.upsert).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(db.listeningStatus.upsert).mock.calls[0][0] as Record<string, unknown>;
    expect(arg.where).toEqual({ userId: "u1" });
    const create = arg.create as Record<string, unknown>;
    const update = arg.update as Record<string, unknown>;
    // create = payload + userId (the row's owner); update = payload only
    expect(create.userId).toBe("u1");
    expect({ ...create, userId: undefined }).toEqual({ ...update, userId: undefined });
    expect(update.trackId).toBe("t1");
    expect(create.isPlaying).toBe(true);
  });

  it("removeLiveSessionMember skips the decrement when deleteMany removes nothing", async () => {
    const { db } = await import("@/lib/db");
    const { database } = await import("@/lib/database");
    vi.mocked(db.liveSessionMember.deleteMany).mockResolvedValue({ count: 0 } as never);

    const removed = await database.removeLiveSessionMember("s1", "ghost");

    expect(removed).toBe(false);
    expect(db.liveSession.update).not.toHaveBeenCalled();
  });
});

describe("social schema — Turso init includes the Phase 3 tables", () => {
  it("initTursoSchema script creates ListeningStatus, LiveSession and LiveSessionMember", async () => {
    // Source-level guard: production relies on these tables existing in Turso.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tursoSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/turso.ts"),
      "utf-8"
    );
    expect(tursoSrc).toContain("CREATE TABLE IF NOT EXISTS ListeningStatus");
    expect(tursoSrc).toContain("CREATE TABLE IF NOT EXISTS LiveSession");
    expect(tursoSrc).toContain("CREATE TABLE IF NOT EXISTS LiveSessionMember");
    expect(tursoSrc).toContain("UNIQUE(sessionId, userId)");
  });
});
