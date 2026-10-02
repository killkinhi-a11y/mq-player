/**
 * @vitest-environment node
 *
 * Import engine integration tests (src/lib/yandex/importEngine.ts):
 * job state machine + persistence against a REAL local libsql (SQLite) file
 * database — the same driver used in production (Turso).
 *
 * Mocked boundaries:
 *   - @/lib/yandex/adapter   → canned Yandex playlists/tracks
 *   - @/lib/soundcloud       → canned SoundCloud search results
 *
 * Covered (Phase 10 IMPORT matrix): correct order, duplicates, partial
 * failure, retry, repeated import (re-import detection), conflict
 * copy/merge, ambiguous resolution, source metadata, cancel.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import type { Track } from "@/lib/musicApi";

process.env.JWT_SECRET = "engine-test-secret-0123456789abcdefghij";
process.env.TURSO_DATABASE_URL = `file:/tmp/mq-yandex-engine-${process.pid}.db`;

const adapterMock = vi.hoisted(() => ({
  adapterPlaylistTracks: vi.fn(),
  adapterPlaylistsList: vi.fn(),
}));
vi.mock("@/lib/yandex/adapter", () => adapterMock);

const searchMock = vi.hoisted(() => ({
  searchSCTracks: vi.fn(),
}));
vi.mock("@/lib/soundcloud", () => searchMock);

import {
  advanceImportJob,
  resolveAmbiguousTrack,
  getImportDetail,
  type ImportJobData,
  type JobPlaylist,
} from "@/lib/yandex/importEngine";
import { newReport } from "@/lib/yandex/importEngine";
import {
  upsertAccount,
  getAccount,
  createJob,
  getJob,
  updateJob,
  getCompletedImportKinds,
  getTokenForUser,
} from "@/lib/yandex/store";
import { encryptSecret } from "@/lib/yandex/token-crypto";
import { isTurso, getTursoClient, ensureTursoSchema } from "@/lib/database";
import { YandexError } from "@/lib/yandex/types";

// ── helpers ──────────────────────────────────────────────────────────────────

let userId: string;

function makeUser(): string {
  const id = `u_${randomUUID().slice(0, 12)}`;
  return id;
}

function sc(id: string, title: string, artist: string, duration = 200): Track {
  return {
    id,
    title,
    artist,
    album: "",
    duration,
    cover: "",
    genre: "",
    audioUrl: "",
    previewUrl: "",
    source: "soundcloud",
    scTrackId: Number(id.replace("sc_", "")),
    scStreamPolicy: "ALLOW",
    scIsFull: true,
  };
}

function yandexPlaylist(
  kind: number,
  tracks: Array<{ title: string; artists: string[]; durationMs?: number }>,
  title = `Yandex Playlist ${kind}`
): { kind: number; title: string; tracks: Array<Record<string, unknown>> } {
  return {
    kind,
    title,
    // camelCase — the TS adapter (src/lib/yandex/adapter.ts) contract
    tracks: tracks.map((t, i) => ({
      position: i,
      trackId: String(100000 + kind * 100 + i),
      albumId: "5000",
      title: t.title,
      artists: t.artists,
      albumTitle: "Album",
      albumIdFull: "5000",
      durationMs: t.durationMs ?? 200000,
      available: true,
    })),
  };
}

function jobPlaylist(p: Partial<JobPlaylist> & { kind: number }): JobPlaylist {
  return {
    uid: null,
    title: p.title ?? "Playlist",
    description: "",
    coverUrl: "",
    trackCount: 0,
    ownerLogin: "yandexuser",
    conflictMode: "copy",
    fetched: false,
    matchCursor: 0,
    imported: false,
    ...p,
  } as JobPlaylist;
}

async function createTestJob(playlists: JobPlaylist[]): Promise<string> {
  const data: ImportJobData = { playlists, phase: "fetching", report: newReport() };
  return createJob(userId, data);
}

/** Drive the job to a terminal state with a bounded number of advances. */
async function runToCompletion(jobId: string, maxSteps = 60): Promise<{
  status: string;
  steps: number;
}> {
  let steps = 0;
  let last = "";
  while (steps < maxSteps) {
    const snap = await advanceImportJob(userId, jobId);
    last = snap.status;
    steps++;
    if (["completed", "completed_with_errors", "failed", "cancelled"].includes(last)) {
      return { status: last, steps };
    }
  }
  return { status: `stuck:${last}`, steps };
}

async function readPlaylistRow(playlistId: string): Promise<{ name: string; tracksJson: string; userId: string } | null> {
  const t = getTursoClient();
  const r = await t.execute({ sql: "SELECT * FROM Playlist WHERE id = ?", args: [playlistId] });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    name: String(row.name),
    tracksJson: String(row.tracksJson ?? "[]"),
    userId: String(row.userId),
  };
}

async function insertPlaylistRow(uid: string, name: string, tracks: unknown[]): Promise<string> {
  const id = `pl_${randomUUID().slice(0, 10)}`;
  const t = getTursoClient();
  const now = new Date().toISOString();
  await t.execute({
    sql: `INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt)
          VALUES (?,?,?,?,?,0,'',?,0,?,?)`,
    args: [id, uid, name, "", "", JSON.stringify(tracks), now, now],
  });
  return id;
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  expect(isTurso()).toBe(true);
  await ensureTursoSchema();
  // Seed a user row (FK safety) + link a Yandex account with a known token
  userId = makeUser();
  const t = getTursoClient();
  await t.execute({
    sql: `INSERT INTO User (id, username, email, password, confirmed, role, createdAt)
          VALUES (?,?,?,?,1,'user',?)`,
    args: [userId, `user_${userId.slice(2, 10)}`, `${userId}@test.local`, "x", new Date().toISOString()],
  });
  await upsertAccount(userId, {
    yandexUid: "777",
    login: "yandex.login",
    displayName: "Yandex Login",
    accessTokenEnc: encryptSecret("test-access-token"),
    refreshTokenEnc: encryptSecret("test-refresh-token"),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
});

beforeEach(() => {
  adapterMock.adapterPlaylistTracks.mockReset();
  adapterMock.adapterPlaylistsList.mockReset();
  searchMock.searchSCTracks.mockReset().mockResolvedValue([]);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("import engine: happy path", () => {
  it("imports a playlist with order preserved and source metadata", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(
        1001,
        [
          { title: "Song A", artists: ["Artist A"] },
          { title: "Song B", artists: ["Artist B"] },
          { title: "Song C", artists: ["Artist C"] },
        ],
        "Mix 1001"
      )
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) => {
      if (q.includes("Song A")) return [sc("sc_11", "Song A", "Artist A")];
      if (q.includes("Song B")) return [sc("sc_22", "Song B", "Artist B")];
      if (q.includes("Song C")) return [sc("sc_33", "Song C", "Artist C")];
      return [];
    });

    const jobId = await createTestJob([jobPlaylist({ kind: 1001, title: "Mix 1001" })]);
    const { status, steps } = await runToCompletion(jobId);
    expect(status).toBe("completed");
    expect(steps).toBeGreaterThan(2); // fetch + ≥1 match chunk + import + terminal

    const job = await getJob(userId, jobId);
    expect(job?.status).toBe("completed");
    const data = JSON.parse(job!.data) as ImportJobData;
    const created = data.report.createdPlaylists[0]!;
    expect(created.name).toBe("Mix 1001");

    const row = await readPlaylistRow(created.playlistId);
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(userId);
    const tracks = JSON.parse(row!.tracksJson);
    // ORDER: exactly the Yandex order (A, B, C)
    expect(tracks.map((t: Track) => t.title)).toEqual(["Song A", "Song B", "Song C"]);
    // SOURCE METADATA on every track
    for (const t of tracks) {
      expect(t._src).toBe("yandex_music");
      expect(t._srcTrackId).toBeTruthy();
      expect(t._srcPlaylistKind).toBe(1001);
    }
    // report
    expect(data.report.tracksFound).toBe(3);
    expect(data.report.tracksImported).toBe(3);
    expect(data.report.tracksAmbiguous).toBe(0);
    expect(data.report.tracksUnmatched).toBe(0);
  });

  it("matched + ambiguous + unmatched tracks produce an honest report", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(1002, [
        { title: "Exact Song", artists: ["Exact Artist"] },        // → matched
        { title: "Sunshyne", artists: ["Alfa"] },                  // → ambiguous (typo pair)
        { title: "Совершенно никому не известный трек", artists: ["Никто"] }, // → unmatched
      ])
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) => {
      if (q.includes("Exact Song")) return [sc("sc_41", "Exact Song", "Exact Artist")];
      if (q.includes("Sunshyne")) return [sc("sc_42", "Sunshine", "Alfa"), sc("sc_43", "Sunshyne", "Alpha")];
      return [];
    });

    const jobId = await createTestJob([jobPlaylist({ kind: 1002, title: "Mixed 1002" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.tracksFound).toBe(3);
    expect(data.report.tracksImported).toBe(1);        // ONLY the confident match
    expect(data.report.tracksAmbiguous).toBe(1);
    expect(data.report.tracksUnmatched).toBe(1);

    const created = data.report.createdPlaylists[0]!;
    const row = await readPlaylistRow(created.playlistId);
    const tracks = JSON.parse(row!.tracksJson);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("Exact Song");
  });
});

describe("import engine: duplicates", () => {
  it("preserves duplicate tracks in original semantics and counts them", async () => {
    // Build the payload first: the real duplicate case has the SAME track id
    // at two positions (Yandex keeps repeated tracks in one playlist).
    const payload = yandexPlaylist(1003, [
      { title: "Repeat Song", artists: ["Artist R"] },
      { title: "Repeat Song", artists: ["Artist R"] }, // same track again
      { title: "Other Song", artists: ["Artist O"] },
    ]);
    payload.tracks[1] = { ...payload.tracks[1], trackId: payload.tracks[0]!.trackId };
    adapterMock.adapterPlaylistTracks.mockResolvedValue(payload);
    searchMock.searchSCTracks.mockImplementation(async (q: string) => {
      if (q.includes("Repeat Song")) return [sc("sc_51", "Repeat Song", "Artist R")];
      if (q.includes("Other Song")) return [sc("sc_52", "Other Song", "Artist O")];
      return [];
    });

    const jobId = await createTestJob([jobPlaylist({ kind: 1003, title: "Dupes 1003" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.duplicates).toBe(1);
    expect(data.report.tracksImported).toBe(3); // MQ tracksJson arrays keep duplicates

    const created = data.report.createdPlaylists[0]!;
    const row = await readPlaylistRow(created.playlistId);
    const tracks = JSON.parse(row!.tracksJson);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].id).toBe("sc_51");
    expect(tracks[1].id).toBe("sc_51"); // duplicate preserved
    expect(tracks[2].id).toBe("sc_52");
  });
});

describe("import engine: partial failure", () => {
  it("one failed playlist does not kill the job → completed_with_errors", async () => {
    adapterMock.adapterPlaylistTracks.mockImplementation(async (_token: string, kind: number) => {
      if (kind === 2002) {
        throw new YandexError("yandex_not_found", "Плейлист недоступен: не найден или скрыт настройками приватности.", 404);
      }
      return yandexPlaylist(2001, [{ title: "Good Song", artists: ["Good Artist"] }]);
    });
    searchMock.searchSCTracks.mockImplementation(async (q: string) => {
      if (q.includes("Good Song")) return [sc("sc_61", "Good Song", "Good Artist")];
      return [];
    });

    const jobId = await createTestJob([
      jobPlaylist({ kind: 2001, title: "Good PL" }),
      jobPlaylist({ kind: 2002, title: "Broken PL" }),
    ]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed_with_errors");

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.playlistsImported).toBe(1);
    expect(data.report.playlistsFailed).toBe(1);
    expect(data.report.failures[0]).toMatchObject({ kind: 2002, title: "Broken PL" });
    expect(data.report.createdPlaylists).toHaveLength(1);
  });

  it("expired token fails the whole job with yandex_unauthorized", async () => {
    adapterMock.adapterPlaylistTracks.mockRejectedValue(
      new YandexError("yandex_unauthorized", "Токен истёк", 401)
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 2003, title: "Any" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("failed");
    const job = await getJob(userId, jobId);
    expect(job?.error).toContain("yandex_unauthorized");
  });
});

describe("import engine: retry", () => {
  it("a transient fetch error is retried on the next advance and then succeeds", async () => {
    let calls = 0;
    adapterMock.adapterPlaylistTracks.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new YandexError("yandex_unavailable", "Яндекс.Музыка временно недоступна.", 503);
      return yandexPlaylist(2004, [{ title: "After Retry", artists: ["Retry Artist"] }]);
    });
    searchMock.searchSCTracks.mockImplementation(async (q: string) =>
      q.includes("After Retry") ? [sc("sc_71", "After Retry", "Retry Artist")] : []
    );

    const jobId = await createTestJob([jobPlaylist({ kind: 2004, title: "Retry PL" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");
    expect(calls).toBe(2);

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.playlistsImported).toBe(1);
    expect(data.report.playlistsFailed).toBe(0);
  });

  it("a permanently failing playlist is failed after the retry, not infinitely retried", async () => {
    adapterMock.adapterPlaylistTracks.mockRejectedValue(
      new YandexError("yandex_unavailable", "Яндекс.Музыка временно недоступна.", 503)
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 2005, title: "Dead PL" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed_with_errors");
    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.playlistsFailed).toBe(1);
  });
});

describe("import engine: conflicts & merge", () => {
  it("copy mode creates «Название (Яндекс)» when a same-name playlist exists", async () => {
    await insertPlaylistRow(userId, "Clash Name", []);
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(3001, [{ title: "Clash Song", artists: ["Clash Artist"] }], "Clash Name")
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) =>
      q.includes("Clash Song") ? [sc("sc_81", "Clash Song", "Clash Artist")] : []
    );

    const jobId = await createTestJob([jobPlaylist({ kind: 3001, title: "Clash Name" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.createdPlaylists[0]!.name).toBe("Clash Name (Яндекс)");
  });

  it("merge mode appends only missing tracks to the existing playlist", async () => {
    const existingTrack = sc("sc_91", "Existing Song", "Existing Artist");
    const playlistId = await insertPlaylistRow(userId, "Merge Target", [existingTrack]);
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(3002, [
        { title: "Existing Song", artists: ["Existing Artist"] }, // already present
        { title: "New Song", artists: ["New Artist"] },           // to append
      ], "Merge Target")
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) => {
      if (q.includes("Existing Song")) return [existingTrack];
      if (q.includes("New Song")) return [sc("sc_92", "New Song", "New Artist")];
      return [];
    });

    const jobId = await createTestJob([jobPlaylist({ kind: 3002, title: "Merge Target", conflictMode: "merge" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");

    const job = await getJob(userId, jobId);
    const data = JSON.parse(job!.data) as ImportJobData;
    expect(data.report.skippedExisting).toBe(1);
    expect(data.report.tracksImported).toBe(1);
    // merged into the SAME playlist, order: existing first, new appended
    const row = await readPlaylistRow(playlistId);
    const tracks = JSON.parse(row!.tracksJson);
    expect(tracks.map((t: Track) => t.id)).toEqual(["sc_91", "sc_92"]);
  });
});

describe("import engine: ambiguous resolution", () => {
  it("resolveAmbiguousTrack appends the chosen candidate and updates the report", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(4001, [{ title: "Sunshyne", artists: ["Alfa"] }])
    );
    const candA = sc("sc_410", "Sunshine", "Alfa");
    const candB = sc("sc_411", "Sunshyne", "Alpha");
    searchMock.searchSCTracks.mockResolvedValue([candA, candB]);

    const jobId = await createTestJob([jobPlaylist({ kind: 4001, title: "Amb PL" })]);
    const { status } = await runToCompletion(jobId);
    expect(status).toBe("completed");

    const detailBefore = await getImportDetail(userId, jobId);
    const amb = detailBefore.playlists[0]!.matches.find((m) => m.status === "ambiguous")!;
    expect(amb).toBeTruthy();
    expect((amb.candidates ?? []).length).toBe(2);

    await resolveAmbiguousTrack(userId, jobId, 4001, amb.position, candA);

    const detailAfter = await getImportDetail(userId, jobId);
    const resolved = detailAfter.playlists[0]!.matches.find((m) => m.position === amb.position)!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.mqTrack?.id).toBe("sc_410");
    // the created playlist gained the resolved track
    const created = detailAfter.playlists[0]!;
    const row = await readPlaylistRow(created.createdPlaylistId!);
    const tracks = JSON.parse(row!.tracksJson);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("sc_410");
    expect(tracks[0]._srcTrackId).toBeTruthy();
  });
});

describe("import engine: re-import detection & cancellation", () => {
  it("getCompletedImportKinds reports previously imported kinds", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(5001, [{ title: "Re Song", artists: ["Re Artist"] }])
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) =>
      q.includes("Re Song") ? [sc("sc_95", "Re Song", "Re Artist")] : []
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 5001, title: "Re PL" })]);
    await runToCompletion(jobId);

    const kinds = await getCompletedImportKinds(userId);
    expect(kinds.has(5001)).toBe(true);
    expect(kinds.has(999999)).toBe(false);
  });

  it("cancelled job stops advancing and stays cancelled", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(5002, [{ title: "Cancel Song", artists: ["Cancel Artist"] }])
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 5002, title: "Cancel PL" })]);
    // advance once (fetch), then cancel
    await advanceImportJob(userId, jobId);
    await updateJob(userId, jobId, { status: "cancelled", completed: true });
    const snap = await advanceImportJob(userId, jobId);
    expect(snap.status).toBe("cancelled");
    // nothing was imported
    expect(snap.report?.playlistsImported ?? 0).toBe(0);
    expect(snap.playlists[0]!.status).not.toBe("imported");
  });

  it("advancing a terminal job is idempotent", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(5003, [{ title: "Idem Song", artists: ["Idem Artist"] }])
    );
    searchMock.searchSCTracks.mockImplementation(async (q: string) =>
      q.includes("Idem Song") ? [sc("sc_96", "Idem Song", "Idem Artist")] : []
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 5003, title: "Idem PL" })]);
    await runToCompletion(jobId);
    const snap1 = await advanceImportJob(userId, jobId);
    const snap2 = await advanceImportJob(userId, jobId);
    expect(snap1.status).toBe("completed");
    expect(snap2.status).toBe("completed");
    expect(snap1.report?.tracksImported).toBe(snap2.report?.tracksImported);
  });
});

describe("import engine: user isolation", () => {
  it("another user cannot advance or read the job", async () => {
    adapterMock.adapterPlaylistTracks.mockResolvedValue(
      yandexPlaylist(6001, [{ title: "Iso Song", artists: ["Iso Artist"] }])
    );
    const jobId = await createTestJob([jobPlaylist({ kind: 6001, title: "Iso PL" })]);
    await expect(advanceImportJob("attacker-user-id", jobId)).rejects.toMatchObject({ code: "job_not_found" });
    await expect(getImportDetail("attacker-user-id", jobId)).rejects.toMatchObject({ code: "job_not_found" });
  });
});

describe("token storage", () => {
  it("getTokenForUser decrypts the stored token server-side", async () => {
    const token = await getTokenForUser(userId);
    expect(token).toBe("test-access-token");
  });

  it("account row never exposes token columns through getAccount", async () => {
    const account = await getAccount(userId);
    expect(account).not.toBeNull();
    expect(account!.login).toBe("yandex.login");
    const asJson = JSON.stringify(account);
    expect(asJson).not.toContain("test-access-token");
    expect(asJson).not.toContain("accessTokenEnc");
  });
});
