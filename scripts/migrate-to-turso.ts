/**
 * Migration Script: Prisma/PostgreSQL → Turso/libSQL
 *
 * Reads data from Prisma (PostgreSQL) and writes to Turso (libSQL).
 * Handles data transformation (JSON fields, dates, boolean → integer, etc.)
 *
 * Usage:
 *   # Dry run (preview what would be migrated)
 *   npx tsx scripts/migrate-to-turso.ts --dry-run
 *
 *   # Full migration
 *   npx tsx scripts/migrate-to-turso.ts
 *
 * Requirements:
 *   - DATABASE_URL must be set (PostgreSQL connection)
 *   - TURSO_DATABASE_URL must be set (Turso connection)
 *   - TURSO_AUTH_TOKEN must be set (Turso auth)
 */

import { PrismaClient } from "@prisma/client";
import { createClient, type Client } from "@libsql/client";

const prisma = new PrismaClient({ log: ["query"] });

function createTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required for migration");
  }

  return createClient({ url, ...(authToken ? { authToken } : {}) });
}

const turso = createTursoClient();
const isDryRun = process.argv.includes("--dry-run");

if (isDryRun) {
  console.log("🔍 DRY RUN — no data will be written to Turso\n");
}

// ── Helper functions ─────────────────────────────────────────────────────────

function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

function boolToInt(val: boolean | null | undefined): number {
  return val ? 1 : 0;
}

function generateId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 22)}`;
}

// ── Table migration functions ────────────────────────────────────────────────

async function migrateUsers(): Promise<number> {
  console.log("📋 Migrating Users...");
  const users = await prisma.user.findMany();
  console.log(`   Found ${users.length} users`);

  if (!isDryRun) {
    for (const u of users) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO User (id, username, email, password, confirmed, role, blocked, blockedAt, blockedReason, avatar, theme, accent, favoriteArtists, onboardingComplete, telegramChatId, telegramUsername, lastSeen, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          u.id, u.username, u.email, u.password,
          boolToInt(u.confirmed), u.role, boolToInt(u.blocked),
          toIsoDate(u.blockedAt), u.blockedReason ?? null,
          u.avatar, u.theme, u.accent, u.favoriteArtists,
          boolToInt(u.onboardingComplete),
          u.telegramChatId ?? null, u.telegramUsername ?? null,
          toIsoDate(u.lastSeen), u.createdAt.toISOString(),
        ],
      });
    }
  }

  return users.length;
}

async function migrateMessages(): Promise<number> {
  console.log("📋 Migrating Messages...");
  const messages = await prisma.message.findMany();
  console.log(`   Found ${messages.length} messages`);

  if (!isDryRun) {
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const stmts = batch.map((m) => ({
        sql: `INSERT OR IGNORE INTO Message (id, content, senderId, receiverId, encrypted, messageType, replyToId, edited, editedAt, deleted, voiceUrl, voiceDuration, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          m.id, m.content, m.senderId, m.receiverId,
          boolToInt(m.encrypted), m.messageType, m.replyToId ?? null,
          boolToInt(m.edited), toIsoDate(m.editedAt), boolToInt(m.deleted),
          m.voiceUrl ?? null, m.voiceDuration ?? null,
          m.createdAt.toISOString(),
        ],
      }));
      await turso.batch(stmts);
    }
  }

  return messages.length;
}

async function migrateFriends(): Promise<number> {
  console.log("📋 Migrating Friends...");
  const friends = await prisma.friend.findMany();
  console.log(`   Found ${friends.length} friends`);

  if (!isDryRun) {
    for (const f of friends) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Friend (id, requesterId, addresseeId, status, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          f.id, f.requesterId, f.addresseeId, f.status,
          f.createdAt.toISOString(), f.updatedAt.toISOString(),
        ],
      });
    }
  }

  return friends.length;
}

async function migrateVerificationCodes(): Promise<number> {
  console.log("📋 Migrating VerificationCodes...");
  const codes = await prisma.verificationCode.findMany();
  console.log(`   Found ${codes.length} verification codes`);

  if (!isDryRun) {
    for (const c of codes) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO VerificationCode (id, email, code, userId, expiresAt, used, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id, c.email, c.code, c.userId,
          c.expiresAt.toISOString(), boolToInt(c.used),
          c.createdAt.toISOString(),
        ],
      });
    }
  }

  return codes.length;
}

async function migrateUserSync(): Promise<number> {
  console.log("📋 Migrating UserSync...");
  const syncs = await prisma.userSync.findMany();
  console.log(`   Found ${syncs.length} sync records`);

  if (!isDryRun) {
    const batchSize = 100;
    for (let i = 0; i < syncs.length; i += batchSize) {
      const batch = syncs.slice(i, i + batchSize);
      const stmts = batch.map((s) => ({
        sql: `INSERT OR IGNORE INTO UserSync (id, userId, key, data, updatedAt)
              VALUES (?, ?, ?, ?, ?)`,
        args: [s.id, s.userId, s.key, s.data, s.updatedAt.toISOString()],
      }));
      await turso.batch(stmts);
    }
  }

  return syncs.length;
}

async function migratePlaylists(): Promise<number> {
  console.log("📋 Migrating Playlists...");
  const playlists = await prisma.playlist.findMany();
  console.log(`   Found ${playlists.length} playlists`);

  if (!isDryRun) {
    for (const p of playlists) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          p.id, p.userId, p.name, p.description, p.cover,
          boolToInt(p.isPublic), p.tags, p.tracksJson, p.playCount,
          p.createdAt.toISOString(), p.updatedAt.toISOString(),
        ],
      });
    }
  }

  return playlists.length;
}

async function migratePlaylistLikes(): Promise<number> {
  console.log("📋 Migrating PlaylistLikes...");
  const likes = await prisma.playlistLike.findMany();
  console.log(`   Found ${likes.length} playlist likes`);

  if (!isDryRun) {
    for (const l of likes) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO PlaylistLike (id, playlistId, userId, createdAt)
              VALUES (?, ?, ?, ?)`,
        args: [l.id, l.playlistId, l.userId, l.createdAt.toISOString()],
      });
    }
  }

  return likes.length;
}

async function migrateNotifications(): Promise<number> {
  console.log("📋 Migrating Notifications...");
  const notifications = await prisma.notification.findMany();
  console.log(`   Found ${notifications.length} notifications`);

  if (!isDryRun) {
    const batchSize = 100;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const stmts = batch.map((n) => ({
        sql: `INSERT OR IGNORE INTO Notification (id, userId, type, title, body, data, read, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          n.id, n.userId, n.type, n.title, n.body, n.data,
          boolToInt(n.read), n.createdAt.toISOString(),
        ],
      }));
      await turso.batch(stmts);
    }
  }

  return notifications.length;
}

async function migrateAuditLogs(): Promise<number> {
  console.log("📋 Migrating AuditLogs...");
  const logs = await prisma.auditLog.findMany();
  console.log(`   Found ${logs.length} audit logs`);

  if (!isDryRun) {
    for (const l of logs) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO AuditLog (id, adminId, action, targetId, details, createdAt)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [l.id, l.adminId, l.action, l.targetId ?? null, l.details ?? null, l.createdAt.toISOString()],
      });
    }
  }

  return logs.length;
}

async function migrateStories(): Promise<number> {
  console.log("📋 Migrating Stories...");
  const stories = await prisma.story.findMany();
  console.log(`   Found ${stories.length} stories`);

  if (!isDryRun) {
    for (const s of stories) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO Story (id, userId, type, content, bgColor, textColor, createdAt, expiresAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.id, s.userId, s.type, s.content, s.bgColor, s.textColor,
          s.createdAt.toISOString(), s.expiresAt.toISOString(),
        ],
      });
    }
  }

  return stories.length;
}

async function migrateStoryLikes(): Promise<number> {
  console.log("📋 Migrating StoryLikes...");
  const likes = await prisma.storyLike.findMany();
  console.log(`   Found ${likes.length} story likes`);

  if (!isDryRun) {
    for (const l of likes) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO StoryLike (id, storyId, userId, createdAt)
              VALUES (?, ?, ?, ?)`,
        args: [l.id, l.storyId, l.userId, l.createdAt.toISOString()],
      });
    }
  }

  return likes.length;
}

async function migrateStoryComments(): Promise<number> {
  console.log("📋 Migrating StoryComments...");
  const comments = await prisma.storyComment.findMany();
  console.log(`   Found ${comments.length} story comments`);

  if (!isDryRun) {
    for (const c of comments) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO StoryComment (id, storyId, userId, content, createdAt)
              VALUES (?, ?, ?, ?, ?)`,
        args: [c.id, c.storyId, c.userId, c.content, c.createdAt.toISOString()],
      });
    }
  }

  return comments.length;
}

async function migrateFeatureFlags(): Promise<number> {
  console.log("📋 Migrating FeatureFlags...");
  const flags = await prisma.featureFlag.findMany();
  console.log(`   Found ${flags.length} feature flags`);

  if (!isDryRun) {
    for (const f of flags) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO FeatureFlag (id, key, name, description, enabled, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          f.id, f.key, f.name, f.description ?? null,
          boolToInt(f.enabled), f.createdAt.toISOString(), f.updatedAt.toISOString(),
        ],
      });
    }
  }

  return flags.length;
}

async function migrateGroupChats(): Promise<number> {
  console.log("📋 Migrating GroupChats...");
  const chats = await prisma.groupChat.findMany();
  console.log(`   Found ${chats.length} group chats`);

  if (!isDryRun) {
    for (const c of chats) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO GroupChat (id, name, description, avatar, createdBy, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id, c.name, c.description, c.avatar, c.createdBy,
          c.createdAt.toISOString(), c.updatedAt.toISOString(),
        ],
      });
    }
  }

  return chats.length;
}

async function migrateGroupChatMembers(): Promise<number> {
  console.log("📋 Migrating GroupChatMembers...");
  const members = await prisma.groupChatMember.findMany();
  console.log(`   Found ${members.length} group chat members`);

  if (!isDryRun) {
    for (const m of members) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO GroupChatMember (id, groupChatId, userId, role, joinedAt)
              VALUES (?, ?, ?, ?, ?)`,
        args: [m.id, m.groupChatId, m.userId, m.role, m.joinedAt.toISOString()],
      });
    }
  }

  return members.length;
}

async function migrateGroupMessages(): Promise<number> {
  console.log("📋 Migrating GroupMessages...");
  const messages = await prisma.groupMessage.findMany();
  console.log(`   Found ${messages.length} group messages`);

  if (!isDryRun) {
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const stmts = batch.map((m) => ({
        sql: `INSERT OR IGNORE INTO GroupMessage (id, groupChatId, senderId, content, messageType, replyToId, edited, editedAt, deleted, voiceUrl, voiceDuration, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          m.id, m.groupChatId, m.senderId, m.content, m.messageType,
          m.replyToId ?? null, boolToInt(m.edited), toIsoDate(m.editedAt),
          boolToInt(m.deleted), m.voiceUrl ?? null, m.voiceDuration ?? null,
          m.createdAt.toISOString(),
        ],
      }));
      await turso.batch(stmts);
    }
  }

  return messages.length;
}

async function migrateListenSessions(): Promise<number> {
  console.log("📋 Migrating ListenSessions...");
  const sessions = await prisma.listenSession.findMany();
  console.log(`   Found ${sessions.length} listen sessions`);

  if (!isDryRun) {
    for (const s of sessions) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO ListenSession (id, hostId, guestId, trackId, trackTitle, trackArtist, trackCover, scTrackId, audioUrl, source, progress, isPlaying, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.id, s.hostId, s.guestId, s.trackId, s.trackTitle, s.trackArtist,
          s.trackCover, s.scTrackId ?? null, s.audioUrl, s.source,
          s.progress, boolToInt(s.isPlaying),
          s.createdAt.toISOString(), s.updatedAt.toISOString(),
        ],
      });
    }
  }

  return sessions.length;
}

async function migrateTypingEvents(): Promise<number> {
  console.log("📋 Migrating TypingEvents...");
  const events = await prisma.typingEvent.findMany();
  console.log(`   Found ${events.length} typing events`);

  if (!isDryRun) {
    for (const e of events) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO TypingEvent (id, userId, contactId, updatedAt)
              VALUES (?, ?, ?, ?)`,
        args: [e.id, e.userId, e.contactId, e.updatedAt.toISOString()],
      });
    }
  }

  return events.length;
}

async function migrateTrackComments(): Promise<number> {
  console.log("📋 Migrating TrackComments...");
  const comments = await prisma.trackComment.findMany();
  console.log(`   Found ${comments.length} track comments`);

  if (!isDryRun) {
    for (const c of comments) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO TrackComment (id, trackId, userId, username, avatar, content, timestamp, likes, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id, c.trackId, c.userId, c.username, c.avatar, c.content,
          c.timestamp, c.likes, c.createdAt.toISOString(),
        ],
      });
    }
  }

  return comments.length;
}

async function migrateTelegramAuthCodes(): Promise<number> {
  console.log("📋 Migrating TelegramAuthCodes...");
  const codes = await prisma.telegramAuthCode.findMany();
  console.log(`   Found ${codes.length} telegram auth codes`);

  if (!isDryRun) {
    for (const c of codes) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO TelegramAuthCode (id, chatId, telegramUserId, telegramUsername, code, expiresAt, used, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id, c.chatId, Number(c.telegramUserId), c.telegramUsername ?? null,
          c.code, c.expiresAt.toISOString(), boolToInt(c.used),
          c.createdAt.toISOString(),
        ],
      });
    }
  }

  return codes.length;
}

async function migrateTelegramBotStates(): Promise<number> {
  console.log("📋 Migrating TelegramBotStates...");
  const states = await prisma.telegramBotState.findMany();
  console.log(`   Found ${states.length} telegram bot states`);

  if (!isDryRun) {
    for (const s of states) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO TelegramBotState (id, chatId, state, data, results, audioBatch, collectingMessageId, updatedAt, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.id, s.chatId, s.state, s.data, s.results, s.audioBatch,
          s.collectingMessageId ?? null, s.updatedAt.toISOString(),
          s.createdAt.toISOString(),
        ],
      });
    }
  }

  return states.length;
}

async function migrateCronJobs(): Promise<number> {
  console.log("📋 Migrating CronJobs...");
  const jobs = await prisma.cronJob.findMany();
  console.log(`   Found ${jobs.length} cron jobs`);

  if (!isDryRun) {
    for (const j of jobs) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO CronJob (id, name, cronExpr, status, lastRun, nextRun, log, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          j.id, j.name, j.cronExpr ?? null, j.status,
          toIsoDate(j.lastRun), toIsoDate(j.nextRun), j.log ?? null,
          j.createdAt.toISOString(),
        ],
      });
    }
  }

  return jobs.length;
}

// ── Main migration ───────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Starting Prisma → Turso migration\n");
  console.log(`   Source: DATABASE_URL = ${process.env.DATABASE_URL?.slice(0, 30)}...`);
  console.log(`   Target: TURSO_DATABASE_URL = ${process.env.TURSO_DATABASE_URL?.slice(0, 30)}...`);
  console.log("");

  // Step 1: Initialize Turso schema
  if (!isDryRun) {
    console.log("📦 Initializing Turso schema...");
    const { initTursoSchema } = await import("../src/lib/turso");
    await initTursoSchema();
    console.log("   Schema initialized ✓\n");
  }

  // Step 2: Migrate all tables (order matters for foreign keys)
  const results: Record<string, number> = {};

  try {
    results.users = await migrateUsers();
    results.verificationCodes = await migrateVerificationCodes();
    results.telegramAuthCodes = await migrateTelegramAuthCodes();
    results.telegramBotStates = await migrateTelegramBotStates();
    results.messages = await migrateMessages();
    results.friends = await migrateFriends();
    results.userSync = await migrateUserSync();
    results.playlists = await migratePlaylists();
    results.playlistLikes = await migratePlaylistLikes();
    results.notifications = await migrateNotifications();
    results.auditLogs = await migrateAuditLogs();
    results.featureFlags = await migrateFeatureFlags();
    results.stories = await migrateStories();
    results.storyLikes = await migrateStoryLikes();
    results.storyComments = await migrateStoryComments();
    results.groupChats = await migrateGroupChats();
    results.groupChatMembers = await migrateGroupChatMembers();
    results.groupMessages = await migrateGroupMessages();
    results.listenSessions = await migrateListenSessions();
    results.typingEvents = await migrateTypingEvents();
    results.trackComments = await migrateTrackComments();
    results.cronJobs = await migrateCronJobs();
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(isDryRun ? "🔍 DRY RUN SUMMARY (no data written)" : "✅ MIGRATION COMPLETE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  let total = 0;
  for (const [table, count] of Object.entries(results)) {
    console.log(`   ${table}: ${count} rows`);
    total += count;
  }

  console.log(`\n   Total: ${total} rows ${isDryRun ? "would be" : "were"} migrated`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
