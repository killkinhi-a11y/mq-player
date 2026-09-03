/**
 * Turso (libSQL) Database Client
 *
 * Replaces the Prisma + PostgreSQL setup for Vercel serverless deployment.
 * Turso provides edge-compatible SQLite with free 500MB tier.
 *
 * Usage:
 *   1. Install Turso CLI: curl -sSfL https://get.tur.so/install.sh | bash
 *   2. Create database: turso db create mq-player
 *   3. Get URL: turso db show mq-player --url
 *   4. Get auth token: turso db tokens create mq-player
 *   5. Set env vars:
 *      TURSO_DATABASE_URL="libsql://mq-player-xxx.turso.io"
 *      TURSO_AUTH_TOKEN="eyJhbGciOiJF..."
 *
 * For local development, use a local SQLite file:
 *   TURSO_DATABASE_URL="file:./dev.db"
 *   (no TURSO_AUTH_TOKEN needed for local)
 */

import { createClient, type Client } from "@libsql/client";

const globalForTurso = globalThis as unknown as {
  tursoClient: Client | undefined;
};

function createTursoClient(): Client {
  // Only use TURSO_DATABASE_URL — never fall back to DATABASE_URL
  // because DATABASE_URL might be a postgresql:// URL which libSQL doesn't support
  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL environment variable is required for Turso. " +
      "For Turso: set TURSO_DATABASE_URL=libsql://your-db.turso.io and TURSO_AUTH_TOKEN=your-token. " +
      "For local dev: set TURSO_DATABASE_URL=file:./dev.db"
    );
  }

  const authToken = process.env.TURSO_AUTH_TOKEN;

  const client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });

  return client;
}

// Lazy initialization — don't create the client at module import time
// because that would fail if TURSO_DATABASE_URL is not set (e.g., local dev with Prisma)
function getOrCreateTursoClient(): Client {
  if (!globalForTurso.tursoClient) {
    globalForTurso.tursoClient = createTursoClient();
  }
  return globalForTurso.tursoClient;
}

/** Get the Turso client (throws if TURSO_DATABASE_URL is not set) */
export function getTurso(): Client {
  return getOrCreateTursoClient();
}

// ── Auto schema initialization ──────────────────────────────────────────────
// Track whether schema has been initialized in this process
let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

/**
 * Ensure schema exists — call this before any DB operation.
 * Uses a singleton promise so multiple concurrent calls don't re-init.
 * Safe to call multiple times — no-op after first success.
 */
export async function ensureTursoSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;
  schemaInitPromise = initTursoSchema().then(() => {
    schemaInitialized = true;
    schemaInitPromise = null;
  }).catch((err) => {
    schemaInitPromise = null;
    throw err;
  });
  return schemaInitPromise;
}

/**
 * Execute a Turso query with auto schema initialization + retry.
 * If the first attempt fails with "no such table", initializes the schema
 * and retries once. This fixes the "ensureSchema never called" bug where
 * tables don't exist on fresh Turso databases.
 */
export async function tursoQuery<T>(
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const msg = err?.message || String(err);
    // If table doesn't exist, init schema and retry
    if (msg.includes("no such table") || msg.includes("does not exist")) {
      console.warn("[Turso] Table missing — initializing schema and retrying...");
      await ensureTursoSchema();
      return await fn();
    }
    throw err;
  }
}

/** Turso client — lazily initialized on first access */
export const turso: Client = new Proxy({} as Client, {
  get(_target, prop) {
    return (getOrCreateTursoClient() as any)[prop];
  },
});

// ── Schema initialization helper ──
// Call this once on app startup to ensure all tables exist

export async function initTursoSchema(): Promise<void> {
  // Use getTurso() directly instead of the turso Proxy — the Proxy
  // causes "Cannot read private member #promiseLimitFunction" errors
  // on Vercel serverless because the Proxy intercepts property access
  // differently than direct method calls.
  const client = getTurso();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      confirmed INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      blocked INTEGER DEFAULT 0,
      blockedAt TEXT,
      blockedReason TEXT,
      avatar TEXT DEFAULT '',
      theme TEXT DEFAULT 'default',
      accent TEXT DEFAULT '#e03131',
      favoriteArtists TEXT DEFAULT '[]',
      onboardingComplete INTEGER DEFAULT 0,
      telegramChatId TEXT UNIQUE,
      telegramUsername TEXT,
      lastSeen TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Message (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      senderId TEXT NOT NULL REFERENCES User(id),
      receiverId TEXT NOT NULL REFERENCES User(id),
      encrypted INTEGER DEFAULT 1,
      messageType TEXT DEFAULT 'text',
      replyToId TEXT,
      edited INTEGER DEFAULT 0,
      editedAt TEXT,
      deleted INTEGER DEFAULT 0,
      voiceUrl TEXT,
      voiceDuration REAL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Friend (
      id TEXT PRIMARY KEY,
      requesterId TEXT NOT NULL REFERENCES User(id),
      addresseeId TEXT NOT NULL REFERENCES User(id),
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(requesterId, addresseeId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Playlist (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      isPublic INTEGER DEFAULT 1,
      tags TEXT DEFAULT '',
      tracksJson TEXT DEFAULT '[]',
      playCount INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS PlaylistLike (
      id TEXT PRIMARY KEY,
      playlistId TEXT NOT NULL REFERENCES Playlist(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(playlistId, userId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS VerificationCode (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(email, code)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS UserSync (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      data TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, key)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ListenSession (
      id TEXT PRIMARY KEY,
      hostId TEXT NOT NULL REFERENCES User(id),
      guestId TEXT NOT NULL REFERENCES User(id),
      trackId TEXT NOT NULL,
      trackTitle TEXT NOT NULL,
      trackArtist TEXT NOT NULL,
      trackCover TEXT DEFAULT '',
      scTrackId INTEGER,
      audioUrl TEXT DEFAULT '',
      source TEXT DEFAULT 'soundcloud',
      progress REAL DEFAULT 0,
      isPlaying INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(hostId, guestId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Notification (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Social: now-listening / live group sessions ────────────────────────────
  // Mirrors Prisma models ListeningStatus / LiveSession / LiveSessionMember.
  // Phase 3: social routes migrated to the database adapter — these tables
  // must exist in Turso (production) as well, not only in Prisma/Neon.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ListeningStatus (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE REFERENCES User(id) ON DELETE CASCADE,
      trackId TEXT NOT NULL,
      trackTitle TEXT NOT NULL,
      trackArtist TEXT NOT NULL,
      trackCover TEXT DEFAULT '',
      scTrackId INTEGER,
      isPlaying INTEGER DEFAULT 1,
      progress REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      source TEXT DEFAULT 'soundcloud',
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_listeningstatus_updated ON ListeningStatus(updatedAt);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS LiveSession (
      id TEXT PRIMARY KEY,
      hostId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      trackId TEXT NOT NULL,
      trackTitle TEXT NOT NULL,
      trackArtist TEXT NOT NULL,
      trackCover TEXT DEFAULT '',
      scTrackId INTEGER,
      audioUrl TEXT DEFAULT '',
      source TEXT DEFAULT 'soundcloud',
      progress REAL DEFAULT 0,
      isPlaying INTEGER DEFAULT 1,
      guestCount INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_livesession_host ON LiveSession(hostId);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_livesession_code ON LiveSession(code);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS LiveSessionMember (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES LiveSession(id) ON DELETE CASCADE,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      joinedAt TEXT DEFAULT (datetime('now')),
      lastSyncAt TEXT DEFAULT (datetime('now')),
      UNIQUE(sessionId, userId)
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_livesessionmember_session ON LiveSessionMember(sessionId);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_notification_user_read ON Notification(userId, read);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_notification_user_created ON Notification(userId, createdAt);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY,
      adminId TEXT NOT NULL REFERENCES User(id),
      action TEXT NOT NULL,
      targetId TEXT,
      details TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS TelegramAuthCode (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      telegramUserId INTEGER NOT NULL,
      telegramUsername TEXT,
      code TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(chatId, code)
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_telegram_auth_code ON TelegramAuthCode(code, used, expiresAt);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS TelegramBotState (
      id TEXT PRIMARY KEY,
      chatId TEXT UNIQUE NOT NULL,
      state TEXT DEFAULT 'idle',
      data TEXT DEFAULT '{}',
      results TEXT DEFAULT '[]',
      audioBatch TEXT DEFAULT '[]',
      collectingMessageId INTEGER,
      updatedAt TEXT DEFAULT (datetime('now')),
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_telegram_bot_chat ON TelegramBotState(chatId);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS TrackComment (
      id TEXT PRIMARY KEY,
      trackId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      content TEXT NOT NULL,
      timestamp REAL NOT NULL,
      likes INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_track_comment ON TrackComment(trackId, createdAt);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS GroupChat (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      createdBy TEXT NOT NULL REFERENCES User(id),
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS GroupChatMember (
      id TEXT PRIMARY KEY,
      groupChatId TEXT NOT NULL REFERENCES GroupChat(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joinedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(groupChatId, userId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS GroupMessage (
      id TEXT PRIMARY KEY,
      groupChatId TEXT NOT NULL REFERENCES GroupChat(id) ON DELETE CASCADE,
      senderId TEXT NOT NULL REFERENCES User(id),
      content TEXT NOT NULL,
      messageType TEXT DEFAULT 'text',
      replyToId TEXT,
      edited INTEGER DEFAULT 0,
      editedAt TEXT,
      deleted INTEGER DEFAULT 0,
      voiceUrl TEXT,
      voiceDuration REAL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS TypingEvent (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      contactId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, contactId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Story (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id),
      type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      bgColor TEXT DEFAULT '#1a1a2e',
      textColor TEXT DEFAULT '#ffffff',
      createdAt TEXT DEFAULT (datetime('now')),
      expiresAt TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS StoryLike (
      id TEXT PRIMARY KEY,
      storyId TEXT NOT NULL REFERENCES Story(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(storyId, userId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS StoryComment (
      id TEXT PRIMARY KEY,
      storyId TEXT NOT NULL REFERENCES Story(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      content TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS SupportMessage (
      id TEXT PRIMARY KEY,
      userId TEXT,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS SupportChatSession (
      id TEXT PRIMARY KEY,
      sessionId TEXT UNIQUE NOT NULL,
      userId TEXT,
      userName TEXT,
      lastMessage TEXT DEFAULT '',
      messageCount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS SupportChatMessage (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES SupportChatSession(sessionId) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS FeatureFlag (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  // NOTE (Phase 3): each execute() must contain exactly ONE statement — libSQL
  // silently drops everything after the first semicolon in local file mode and
  // hard-fails parsing multi-statement strings over Hrana (production).
  // "limit" is a SQLite keyword and MUST stay quoted as a column name.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS CronJob (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cronExpr TEXT,
      status TEXT DEFAULT 'idle',
      lastRun TEXT,
      nextRun TEXT,
      log TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS SmartPlaylist (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      rules TEXT NOT NULL DEFAULT '[]',
      "limit" INTEGER DEFAULT 100,
      sortBy TEXT DEFAULT 'createdAt',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_smartplaylist_userId ON SmartPlaylist(userId);
  `);

  console.log("[Turso] Schema initialized ✓");
}
