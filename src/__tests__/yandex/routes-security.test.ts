/**
 * @vitest-environment node
 *
 * /api/yandex/* route security tests (Phase 10 SECURITY matrix):
 *   - every endpoint rejects anonymous requests with 401
 *   - user isolation (B cannot read/advance A's job)
 *   - Yandex tokens NEVER appear in any response body
 *   - device_code (token-exchangeable secret) never leaves the server
 *   - playlists route requires a linked account
 *
 * DB: real local libsql file (same driver as production Turso).
 * Adapter: mocked at the module boundary (the Python function is exercised
 * separately by scripts/yandex/test_adapter.py).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "routes-test-secret-0123456789abcdefghij";
process.env.TURSO_DATABASE_URL = `file:/tmp/mq-yandex-routes-${process.pid}.db`;

const adapterMock = vi.hoisted(() => ({
  adapterDeviceStart: vi.fn(),
  adapterDevicePoll: vi.fn(),
  adapterAccount: vi.fn(),
  adapterPlaylistsList: vi.fn(),
  adapterPlaylistTracks: vi.fn(),
  adapterProbe: vi.fn(),
}));
vi.mock("@/lib/yandex/adapter", () => adapterMock);

import { signToken } from "@/lib/auth";
import { ensureTursoSchema, getTursoClient } from "@/lib/database";
import { upsertAccount, createJob } from "@/lib/yandex/store";
import { encryptSecret } from "@/lib/yandex/token-crypto";
import { newReport } from "@/lib/yandex/importEngine";

// Route handlers under test
import { POST as authStartPOST } from "@/app/api/yandex/auth/start/route";
import { POST as authPollPOST } from "@/app/api/yandex/auth/poll/route";
import { GET as accountGET, DELETE as accountDELETE } from "@/app/api/yandex/account/route";
import { GET as playlistsGET } from "@/app/api/yandex/playlists/route";
import { POST as importPOST } from "@/app/api/yandex/import/route";
import { GET as jobGET } from "@/app/api/yandex/import/[id]/route";
import { POST as advancePOST } from "@/app/api/yandex/import/[id]/advance/route";
import { POST as resolvePOST } from "@/app/api/yandex/import/[id]/resolve/route";
import { POST as cancelPOST } from "@/app/api/yandex/import/[id]/cancel/route";

const REAL_ACCESS_TOKEN = "y0_real_secret_access_token_DO_NOT_LEAK_9f8e7d";
const REAL_DEVICE_CODE = "device-code-secret-value-abc123";

function req(path: string, init?: { token?: string; method?: string; body?: unknown }): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.token) headers.cookie = `session=${init.token}`;
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers,
    ...(init?.body ? { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) } : {}),
  });
}

async function seedUser(id: string, withYandex = false): Promise<string> {
  const t = getTursoClient();
  await t.execute({
    sql: "INSERT INTO User (id, username, email, password, confirmed, role, createdAt) VALUES (?,?,?,?,1,'user',?)",
    args: [id, `user_${id.slice(2, 10)}`, `${id}@t.local`, "x", new Date().toISOString()],
  });
  if (withYandex) {
    await upsertAccount(id, {
      yandexUid: "1",
      login: "yandex.user",
      displayName: "Yandex User",
      accessTokenEnc: encryptSecret(REAL_ACCESS_TOKEN),
      refreshTokenEnc: null,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  return signToken({ userId: id, username: `user_${id}`, role: "user" });
}

let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  await ensureTursoSchema();
  userA = `ua_${randomUUID().slice(0, 10)}`;
  userB = `ub_${randomUUID().slice(0, 10)}`;
  tokenA = await seedUser(userA, true);
  tokenB = await seedUser(userB, false);
});

beforeEach(() => {
  for (const fn of Object.values(adapterMock)) fn.mockReset();
});

// ── AUTH: anonymous = 401 everywhere ─────────────────────────────────────────

describe("unauthorized access", () => {
  it("auth/start rejects anonymous", async () => {
    const res = await authStartPOST(req("/api/yandex/auth/start", { method: "POST", body: "{}" }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(401);
  });

  it("auth/poll rejects anonymous", async () => {
    const res = await authPollPOST(req("/api/yandex/auth/poll", { method: "POST", body: "{}" }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(401);
  });

  it("account GET/DELETE reject anonymous", async () => {
    expect((await accountGET(req("/api/yandex/account"), { params: Promise.resolve({}) } as never)).status).toBe(401);
    expect(
      (await accountDELETE(req("/api/yandex/account", { method: "DELETE" }), { params: Promise.resolve({}) } as never)).status
    ).toBe(401);
  });

  it("playlists rejects anonymous", async () => {
    const res = await playlistsGET(req("/api/yandex/playlists"), { params: Promise.resolve({}) } as never);
    expect(res.status).toBe(401);
  });

  it("import create rejects anonymous", async () => {
    const res = await importPOST(
      req("/api/yandex/import", { method: "POST", body: { playlists: [{ kind: 1 }] } }),
      { params: Promise.resolve({}) } as never
    );
    expect(res.status).toBe(401);
  });

  it("advance / detail / resolve / cancel reject anonymous", async () => {
    const ctx = { params: Promise.resolve({ id: "somejob" }) } as never;
    expect((await jobGET(req("/api/yandex/import/x"), ctx)).status).toBe(401);
    expect((await advancePOST(req("/api/yandex/import/x/advance", { method: "POST", body: "{}" }), ctx)).status).toBe(401);
    expect(
      (await resolvePOST(req("/api/yandex/import/x/resolve", { method: "POST", body: {} }), ctx)).status
    ).toBe(401);
    expect((await cancelPOST(req("/api/yandex/import/x/cancel", { method: "POST", body: "{}" }), ctx)).status).toBe(401);
  });
});

// ── Device flow: secrets stay server-side ────────────────────────────────────

describe("device flow security", () => {
  it("auth/start returns user_code but NEVER the device_code", async () => {
    adapterMock.adapterDeviceStart.mockResolvedValue({
      userCode: "AB12CD",
      verificationUrl: "https://ya.ru/device",
      deviceCode: REAL_DEVICE_CODE,
      expiresIn: 300,
      interval: 5,
    });
    const res = await authStartPOST(req("/api/yandex/auth/start", { method: "POST", body: "{}", token: tokenB }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.userCode).toBe("AB12CD");
    expect(body.verificationUrl).toBe("https://ya.ru/device");
    // The exchangeable secret must not appear anywhere in the response
    expect(text).not.toContain(REAL_DEVICE_CODE);
    expect(text).not.toContain("deviceCode");
    expect(text).not.toContain("device_code");
  });

  it("auth/poll pending → {status:pending} with no token fields", async () => {
    // seed a pending session for userB via the route itself
    adapterMock.adapterDeviceStart.mockResolvedValue({
      userCode: "ZZ99ZZ",
      verificationUrl: "https://ya.ru/device",
      deviceCode: "poll-device-code",
      expiresIn: 300,
      interval: 5,
    });
    await authStartPOST(req("/api/yandex/auth/start", { method: "POST", body: "{}", token: tokenB }), {
      params: Promise.resolve({}),
    } as never);

    adapterMock.adapterDevicePoll.mockResolvedValue({ status: "pending" });
    const res = await authPollPOST(req("/api/yandex/auth/poll", { method: "POST", body: "{}", token: tokenB }), {
      params: Promise.resolve({}),
    } as never);
    const text = await res.text();
    expect(JSON.parse(text).status).toBe("pending");
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("accessToken");
  });

  it("auth/poll authorized → account stored, response contains NO tokens", async () => {
    adapterMock.adapterDeviceStart.mockResolvedValue({
      userCode: "QQ11QQ",
      verificationUrl: "https://ya.ru/device",
      deviceCode: "authz-device-code",
      expiresIn: 300,
      interval: 5,
    });
    await authStartPOST(req("/api/yandex/auth/start", { method: "POST", body: "{}", token: tokenB }), {
      params: Promise.resolve({}),
    } as never);

    adapterMock.adapterDevicePoll.mockResolvedValue({
      status: "authorized",
      accessToken: REAL_ACCESS_TOKEN,
      refreshToken: "refresh-secret-never-leak",
      expiresIn: 31536000,
      tokenType: "bearer",
    });
    adapterMock.adapterAccount.mockResolvedValue({ uid: 42, login: "yandex.user", displayName: "Yandex User" });

    const res = await authPollPOST(req("/api/yandex/auth/poll", { method: "POST", body: "{}", token: tokenB }), {
      params: Promise.resolve({}),
    } as never);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text).status).toBe("ok");
    expect(JSON.parse(text).account).toMatchObject({ login: "yandex.user" });
    expect(text).not.toContain(REAL_ACCESS_TOKEN);
    expect(text).not.toContain("refresh-secret-never-leak");
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("accessToken");
    expect(text).not.toContain("refreshToken");

    // and the account is now linked for userB
    const accRes = await accountGET(req("/api/yandex/account", { token: tokenB }), { params: Promise.resolve({}) } as never);
    const accText = await accRes.text();
    expect(JSON.parse(accText).connected).toBe(true);
    expect(accText).not.toContain(REAL_ACCESS_TOKEN);
  });
});

// ── Account & playlists ──────────────────────────────────────────────────────

describe("account / playlists", () => {
  it("playlists without linked account → 401 no_yandex_account", async () => {
    // userB linked an account in the previous describe — use a fresh user
    const userC = `uc_${randomUUID().slice(0, 10)}`;
    const tokenC = await seedUser(userC, false);
    const res = await playlistsGET(req("/api/yandex/playlists", { token: tokenC }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("no_yandex_account");
  });

  it("playlists with linked account returns the list + imported flags", async () => {
    adapterMock.adapterPlaylistsList.mockResolvedValue([
      {
        uid: 1, kind: 3, title: "Мне нравится", description: "", trackCount: 10, visibility: "public",
        ownerLogin: "yandex.user", coverUrl: "", durationMs: 1, modified: "", collective: false,
      },
    ]);
    const res = await playlistsGET(req("/api/yandex/playlists", { token: tokenA }), { params: Promise.resolve({}) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlists).toHaveLength(1);
    expect(body.playlists[0].imported).toBe(false);
    expect(body.playlists[0].title).toBe("Мне нравится");
    // adapter got the decrypted token server-side
    expect(adapterMock.adapterPlaylistsList).toHaveBeenCalledWith(REAL_ACCESS_TOKEN, expect.anything());
  });

  it("disconnect wipes the stored account", async () => {
    const res = await accountDELETE(req("/api/yandex/account", { method: "DELETE", token: tokenA }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(200);
    const after = await accountGET(req("/api/yandex/account", { token: tokenA }), { params: Promise.resolve({}) } as never);
    expect(JSON.parse(await after.text()).connected).toBe(false);
  });
});

// ── Import job isolation ─────────────────────────────────────────────────────

describe("import job user isolation", () => {
  it("user B cannot read user A's job (404, not 403 — no existence leak)", async () => {
    const jobId = await createJob(userA, {
      playlists: [],
      phase: "fetching",
      report: newReport(),
    });
    const ctxB = { params: Promise.resolve({ id: jobId }) } as never;
    const resB = await jobGET(req(`/api/yandex/import/${jobId}`, { token: tokenB }), ctxB);
    expect(resB.status).toBe(404);
    expect((await resB.json()).error).toBe("job_not_found");

    // owner can still read it
    const ctxA = { params: Promise.resolve({ id: jobId }) } as never;
    const resA = await jobGET(req(`/api/yandex/import/${jobId}`, { token: tokenA }), ctxA);
    expect(resA.status).toBe(200);
  });

  it("user B cannot advance user A's job", async () => {
    const jobId = await createJob(userA, { playlists: [], phase: "fetching", report: newReport() });
    const ctxB = { params: Promise.resolve({ id: jobId }) } as never;
    const resB = await advancePOST(req(`/api/yandex/import/${jobId}/advance`, { method: "POST", body: "{}", token: tokenB }), ctxB);
    expect(resB.status).toBe(404);
    expect((await resB.json()).error).toBe("job_not_found");
  });

  it("user B cannot cancel user A's job", async () => {
    const jobId = await createJob(userA, { playlists: [], phase: "fetching", report: newReport() });
    const ctxB = { params: Promise.resolve({ id: jobId }) } as never;
    const resB = await cancelPOST(req(`/api/yandex/import/${jobId}/cancel`, { method: "POST", body: "{}", token: tokenB }), ctxB);
    expect(resB.status).toBe(404);
  });

  it("import create validates the playlist list", async () => {
    // fresh linked user (userA's account was disconnected in an earlier test)
    const userD = `ud_${randomUUID().slice(0, 10)}`;
    const tokenD = await seedUser(userD, true);
    const res = await importPOST(req("/api/yandex/import", { method: "POST", body: { playlists: [] }, token: tokenD }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
  });
});
