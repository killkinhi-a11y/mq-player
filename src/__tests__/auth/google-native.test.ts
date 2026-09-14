/**
 * @vitest-environment node
 *
 * Tests for the Google NATIVE login route (v2.2.0 — Android Credential
 * Manager bridge), sharing the web flow's verification chain:
 *
 *   GET  /api/auth/google/native        → one-time nonce + HttpOnly cookie
 *   POST /api/auth/google/native        → { idToken }
 *
 *   1. nonce: HttpOnly cookie === id_token nonce claim (single use)
 *   2. id_token verified by verifyGoogleIdToken (mocked here — its JWKS
 *      chain is exercised by the real Google flow; we pin the CONTRACT)
 *   3. resolveGoogleLogin — the shared account resolution (also drives
 *      /api/auth/google/callback; pinned here through the native route)
 *   4. session cookie lands on the JSON response
 *
 * The route is what the Android app talks to (see
 * android/app/src/main/kotlin/com/mq1/player/data/api/MqApi.kt:
 * GET/POST api/auth/google/native — AuthEndpointsContractTest locks parity).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret-key-for-oauth-tests-32ch!";
  process.env.GOOGLE_CLIENT_ID = "test-web-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret-never-in-apk";
});

// verifyGoogleIdToken + isGoogleConfigured mocked; state/nonce helpers REAL.
vi.mock("@/lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oauth")>();
  return {
    ...actual,
    isGoogleConfigured: () => true,
    verifyGoogleIdToken: vi.fn(),
  };
});

vi.mock("@/lib/database", () => ({
  database: {
    findFeatureFlagByKey: vi.fn().mockResolvedValue(null),
    findAuthIdentity: vi.fn(),
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserByUsername: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
    createAuthIdentity: vi.fn().mockResolvedValue({}),
    updateUser: vi.fn().mockResolvedValue({}),
  },
  isTurso: vi.fn(() => false),
  getTursoClient: vi.fn(),
  tursoQuery: vi.fn(),
  ensureTursoSchema: vi.fn(),
}));

vi.mock("@/lib/admin-grant", () => ({
  ensureOwnerAdminRole: vi.fn().mockResolvedValue("user"),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, limit: 30, remaining: 29, resetIn: 0 })),
  withRateLimit: (_preset: unknown, handler: unknown) => handler,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { GET as nonceGET, POST as loginPOST } from "@/app/api/auth/google/native/route";
import { verifyGoogleIdToken } from "@/lib/oauth";
import { SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { NextRequest } from "next/server";

const mockedVerify = vi.mocked(verifyGoogleIdToken);

function nextReq(
  url: string,
  init?: { method?: string; headers?: HeadersInit; body?: string; cookies?: string }
) {
  const headers = new Headers(init?.headers);
  if (init?.cookies) headers.set("cookie", init.cookies);
  // NextRequest parses the Cookie header into req.cookies (what the route reads).
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body != null ? { body: init.body } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/google/native (nonce issue)", () => {
  it("returns a nonce and sets a single-use HttpOnly cookie", async () => {
    const res = await nonceGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.nonce).toBe("string");
    expect(body.nonce!.length).toBeGreaterThanOrEqual(32);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("mq_native_nonce=");
    expect(setCookie).toContain(body.nonce);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=600");
  });

  it("issues DIFFERENT nonces per request (random, not static)", async () => {
    const a = (await (await nonceGET()).json()).nonce;
    const b = (await (await nonceGET()).json()).nonce;
    expect(a).not.toBe(b);
  });
});

describe("POST /api/auth/google/native (id_token login)", () => {
  const GOOGLE_IDENTITY = {
    sub: "google-sub-123",
    email: "ivan@gmail.com",
    emailVerified: true,
    name: "Ivan Petrov",
    picture: "https://lh3.googleusercontent.com/a/pic",
    nonce: null as string | null,
  };

  it("rejects a missing id_token with 400", async () => {
    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_id_token");
  });

  it("rejects an invalid id_token with 401 google_token_invalid", async () => {
    mockedVerify.mockResolvedValue(null);
    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "garbage.token" }),
        cookies: "mq_native_nonce=whatever",
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("google_token_invalid");
  });

  it("rejects a token whose nonce does not match the nonce cookie (replay/CSRF defense)", async () => {
    mockedVerify.mockResolvedValue({ ...GOOGLE_IDENTITY, nonce: "aaaa1111" });
    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid.token" }),
        cookies: "mq_native_nonce=bbbb2222",
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_nonce");
  });

  it("rejects when the nonce cookie is absent entirely", async () => {
    mockedVerify.mockResolvedValue({ ...GOOGLE_IDENTITY, nonce: "aaaa1111" });
    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid.token" }),
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_nonce");
  });

  it("logs in a linked Google identity: 200 + user JSON + session cookie, nonce cleared", async () => {
    mockedVerify.mockResolvedValue({ ...GOOGLE_IDENTITY, nonce: "cafebabe" });
    const { database } = await import("@/lib/database");
    const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
    db.findAuthIdentity.mockResolvedValue({
      userId: "user-42",
      provider: "google",
      providerUserId: "google-sub-123",
    });
    db.findUserById.mockResolvedValue({
      id: "user-42",
      username: "ivan",
      email: "ivan@gmail.com",
      role: "user",
      blocked: false,
      avatar: "https://example.com/avatar.png",
    });

    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid.token" }),
        cookies: "mq_native_nonce=cafebabe",
      })
    );

    expect(mockedVerify).toHaveBeenCalledWith("valid.token");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe("user-42");
    expect(body.username).toBe("ivan");
    expect(body.role).toBe("user");
    expect(body.avatar).toBe("https://example.com/avatar.png");
    expect(body.linked).toBe(false);
    expect(body.created).toBe(false);

    // The session cookie is set on the JSON response (httpOnly JWT):
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_OPTIONS.name}=`);
    expect(setCookie).toContain("HttpOnly");
    // Single-use nonce is cleared:
    expect(setCookie).toContain("mq_native_nonce=;");
  });

  it("auto-creates an account for a brand-new Google user (shared 4c path)", async () => {
    mockedVerify.mockResolvedValue({ ...GOOGLE_IDENTITY, nonce: "cafebabe" });
    const { database } = await import("@/lib/database");
    const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
    db.findAuthIdentity.mockResolvedValue(null); // no linked identity
    db.findUserByEmail.mockResolvedValue(null); // no matching email
    db.findUserByUsername.mockResolvedValue(null);
    db.createUser.mockResolvedValue({
      id: "new-user-1",
      username: "ivan_petrov",
      email: "ivan@gmail.com",
      role: "user",
      blocked: false,
      avatar: "https://lh3.googleusercontent.com/a/pic",
    });

    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid.token" }),
        cookies: "mq_native_nonce=cafebabe",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.created).toBe(true);
    expect(body.userId).toBe("new-user-1");
    expect(db.createUser).toHaveBeenCalled();
    expect(db.createAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", providerUserId: "google-sub-123" })
    );
  });

  it("refuses blocked accounts with 403", async () => {
    mockedVerify.mockResolvedValue({ ...GOOGLE_IDENTITY, nonce: "cafebabe" });
    const { database } = await import("@/lib/database");
    const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
    db.findAuthIdentity.mockResolvedValue({
      userId: "user-42",
      provider: "google",
      providerUserId: "google-sub-123",
    });
    db.findUserById.mockResolvedValue({
      id: "user-42",
      username: "banned",
      email: "banned@gmail.com",
      role: "user",
      blocked: true,
      avatar: null,
    });

    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid.token" }),
        cookies: "mq_native_nonce=cafebabe",
      })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("blocked");
  });

  it("non-JSON content type is rejected (415)", async () => {
    const res = await loginPOST(
      nextReq("http://localhost/api/auth/google/native", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "idToken=abc",
      })
    );
    expect(res.status).toBe(415);
  });
});

describe("providers probe exposes the public client id", () => {
  it("GET /api/auth/providers includes googleClientId (public value, no secret)", async () => {
    const { GET } = await import("@/app/api/auth/providers/route");
    const res = await GET();
    const body = await res.json();
    expect(body.google).toBe(true);
    expect(body.googleClientId).toBe("test-web-client-id.apps.googleusercontent.com");
    // The SECRET must never appear in the public probe:
    expect(JSON.stringify(body)).not.toContain("test-client-secret");
  });
});
