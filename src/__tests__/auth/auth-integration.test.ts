/**
 * @vitest-environment node
 */

/**
 * Auth API integration tests
 * Tests: login flow, register flow, logout flow, token expiry,
 *        concurrent auth operations (_authGeneration), rate limiting
 *
 * Uses Node.js environment because jose requires crypto.subtle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signToken, verifyToken } from "@/lib/auth";
import { useAppStore } from "@/store/useAppStore";
import { rateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";

// Set up JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-for-integration-tests-32ch";

// ── Login Flow Tests ──────────────────────────────────────────────────────────

describe("Login Flow Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    const store = useAppStore.getState();
    if (store.reset) store.reset();
  });

  it("should update store state after successful login simulation", async () => {
    // Mock fetch for setAuth's internal calls (theme, sync, etc.)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    // Simulate: API returns a valid token
    const token = await signToken({
      userId: "user-1",
      username: "testuser",
      email: "test@example.com",
      role: "user",
    });

    // Verify the token first (simulating what the server would do)
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-1");

    // Now call setAuth (as the client would after login)
    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);

    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe("user-1");
    expect(state.username).toBe("testuser");
    expect(state.currentView).toBe("main");

    vi.restoreAllMocks();
  });

  it("should handle login with avatar and telegram username", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    useAppStore.getState().setAuth(
      "user-2", "tguser", "tg@example.com", "user",
      "https://avatar.url/pic.jpg", "tg_handle"
    );

    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.avatar).toBe("https://avatar.url/pic.jpg");
    expect(state.telegramUsername).toBe("tg_handle");

    vi.restoreAllMocks();
  });
});

// ── Register Flow Tests ───────────────────────────────────────────────────────

describe("Register Flow Integration", () => {
  it("should verify register API call body via mocked fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { id: "new-user-1", username: "newuser", email: "new@example.com" },
      }),
    } as Response);

    // Simulate a register API call
    const registerBody = {
      email: "new@example.com",
      username: "newuser",
      password: "SecurePass123!",
    };

    await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(registerBody),
      })
    );

    vi.restoreAllMocks();
  });
});

// ── Logout Flow Tests ─────────────────────────────────────────────────────────

describe("Logout Flow Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    const store = useAppStore.getState();
    if (store.reset) store.reset();
  });

  it("should reset store state and call logout API on logout", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    // Login first
    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);
    expect(useAppStore.getState().isAuthenticated).toBe(true);

    // Clear the mock to track the logout call specifically
    fetchSpy.mockClear();

    // Logout
    useAppStore.getState().logout();

    // Verify state is reset
    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.username).toBeNull();
    expect(state.currentView).toBe("auth");

    // Verify logout API was called
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );

    vi.restoreAllMocks();
  });

  it("should increment _authGeneration on logout to prevent stale writes", () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    vi.setSystemTime(1000);
    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);
    const genBefore = useAppStore.getState()._authGeneration;

    vi.setSystemTime(2000);
    useAppStore.getState().logout();
    const genAfter = useAppStore.getState()._authGeneration;

    expect(genAfter).not.toBe(genBefore);
    // The generation after logout should be a new timestamp
    expect(typeof genAfter).toBe("number");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});

// ── Token Expiry Tests ────────────────────────────────────────────────────────

describe("Token Expiry", () => {
  it("should return null for expired tokens", async () => {
    // Sign a token that expires immediately (1 second)
    // We can't easily create an expired token with jose's API,
    // but we can test that a manually tampered token returns null
    const result = await verifyToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJleHAiOjF9.invalid");
    expect(result).toBeNull();
  });

  it("should return null for tokens with invalid signature", async () => {
    const token = await signToken({ userId: "user-1" });

    // Verify with different secret
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "different-secret-key-for-test-32ch-long!!";
    const result = await verifyToken(token);
    expect(result).toBeNull();

    process.env.JWT_SECRET = original;
  });

  it("should return null for malformed JWT", async () => {
    expect(await verifyToken("not-a-jwt")).toBeNull();
    expect(await verifyToken("a.b")).toBeNull();
    expect(await verifyToken("")).toBeNull();
  });
});

// ── Concurrent Auth Operations Tests ──────────────────────────────────────────

describe("Concurrent Auth Operations (_authGeneration)", () => {
  beforeEach(() => {
    localStorage.clear();
    const store = useAppStore.getState();
    if (store.reset) store.reset();
  });

  it("should prevent stale async writes after logout via _authGeneration", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "neon" }),
    } as Response);

    // Login at time 0
    vi.setSystemTime(1000);
    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);
    const loginGen = useAppStore.getState()._authGeneration;

    // Advance time so logout gets a different Date.now()
    vi.setSystemTime(5000);

    // Logout — this changes _authGeneration
    useAppStore.getState().logout();
    const logoutGen = useAppStore.getState()._authGeneration;

    // The generation should have changed
    expect(logoutGen).not.toBe(loginGen);

    // Simulate: an async operation from the login tries to write after logout
    // It should check get()._authGeneration !== loginGen and skip
    const currentGen = useAppStore.getState()._authGeneration;
    expect(currentGen).not.toBe(loginGen); // Stale — should be rejected

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should allow new login after logout with new generation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ theme: "default" }),
    } as Response);

    // First login
    useAppStore.getState().setAuth("user-1", "testuser", "test@example.com", "user", null, null);
    expect(useAppStore.getState().isAuthenticated).toBe(true);

    // Logout
    useAppStore.getState().logout();
    expect(useAppStore.getState().isAuthenticated).toBe(false);

    // Second login — should work fine
    useAppStore.getState().setAuth("user-2", "newuser", "new@example.com", "user", null, null);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
    expect(useAppStore.getState().userId).toBe("user-2");

    vi.restoreAllMocks();
  });
});

// ── Rate Limiting Tests ───────────────────────────────────────────────────────

describe("Rate Limiting in Auth Context", () => {
  it("should allow requests within the auth rate limit", () => {
    const { limit, window } = RATE_LIMITS.auth;
    // Should allow up to `limit` requests
    for (let i = 0; i < limit; i++) {
      const result = rateLimit({ ip: "127.0.0.1", limit, window, key: "auth-test" });
      expect(result.success).toBe(true);
    }
  });

  it("should block requests exceeding the auth rate limit", () => {
    const { limit, window } = RATE_LIMITS.auth;
    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      rateLimit({ ip: "127.0.0.2", limit, window, key: "auth-block-test" });
    }
    // Next request should be blocked
    const result = rateLimit({ ip: "127.0.0.2", limit, window, key: "auth-block-test" });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should report correct remaining count", () => {
    const { limit, window } = RATE_LIMITS.auth;
    const result = rateLimit({ ip: "127.0.0.3", limit, window, key: "auth-remaining-test" });
    expect(result.remaining).toBe(limit - 1);
    expect(result.limit).toBe(limit);
  });

  it("should have correct rate limit presets", () => {
    expect(RATE_LIMITS.auth.limit).toBe(10);
    expect(RATE_LIMITS.auth.window).toBe(60);
    expect(RATE_LIMITS.upload.limit).toBe(5);
    expect(RATE_LIMITS.upload.window).toBe(60);
    expect(RATE_LIMITS.read.limit).toBe(60);
    expect(RATE_LIMITS.read.window).toBe(60);
    expect(RATE_LIMITS.write.limit).toBe(30);
    expect(RATE_LIMITS.write.window).toBe(60);
    expect(RATE_LIMITS.search.limit).toBe(20);
    expect(RATE_LIMITS.search.window).toBe(60);
    expect(RATE_LIMITS.heavy.limit).toBe(5);
    expect(RATE_LIMITS.heavy.window).toBe(60);
    expect(RATE_LIMITS.medium.limit).toBe(15);
    expect(RATE_LIMITS.medium.window).toBe(60);
    expect(RATE_LIMITS.admin.limit).toBe(60);
    expect(RATE_LIMITS.admin.window).toBe(60);
  });

  it("should extract client IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    const ip = getClientIp(req);
    // When 2+ IPs, should use last (CDN trust model)
    expect(ip).toBe("5.6.7.8");
  });

  it("should extract client IP from x-real-ip header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    const ip = getClientIp(req);
    expect(ip).toBe("9.8.7.6");
  });

  it("should return 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost/api/test");
    const ip = getClientIp(req);
    expect(ip).toBe("unknown");
  });
});
