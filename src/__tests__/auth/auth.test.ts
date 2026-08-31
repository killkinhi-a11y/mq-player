/**
 * @vitest-environment node
 */

/**
 * Integration tests for Auth system
 * Tests: JWT sign/verify, withAuth middleware, withAdminAuth, getSession, cookie management
 *
 * Uses Node.js environment (not jsdom) because jose library requires crypto.subtle
 * which is not available in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { signToken, verifyToken, setSessionCookie, clearSessionCookie, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { withAuth, withAdminAuth, validateContentType } from "@/lib/withAuth";
import { NextRequest, NextResponse } from "next/server";

// Set up JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-for-integration-tests-32ch";

// ── JWT Sign/Verify Tests ──────────────────────────────────────────────────────────

describe("JWT signToken / verifyToken", () => {
  it("should sign and verify a token", async () => {
    const payload = { userId: "user-1", username: "testuser", email: "test@example.com", role: "user" };
    const token = await signToken(payload);

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user-1");
    expect(decoded!.username).toBe("testuser");
    expect(decoded!.email).toBe("test@example.com");
    expect(decoded!.role).toBe("user");
  });

  it("should return null for invalid token", async () => {
    const result = await verifyToken("invalid.token.here");
    expect(result).toBeNull();
  });

  it("should return null for empty string", async () => {
    const result = await verifyToken("");
    expect(result).toBeNull();
  });

  it("should throw if JWT_SECRET is not set", async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // auth.ts caches the encoded secret at module level, so a plain env
    // delete would still find the cached value. Re-import a fresh module
    // instance to exercise the "secret missing" path.
    vi.resetModules();
    const { signToken: signTokenFresh } = await import("@/lib/auth");
    await expect(signTokenFresh({ userId: "1" })).rejects.toThrow("JWT_SECRET");

    process.env.JWT_SECRET = original;
  });

  it("should include userId in minimal payload", async () => {
    const payload = { userId: "user-minimal" };
    const token = await signToken(payload);
    const decoded = await verifyToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user-minimal");
    expect(decoded!.username).toBeUndefined();
    expect(decoded!.email).toBeUndefined();
  });

  it("should handle admin role", async () => {
    const payload = { userId: "admin-1", username: "admin", email: "admin@example.com", role: "admin" };
    const token = await signToken(payload);
    const decoded = await verifyToken(token);

    expect(decoded!.role).toBe("admin");
  });

  it("should reject token signed with different secret", async () => {
    const payload = { userId: "user-1" };
    const token = await signToken(payload);

    // Change secret and verify through a fresh module instance — the
    // statically imported auth module caches the encoded secret, so env
    // changes alone wouldn't affect it.
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "different-secret-key-for-test-32ch";
    vi.resetModules();
    const { verifyToken: verifyTokenFresh } = await import("@/lib/auth");
    const result = await verifyTokenFresh(token);
    expect(result).toBeNull();

    process.env.JWT_SECRET = original;
  });
});

// ── Cookie Management Tests ──────────────────────────────────────────────────────────

describe("Cookie Management", () => {
  it("should have correct cookie options", () => {
    expect(SESSION_COOKIE_OPTIONS.name).toBe("session");
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(60 * 60 * 24 * 7); // 7 days
    expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
  });

  it("should set session cookie on response", async () => {
    const response = new NextResponse();
    const payload = { userId: "user-1", username: "testuser" };

    const result = await setSessionCookie(response, payload);

    // Should return the same response
    expect(result).toBe(response);

    // Cookie should be set
    const cookies = result.cookies.getAll();
    expect(cookies.length).toBeGreaterThan(0);
  });

  it("should clear session cookie on response", () => {
    const response = new NextResponse();

    const result = clearSessionCookie(response);

    expect(result).toBe(response);

    // Cookie should be set with maxAge=0 (delete)
    const cookie = result.cookies.get("session");
    expect(cookie).toBeDefined();
    expect(cookie?.maxAge).toBe(0);
  });
});

// ── withAuth Middleware Tests ──────────────────────────────────────────────────────────

describe("withAuth middleware", () => {
  const mockHandler = vi.fn().mockResolvedValue(
    NextResponse.json({ success: true })
  );

  beforeEach(() => {
    mockHandler.mockClear();
  });

  it("should reject request without session cookie", async () => {
    const req = new NextRequest(new URL("http://localhost/api/test"));
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("should reject request with invalid token", async () => {
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { cookie: "session=invalid-token" },
    });
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("should allow request with valid token", async () => {
    const token = await signToken({ userId: "user-1", username: "testuser", role: "user" });
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { cookie: `session=${token}` },
    });
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledOnce();

    // Check that userId and userRole are passed to handler
    const handlerCtx = mockHandler.mock.calls[0][1];
    expect(handlerCtx.userId).toBe("user-1");
    expect(handlerCtx.userRole).toBe("user");
  });
});

// ── withAdminAuth Middleware Tests ──────────────────────────────────────────────────

describe("withAdminAuth middleware", () => {
  const mockHandler = vi.fn().mockResolvedValue(
    NextResponse.json({ success: true })
  );

  beforeEach(() => {
    mockHandler.mockClear();
  });

  it("should reject non-admin user", async () => {
    const token = await signToken({ userId: "user-1", username: "testuser", role: "user" });
    const req = new NextRequest(new URL("http://localhost/api/admin/test"), {
      headers: { cookie: `session=${token}` },
    });
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAdminAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(403);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("should allow admin user", async () => {
    const token = await signToken({ userId: "admin-1", username: "admin", role: "admin" });
    const req = new NextRequest(new URL("http://localhost/api/admin/test"), {
      headers: { cookie: `session=${token}` },
    });
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAdminAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledOnce();

    const handlerCtx = mockHandler.mock.calls[0][1];
    expect(handlerCtx.userId).toBe("admin-1");
    expect(handlerCtx.userRole).toBe("admin");
  });

  it("should reject request without token", async () => {
    const req = new NextRequest(new URL("http://localhost/api/admin/test"));
    const ctx = { params: Promise.resolve({}) };

    const wrappedHandler = withAdminAuth(mockHandler);
    const response = await wrappedHandler(req, ctx);

    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });
});

// ── validateContentType Tests ──────────────────────────────────────────────────────────

describe("validateContentType", () => {
  it("should accept application/json", () => {
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "content-type": "application/json" },
    });
    expect(validateContentType(req)).toBe(true);
  });

  it("should accept multipart/form-data", () => {
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "content-type": "multipart/form-data; boundary=----" },
    });
    expect(validateContentType(req)).toBe(true);
  });

  it("should accept application/x-www-form-urlencoded", () => {
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(validateContentType(req)).toBe(true);
  });

  it("should reject text/plain", () => {
    const req = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "content-type": "text/plain" },
    });
    expect(validateContentType(req)).toBe(false);
  });

  it("should reject missing content-type", () => {
    const req = new NextRequest(new URL("http://localhost/api/test"));
    expect(validateContentType(req)).toBe(false);
  });
});
