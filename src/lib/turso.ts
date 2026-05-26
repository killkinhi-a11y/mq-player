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

/** Turso client — lazily initialized on first access */
export const turso: Client = new Proxy({} as Client, {
  get(_target, prop) {
    return (getOrCreateTursoClient() as any)[prop];
  },
});

// ── Schema initialization helper ──
// Call this once on app startup to ensure all tables exist

export async function initTursoSchema(): Promise<void> {
  await turso.execute(`
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

  await turso.execute(`
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

  await turso.execute(`
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

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS PlaylistLike (
      id TEXT PRIMARY KEY,
      playlistId TEXT NOT NULL REFERENCES Playlist(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(playlistId, userId)
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS UserSync (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      data TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, key)
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
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

  await turso.execute(`
    CREATE INDEX IF NOT EXISTS idx_notification_user_read ON Notification(userId, read);
  `);

  await turso.execute(`
    CREATE INDEX IF NOT EXISTS idx_notification_user_created ON Notification(userId, createdAt);
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY,
      adminId TEXT NOT NULL REFERENCES User(id),
      action TEXT NOT NULL,
      targetId TEXT,
      details TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE INDEX IF NOT EXISTS idx_telegram_auth_code ON TelegramAuthCode(code, used, expiresAt);
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE INDEX IF NOT EXISTS idx_telegram_bot_chat ON TelegramBotState(chatId);
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE INDEX IF NOT EXISTS idx_track_comment ON TrackComment(trackId, createdAt);
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS GroupChatMember (
      id TEXT PRIMARY KEY,
      groupChatId TEXT NOT NULL REFERENCES GroupChat(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joinedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(groupChatId, userId)
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS TypingEvent (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      contactId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, contactId)
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS StoryLike (
      id TEXT PRIMARY KEY,
      storyId TEXT NOT NULL REFERENCES Story(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(storyId, userId)
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS StoryComment (
      id TEXT PRIMARY KEY,
      storyId TEXT NOT NULL REFERENCES Story(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES User(id),
      content TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
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

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS SupportChatMessage (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES SupportChatSession(sessionId) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  await turso.execute(`
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

  await turso.execute(`
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

  console.log("[Turso] Schema initialized ✓");
}
