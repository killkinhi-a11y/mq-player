/**
 * Next.js Instrumentation Hook
 *
 * This file runs once per Node.js server process (not per request).
 * Used to initialize Sentry error tracking and Turso schema on Vercel serverless deployments.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // ── Sentry instrumentation ──────────────────────────────────────────────
  // Register Sentry config for the appropriate runtime.
  // Gracefully skips if no DSN is configured (the config files handle this
  // via their `beforeSend` hook returning null when DSN is empty).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  // ── Turso schema initialization ─────────────────────────────────────────
  // Only initialize Turso schema when Turso is configured (Vercel deployment)
  if (process.env.TURSO_DATABASE_URL) {
    try {
      const { initTursoSchema } = await import("./lib/turso");
      await initTursoSchema();
      console.log("[Instrumentation] Turso schema initialized ✓");
    } catch (error) {
      console.error("[Instrumentation] Failed to initialize Turso schema:", error);
    }
  } else {
    console.log("[Instrumentation] No TURSO_DATABASE_URL — skipping Turso init (using Prisma locally)");
  }
}
