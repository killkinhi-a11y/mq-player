import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ── Turso detection ─────────────────────────────────────────────────────────
// When TURSO_DATABASE_URL is set, the app should use Turso instead of Prisma.
// This flag is used by the database adapter in src/lib/database.ts.
// Prisma is still initialized above for local development and as a fallback.

/** True when Turso/libSQL should be used instead of Prisma (for Vercel serverless) */
export const USE_TURSO = !!process.env.TURSO_DATABASE_URL;

if (USE_TURSO && process.env.NODE_ENV === 'development') {
  console.log('[DB] Turso detected (TURSO_DATABASE_URL is set) — using Turso/libSQL');
} else if (process.env.NODE_ENV === 'development') {
  console.log('[DB] No TURSO_DATABASE_URL — using Prisma/PostgreSQL');
}

// Catch silent crashes in standalone mode
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err?.message || err);
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
})
