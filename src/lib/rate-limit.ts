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
