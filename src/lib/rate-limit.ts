/**
 * In-memory rate limiter using sliding window per IP.
 * No external dependencies needed — works in serverless (Vercel) environments.
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rate-limit";
 *   const { success, remaining, resetIn } = rateLimit({ ip, limit: 10, window: 60 });
 */

interface RateLimitEntry {
  timestamps: number[];
}

// In-memory store (per-process; resets on cold start — acceptable for serverless)
const store = new Map<string, RateLimitEntry>();

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
 * Helper to extract IP from NextRequest.
 * Handles Vercel's x-forwarded-for and x-real-ip headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
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

type HandlerFunction = (
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
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
