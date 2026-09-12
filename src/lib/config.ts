/**
 * Centralized app configuration.
 * All environment-dependent values resolved here — no hardcoded URLs elsewhere.
 *
 * Why: 5 files had "https://mq1.vercel.app" hardcoded. Changing domain
 * required editing 5 files + redeploy. Now: change NEXT_PUBLIC_APP_URL env var.
 *
 * Environment variables:
 * - NEXT_PUBLIC_APP_URL: production URL (default: https://mq1.vercel.app)
 * - SOUNDCLOUD_CLIENT_IDS: comma-separated client IDs for SoundCloud API
 */

/** App URL — used for MediaSession artwork, Capacitor fallback, Telegram bot. */
export const APP_URL: string =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://mq1.vercel.app");

/** Whether we're running inside Capacitor (native APK). */
export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** Whether we're in production. */
export const IS_PROD: boolean = process.env.NODE_ENV === "production";

/**
 * SoundCloud client IDs — comma-separated in env, falls back to hardcoded pool.
 *
 * The pool is ordered: first entry is the currently working ID. SoundCloud
 * rotates IDs roughly quarterly; when the pool exhausts (all 401), the
 * extractor in `soundcloud.ts` fetches a fresh ID from the public SoundCloud
 * widget bundle (w.soundcloud.com → widget.sndcdn.com) — the same source
 * every browser visitor uses.
 *
 * Pool history:
 * - 2026-09: nIjtjiYnjkOhMyh5xrbqEW12DxeJVnic (widget-9 bundle, validated)
 * - 2025-07: O7atZypwLvuWSY9hWnnQ3vrLTHH7wqMe (dead 401 as of 2026-09)
 * - 2025-07: i53MAi5VcJrq7u38ZL1SOZtDi17ds1A0 (dead 401 as of 2026-09)
 */
export const SOUNDCLOUD_CLIENT_IDS: string[] = (
  process.env.SOUNDCLOUD_CLIENT_IDS ||
  "nIjtjiYnjkOhMyh5xrbqEW12DxeJVnic,O7atZypwLvuWSY9hWnnQ3vrLTHH7wqMe,i53MAi5VcJrq7u38ZL1SOZtDi17ds1A0"
).split(",");
