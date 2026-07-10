import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

// ── Neon cold start retry wrapper ──────────────────────────────────────────
// Neon free tier auto-suspends idle databases. First request after suspension
// takes 5-10s to wake up. Prisma doesn't retry by default, so we wrap it.
// Usage: await prismaRetry(() => db.user.findMany())
export async function prismaRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const msg = err?.message || String(err);
    // Only retry on connection errors (Neon cold start, network issues)
    const isConnectionError =
      msg.includes("Can't reach database") ||
      msg.includes("Connection terminated") ||
      msg.includes("Connection timed out") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("fetch failed") ||
      msg.includes("Server hasn't responded");

    if (isConnectionError && retries > 0) {
      console.warn(`[Prisma] Connection error, retrying (${retries} left): ${msg.slice(0, 100)}`);
      // Wait 2s before retry (gives Neon time to wake up)
      await new Promise(r => setTimeout(r, 2000));
      return prismaRetry(fn, retries - 1);
    }
    throw err;
  }
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ── Turso detection ─────────────────────────────────────────────────────────
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
