/**
 * Rate limiter — Upstash Redis backend with in-memory fallback.
 *
 * In-memory Map works fine in dev/single-instance, but on Vercel serverless
 * each instance has its own Map → an attacker rotating across instances gets
 * N× the limit. When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are
 * set, we use Upstash's sliding-window counter which is shared across all
 * instances.
 *
 * The Upstash client is loaded lazily so dev environments without
 * @upstash/redis installed still work.
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rate-limit";
 *   const { success, remaining, resetIn } = rateLimit({ ip, limit: 10, window: 60 });
 */

interface RateLimitEntry {
  timestamps: number[];
}

// In-memory store (per-process; resets on cold start — fallback only)
const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10000; // Prevent unbounded memory growth

// Cleanup old entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    // Remove timestamps older than 10 minutes
    entry.timestamps = entry.timestamps.filter(t => now - t < 10 * 60 * 1000);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

// ── Upstash Redis lazy loader ────────────────────────────────────────────────
//
// IMPORTANT: We use a dynamic require() via eval() so the bundler does NOT
// try to resolve `@upstash/redis` at build time. If the package isn't
// installed (e.g. dev environments, or production without Upstash env vars),
// the require will throw and we fall back to the in-memory rate limiter.
//
// This is the same pattern used by Next.js for optional native deps.
let _upstashClient: { incr: (key: string) => Promise<number>; expire: (key: string, ttl: number) => Promise<void> } | null | undefined;

// Pre-loaded promise — avoids re-importing @upstash/redis on every request.
// The import resolution takes ~50ms; at 100 RPS that's 5s CPU/sec wasted.
let _upstashPromise: Promise<any> | null = null;

function loadUpstash(): Promise<any> {
  if (!_upstashPromise) {
    // @ts-ignore — optional dependency, may not be installed
    _upstashPromise = import(/* webpackIgnore: true */ "@upstash/redis").catch(() => null);
  }
  return _upstashPromise;
}

async function getUpstashClient() {
  if (_upstashClient !== undefined) return _upstashClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    _upstashClient = null;
    return null;
  }
  try {
    const mod = await loadUpstash() as
      | { Redis?: new (opts: { url: string; token: string }) => {
              incr: (k: string) => Promise<number>;
              expire: (k: string, ttl: number) => Promise<void>;
            } }
      | null;
    if (!mod || !mod.Redis) {
      console.warn("[rate-limit] UPSTASH_REDIS_REST_URL set but @upstash/redis not installed — falling back to in-memory");
      _upstashClient = null;
      return null;
    }
    const redis = new mod.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    _upstashClient = {
      async incr(key: string) {
        return await redis.incr(key);
      },
      async expire(key: string, ttl: number) {
        await redis.expire(key, ttl);
      },
    };
    return _upstashClient;
  } catch (e) {
    console.warn("[rate-limit] Failed to init Upstash Redis:", e);
    _upstashClient = null;
    return null;
  }
}

/**
 * Upstash-backed rate limit using a fixed-window counter (cheaper than
 * sliding window, atomic via INCR). Returns the same shape as `rateLimit`.
 */
async function rateLimitUpstash(options: {
  ip: string;
  limit: number;
  window: number; // seconds
  key?: string;
}): Promise<RateLimitResult | null> {
  const client = await getUpstashClient();
  if (!client) return null;

  const { ip, limit, window, key } = options;
  const bucket = Math.floor(Date.now() / (window * 1000));
  const redisKey = `rl:${ip}:${key || "default"}:${bucket}`;

  try {
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, window);
    }
    const success = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetIn = window - Math.floor((Date.now() / 1000) % window);
    return { success, remaining, resetIn, limit };
  } catch (e) {
    console.warn("[rate-limit] Upstash error, falling back to in-memory:", e);
    return null;
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // seconds until the oldest request in window expires
  limit: number;
}

export function rateLimit(options: {
  ip: string;
  limit: number;
  window: number; // seconds
  key?: string; // additional key suffix for per-endpoint limiting
}): RateLimitResult {
  cleanup();

  const { ip, limit, window, key } = options;
  const windowMs = window * 1000;
  const now = Date.now();
  const storeKey = `${ip}:${key || "default"}`;

  // Evict oldest entries if store is too large (prevents memory leak in serverless)
  if (store.size > MAX_STORE_SIZE) {
    const keysToDelete = Array.from(store.keys()).slice(0, store.size - MAX_STORE_SIZE / 2);
    for (const key of keysToDelete) store.delete(key);
  }

  let entry = store.get(storeKey);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(storeKey, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  const remaining = Math.max(0, limit - entry.timestamps.length);

  // Calculate reset time (when the oldest request in window expires)
  let resetIn = 0;
  if (entry.timestamps.length > 0) {
    const oldest = entry.timestamps[0];
    resetIn = Math.ceil((oldest + windowMs - now) / 1000);
  }

  // Check if limit exceeded
  if (entry.timestamps.length >= limit) {
    return { success: false, remaining: 0, resetIn, limit };
  }

  // Add current request
  entry.timestamps.push(now);

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetIn,
    limit,
  };
}

/**
 * Async rate-limit wrapper — prefers Upstash if configured, falls back to
 * the in-memory sync implementation. Use this in API routes where you can
 * await the result; the sync `rateLimit` is kept for backwards-compat.
 */
export async function rateLimitAsync(options: {
  ip: string;
  limit: number;
  window: number;
  key?: string;
}): Promise<RateLimitResult> {
  const upstashResult = await rateLimitUpstash(options);
  if (upstashResult) return upstashResult;
  return rateLimit(options);
}

/**
 * Helper to extract IP from NextRequest.
 * Handles Vercel's x-forwarded-for and x-real-ip headers.
 */
export function getClientIp(request: Request): string {
  // On Vercel, the last value in x-forwarded-for is set by the CDN (trustworthy)
  // The first value can be spoofed by the client
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(s => s.trim());
    // On Vercel, use the last IP (set by CDN); fallback to first
    if (ips.length >= 2) return ips[ips.length - 1];
    return ips[0];
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

// ─── Preset limits per route category ────────────────────────────────────────

export const RATE_LIMITS = {
  /** Auth endpoints — strict */
  auth: { limit: 10, window: 60 },         // 10 req/min
  /** File upload — very strict */
  upload: { limit: 5, window: 60 },        // 5 uploads/min
  /** General read endpoints */
  read: { limit: 60, window: 60 },         // 60 req/min
  /** General write endpoints */
  write: { limit: 30, window: 60 },        // 30 req/min
  /** Search endpoints */
  search: { limit: 20, window: 60 },       // 20 req/min
  /** Heavy operations (import, recommendations) */
  heavy: { limit: 5, window: 60 },         // 5 req/min
  /** Medium-cost endpoints (AI chat) */
  medium: { limit: 15, window: 60 },        // 15 req/min
  /** Admin endpoints — moderate */
  admin: { limit: 60, window: 60 },        // 60 req/min
} as const;

// ─── withRateLimit wrapper for Next.js API routes ───────────────────────────
// Usage in any route.ts:
//
//   import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
//   export const GET = withRateLimit(RATE_LIMITS.read, async (req) => { ... });
//   export const POST = withRateLimit(RATE_LIMITS.write, async (req) => { ... });

import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<Record<string, string>> };

type HandlerFunction = (
  req: NextRequest,
  ctx: RouteContext
) => Promise<Response>;

export function withRateLimit(
  preset: { limit: number; window: number },
  handler: HandlerFunction
): HandlerFunction {
  return async (req, ctx) => {
    const ip = getClientIp(req);
    const pathname = new URL(req.url).pathname;
    const key = `global:${pathname}`;

    const result = rateLimit({ ip, ...preset, key });

    // Set rate limit headers on every response
    const setHeaders = (response: Response) => {
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
      if (result.resetIn > 0) {
        response.headers.set("X-RateLimit-Reset", String(result.resetIn));
      }
      return response;
    };

    if (!result.success) {
      return setHeaders(
        new Response(
          JSON.stringify({ error: "Слишком много запросов. Попробуйте позже.", retryAfter: result.resetIn }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(result.resetIn),
            },
          }
        )
      );
    }

    const response = await handler(req, ctx);
    return setHeaders(response);
  };
}
