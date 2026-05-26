/**
 * Unit tests for Rate Limiter (src/lib/rate-limit.ts)
 * Tests: allow within limit, block over limit, window reset, key independence, presets
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";

// We need to reset the internal store between test groups since rate-limit
// uses a module-level Map. We can't access it directly, but we can use
// unique IPs per test to avoid interference.

describe("Rate Limiter — allows within limit", () => {
  it("should allow requests within the rate limit", () => {
    const limit = 5;
    const window = 60;
    const ip = "10.0.0.1";

    for (let i = 0; i < limit; i++) {
      const result = rateLimit({ ip, limit, window, key: "allow-test" });
      expect(result.success).toBe(true);
    }
  });

  it("should decrement remaining count with each request", () => {
    const limit = 5;
    const window = 60;
    const ip = "10.0.0.2";

    for (let i = 0; i < limit; i++) {
      const result = rateLimit({ ip, limit, window, key: "decrement-test" });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }
  });

  it("should return correct limit in result", () => {
    const result = rateLimit({ ip: "10.0.0.3", limit: 10, window: 60, key: "limit-value-test" });
    expect(result.limit).toBe(10);
  });
});

describe("Rate Limiter — blocks over limit", () => {
  it("should block requests when limit is exceeded", () => {
    const limit = 3;
    const window = 60;
    const ip = "10.0.1.1";

    // Use up the limit
    for (let i = 0; i < limit; i++) {
      rateLimit({ ip, limit, window, key: "block-test" });
    }

    // Next request should be blocked
    const result = rateLimit({ ip, limit, window, key: "block-test" });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should report resetIn when blocked", () => {
    const limit = 1;
    const window = 60;
    const ip = "10.0.1.2";

    rateLimit({ ip, limit, window, key: "resetin-test" });
    const result = rateLimit({ ip, limit, window, key: "resetin-test" });

    expect(result.success).toBe(false);
    expect(result.resetIn).toBeGreaterThan(0);
    expect(result.resetIn).toBeLessThanOrEqual(window);
  });
});

describe("Rate Limiter — window resets after expiry", () => {
  it("should allow requests again after window expires", () => {
    const limit = 2;
    const window = 1; // 1 second window
    const ip = "10.0.2.1";

    // Use up the limit
    rateLimit({ ip, limit, window, key: "window-test" });
    rateLimit({ ip, limit, window, key: "window-test" });

    // Should be blocked now
    const blocked = rateLimit({ ip, limit, window, key: "window-test" });
    expect(blocked.success).toBe(false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = rateLimit({ ip, limit, window, key: "window-test" });
        expect(result.success).toBe(true);
        resolve();
      }, 1100);
    });
  });
});

describe("Rate Limiter — different keys are independent", () => {
  it("should track different keys independently", () => {
    const limit = 2;
    const window = 60;
    const ip = "10.0.3.1";

    // Use up limit for key-a
    rateLimit({ ip, limit, window, key: "key-a" });
    rateLimit({ ip, limit, window, key: "key-a" });

    // key-a should be blocked
    const resultA = rateLimit({ ip, limit, window, key: "key-a" });
    expect(resultA.success).toBe(false);

    // key-b should still be allowed
    const resultB = rateLimit({ ip, limit, window, key: "key-b" });
    expect(resultB.success).toBe(true);
  });

  it("should track different IPs independently", () => {
    const limit = 1;
    const window = 60;
    const key = "same-key";

    // Use limit for IP-1
    rateLimit({ ip: "10.0.3.2", limit, window, key });
    const blocked = rateLimit({ ip: "10.0.3.2", limit, window, key });
    expect(blocked.success).toBe(false);

    // IP-2 should still be allowed with same key
    const allowed = rateLimit({ ip: "10.0.3.3", limit, window, key });
    expect(allowed.success).toBe(true);
  });

  it("should use 'default' key when no key is provided", () => {
    const limit = 1;
    const window = 60;
    const ip = "10.0.3.4";

    const result1 = rateLimit({ ip, limit, window });
    expect(result1.success).toBe(true);

    const result2 = rateLimit({ ip, limit, window });
    expect(result2.success).toBe(false);
  });
});

describe("Rate Limiter — presets have correct limits", () => {
  it("should have auth preset: 10 req/min", () => {
    expect(RATE_LIMITS.auth).toEqual({ limit: 10, window: 60 });
  });

  it("should have upload preset: 5 req/min", () => {
    expect(RATE_LIMITS.upload).toEqual({ limit: 5, window: 60 });
  });

  it("should have read preset: 60 req/min", () => {
    expect(RATE_LIMITS.read).toEqual({ limit: 60, window: 60 });
  });

  it("should have write preset: 30 req/min", () => {
    expect(RATE_LIMITS.write).toEqual({ limit: 30, window: 60 });
  });

  it("should have search preset: 20 req/min", () => {
    expect(RATE_LIMITS.search).toEqual({ limit: 20, window: 60 });
  });

  it("should have heavy preset: 5 req/min", () => {
    expect(RATE_LIMITS.heavy).toEqual({ limit: 5, window: 60 });
  });

  it("should have medium preset: 15 req/min", () => {
    expect(RATE_LIMITS.medium).toEqual({ limit: 15, window: 60 });
  });

  it("should have admin preset: 60 req/min", () => {
    expect(RATE_LIMITS.admin).toEqual({ limit: 60, window: 60 });
  });

  it("should have all expected preset keys", () => {
    const expectedKeys = ["auth", "upload", "read", "write", "search", "heavy", "medium", "admin"];
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(expectedKeys.sort());
  });
});

describe("Rate Limiter — getClientIp", () => {
  it("should extract last IP from x-forwarded-for with multiple IPs", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.1, 198.51.100.1, 192.0.2.1" },
    });
    expect(getClientIp(req)).toBe("192.0.2.1");
  });

  it("should extract single IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("should fallback to x-real-ip when no x-forwarded-for", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-real-ip": "198.51.100.10" },
    });
    expect(getClientIp(req)).toBe("198.51.100.10");
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const req = new Request("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-real-ip": "198.51.100.10",
      },
    });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("should return 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost/api/test");
    expect(getClientIp(req)).toBe("unknown");
  });
});
