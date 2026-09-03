/**
 * Unified Database Adapter
 *
 * Auto-selects Turso on Vercel (when TURSO_DATABASE_URL is set), Prisma locally.
 * Provides helper functions that work with both backends, abstracting away
 * the differences between Prisma ORM queries and raw Turso/libSQL queries.
 *
 * Usage:
 *   import { database, isTurso } from "@/lib/database";
 *
 *   // High-level helpers (recommended):
 *   const user = await database.findUserByEmail("test@example.com");
 *
 *   // Direct client access (for complex queries not yet in the adapter):
 *   if (isTurso()) {
 *     const result = await getTurso().execute("SELECT * FROM User WHERE id = ?", [id]);
 *   } else {
 *     const user = await db.user.findUnique({ where: { id } });
 *   }
 */

import { db } from "@/lib/db";
import { getTurso, initTursoSchema, ensureTursoSchema, tursoQuery } from "@/lib/turso";

// Re-export for external consumers (telegram-bot.ts etc.)
export { tursoQuery, ensureTursoSchema };
import type { Client, InValue } from "@libsql/client";
import { randomUUID } from "crypto";

/** Generate a unique ID (compatible with Prisma's cuid format) */
function createId(): string {
  // Use a cuid-like format: 'c' prefix + timestamp + random
  return `c${Date.now().toString(36)}${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ── Environment detection ────────────────────────────────────────────────────

/** Returns true when TURSO_DATABASE_URL is configured (i.e., on Vercel or when explicitly set) */
export function isTurso(): boolean {
  return !!process.env.TURSO_DATABASE_URL;
}

/** Returns the active Turso client (throws if Turso is not configured) */
export function getTursoClient(): Client {
  if (!isTurso()) {
    throw new Error("TURSO_DATABASE_URL is not configured");
  }
  return getTurso();
}

// ── Type definitions ─────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password: string;
  confirmed: boolean;
  role: string;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  avatar: string;
  theme: string;
  accent: string;
  favoriteArtists: string;
  onboardingComplete: boolean;
  telegramChatId: string | null;
  telegramUsername: string | null;
  lastSeen: string | null;
  createdAt: string;
}

export interface VerificationCodeRow {
  id: string;
  email: string;
  code: string;
  userId: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface TelegramAuthCodeRow {
  id: string;
  chatId: string;
  telegramUserId: number;
  telegramUsername: string | null;
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface FeatureFlagRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: string;
  read: boolean;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  encrypted: boolean;
  messageType: string;
  replyToId: string | null;
  edited: boolean;
  editedAt: string | null;
  deleted: boolean;
  voiceUrl: string | null;
  voiceDuration: number | null;
  createdAt: string;
}

export interface FriendRow {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSyncRow {
  id: string;
  userId: string;
  key: string;
  data: string;
  updatedAt: string;
}

export interface PlaylistRow {
  id: string;
  userId: string;
  name: string;
  description: string;
  cover: string;
  isPublic: boolean;
  tags: string;
  tracksJson: string;
  playCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistLikeRow {
  id: string;
  playlistId: string;
  userId: string;
  createdAt: string;
}

export interface ListenSessionRow {
  id: string;
  hostId: string;
  guestId: string;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  scTrackId: number | null;
  audioUrl: string;
  source: string;
  progress: number;
  isPlaying: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListeningStatusRow {
  id: string;
  userId: string;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  scTrackId: number | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  source: string;
  updatedAt: string;
}

export interface LiveSessionRow {
  id: string;
  hostId: string;
  code: string;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  scTrackId: number | null;
  audioUrl: string;
  source: string;
  progress: number;
  isPlaying: boolean;
  guestCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveSessionMemberRow {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  avatar: string;
  joinedAt: string;
  lastSyncAt: string;
}

export interface TypingEventRow {
  id: string;
  userId: string;
  contactId: string;
  updatedAt: string;
}

export interface TrackCommentRow {
  id: string;
  trackId: string;
  userId: string;
  username: string;
  avatar: string;
  content: string;
  timestamp: number;
  likes: number;
  createdAt: string;
}

export interface GroupChatRow {
  id: string;
  name: string;
  description: string;
  avatar: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupChatMemberRow {
  id: string;
  groupChatId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface GroupMessageRow {
  id: string;
  groupChatId: string;
  senderId: string;
  content: string;
  messageType: string;
  replyToId: string | null;
  edited: boolean;
  editedAt: string | null;
  deleted: boolean;
  voiceUrl: string | null;
  voiceDuration: number | null;
  createdAt: string;
}

export interface StoryRow {
  id: string;
  userId: string;
  type: string;
  content: string;
  bgColor: string;
  textColor: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoryLikeRow {
  id: string;
  storyId: string;
  userId: string;
  createdAt: string;
}

export interface StoryCommentRow {
  id: string;
  storyId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  adminId: string;
  action: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export interface SupportMessageRow {
  id: string;
  userId: string | null;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface SupportChatSessionRow {
  id: string;
  sessionId: string;
  userId: string | null;
  userName: string | null;
  lastMessage: string;
  messageCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportChatMessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface TelegramBotStateRow {
  id: string;
  chatId: string;
  state: string;
  data: string;
  results: string;
  audioBatch: string;
  collectingMessageId: number | null;
  updatedAt: string;
  createdAt: string;
}

export interface CronJobRow {
  id: string;
  name: string;
  cronExpr: string | null;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  log: string | null;
  createdAt: string;
}

// ── Helper: parse Turso row into typed object ────────────────────────────────

function toBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val === "1" || val.toLowerCase() === "true";
  return false;
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return Number(val);
  return 0;
}

function toString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

function toNullableString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

// ── Turso row parsers ────────────────────────────────────────────────────────

function parseUserRow(row: Record<string, unknown>): UserRow {
  return {
    id: toString(row.id),
    username: toString(row.username),
    email: toString(row.email),
    password: toString(row.password),
    confirmed: toBool(row.confirmed),
    role: toString(row.role),
    blocked: toBool(row.blocked),
    blockedAt: toNullableString(row.blockedAt),
    blockedReason: toNullableString(row.blockedReason),
    avatar: toString(row.avatar),
    theme: toString(row.theme),
    accent: toString(row.accent),
    favoriteArtists: toString(row.favoriteArtists),
    onboardingComplete: toBool(row.onboardingComplete),
    telegramChatId: toNullableString(row.telegramChatId),
    telegramUsername: toNullableString(row.telegramUsername),
    lastSeen: toNullableString(row.lastSeen),
    createdAt: toString(row.createdAt),
  };
}

function parseVerificationCodeRow(row: Record<string, unknown>): VerificationCodeRow {
  return {
    id: toString(row.id),
    email: toString(row.email),
    code: toString(row.code),
    userId: toString(row.userId),
    expiresAt: toString(row.expiresAt),
    used: toBool(row.used),
    createdAt: toString(row.createdAt),
  };
}

function parseTelegramAuthCodeRow(row: Record<string, unknown>): TelegramAuthCodeRow {
  return {
    id: toString(row.id),
    chatId: toString(row.chatId),
    telegramUserId: toNumber(row.telegramUserId),
    telegramUsername: toNullableString(row.telegramUsername),
    code: toString(row.code),
    expiresAt: toString(row.expiresAt),
    used: toBool(row.used),
    createdAt: toString(row.createdAt),
  };
}

function parseFeatureFlagRow(row: Record<string, unknown>): FeatureFlagRow {
  return {
    id: toString(row.id),
    key: toString(row.key),
    name: toString(row.name),
    description: toNullableString(row.description),
    enabled: toBool(row.enabled),
    createdAt: toString(row.createdAt),
    updatedAt: toString(row.updatedAt),
  };
}

function parseNotificationRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: toString(row.id),
    userId: toString(row.userId),
    type: toString(row.type),
    title: toString(row.title),
    body: toString(row.body),
    data: toString(row.data),
    read: toBool(row.read),
    createdAt: toString(row.createdAt),
  };
}

function parseFriendRow(row: Record<string, unknown>): FriendRow {
  return {
    id: toString(row.id),
    requesterId: toString(row.requesterId),
    addresseeId: toString(row.addresseeId),
    status: toString(row.status),
    createdAt: toString(row.createdAt),
    updatedAt: toString(row.updatedAt),
  };
}

function parseUserSyncRow(row: Record<string, unknown>): UserSyncRow {
  return {
    id: toString(row.id),
    userId: toString(row.userId),
    key: toString(row.key),
    data: toString(row.data),
    updatedAt: toString(row.updatedAt),
  };
}

function parseListeningStatusRow(row: Record<string, unknown>): ListeningStatusRow {
  return {
    id: toString(row.id),
    userId: toString(row.userId),
    trackId: toString(row.trackId),
    trackTitle: toString(row.trackTitle),
    trackArtist: toString(row.trackArtist),
    trackCover: toString(row.trackCover),
    scTrackId: toNullableNumber(row.scTrackId),
    isPlaying: toBool(row.isPlaying),
    progress: toNumber(row.progress),
    duration: toNumber(row.duration),
    source: toString(row.source),
    updatedAt: toString(row.updatedAt),
  };
}

function parseLiveSessionRow(row: Record<string, unknown>): LiveSessionRow {
  return {
    id: toString(row.id),
    hostId: toString(row.hostId),
    code: toString(row.code),
    trackId: toString(row.trackId),
    trackTitle: toString(row.trackTitle),
    trackArtist: toString(row.trackArtist),
    trackCover: toString(row.trackCover),
    scTrackId: toNullableNumber(row.scTrackId),
    audioUrl: toString(row.audioUrl),
    source: toString(row.source),
    progress: toNumber(row.progress),
    isPlaying: toBool(row.isPlaying),
    guestCount: toNumber(row.guestCount),
    createdAt: toString(row.createdAt),
    updatedAt: toString(row.updatedAt),
  };
}

function parseLiveSessionMemberRow(row: Record<string, unknown>): LiveSessionMemberRow {
  return {
    id: toString(row.id),
    sessionId: toString(row.sessionId),
    userId: toString(row.userId),
    username: toString(row.username),
    avatar: toString(row.avatar),
    joinedAt: toString(row.joinedAt),
    lastSyncAt: toString(row.lastSyncAt),
  };
}

function parsePlaylistRow(row: Record<string, unknown>): PlaylistRow {
  return {
    id: toString(row.id),
    userId: toString(row.userId),
    name: toString(row.name),
    description: toString(row.description),
    cover: toString(row.cover),
    isPublic: toBool(row.isPublic),
    tags: toString(row.tags),
    tracksJson: toString(row.tracksJson),
    playCount: toNumber(row.playCount),
    createdAt: toString(row.createdAt),
    updatedAt: toString(row.updatedAt),
  };
}

function parseMessageRow(row: Record<string, unknown>): MessageRow {
  return {
    id: toString(row.id),
    content: toString(row.content),
    senderId: toString(row.senderId),
    receiverId: toString(row.receiverId),
    encrypted: toBool(row.encrypted),
    messageType: toString(row.messageType),
    replyToId: toNullableString(row.replyToId),
    edited: toBool(row.edited),
    editedAt: toNullableString(row.editedAt),
    deleted: toBool(row.deleted),
    voiceUrl: toNullableString(row.voiceUrl),
    voiceDuration: toNullableNumber(row.voiceDuration),
    createdAt: toString(row.createdAt),
  };
}

function parseTelegramBotStateRow(row: Record<string, unknown>): TelegramBotStateRow {
  return {
    id: toString(row.id),
    chatId: toString(row.chatId),
    state: toString(row.state),
    data: toString(row.data),
    results: toString(row.results),
    audioBatch: toString(row.audioBatch),
    collectingMessageId: toNullableNumber(row.collectingMessageId),
    updatedAt: toString(row.updatedAt),
    createdAt: toString(row.createdAt),
  };
}

// ── Unified Database Adapter ─────────────────────────────────────────────────

export const database = {
  // ─── User operations ─────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<UserRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM User WHERE email = ?",
        args: [email],
      });
      if (result.rows.length === 0) return null;
      return parseUserRow(result.rows[0] as Record<string, unknown>);
    }
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async findUserById(id: string): Promise<UserRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM User WHERE id = ?",
        args: [id],
      });
      if (result.rows.length === 0) return null;
      return parseUserRow(result.rows[0] as Record<string, unknown>);
    }
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async findUserByUsername(username: string): Promise<UserRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM User WHERE username = ?",
        args: [username],
      });
      if (result.rows.length === 0) return null;
      return parseUserRow(result.rows[0] as Record<string, unknown>);
    }
    const user = await db.user.findUnique({ where: { username } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async findUserByTelegramChatId(chatId: string): Promise<UserRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM User WHERE telegramChatId = ?",
        args: [chatId],
      });
      if (result.rows.length === 0) return null;
      return parseUserRow(result.rows[0] as Record<string, unknown>);
    }
    const user = await db.user.findUnique({ where: { telegramChatId: chatId } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async createUser(data: {
    username: string;
    email: string;
    password: string;
    confirmed?: boolean;
    role?: string;
    telegramChatId?: string | null;
    telegramUsername?: string | null;
    avatar?: string;
    theme?: string;
    accent?: string;
    favoriteArtists?: string;
    onboardingComplete?: boolean;
  }): Promise<UserRow> {
    const id = createId();
    if (isTurso()) {
      await getTurso().execute({
        sql: `INSERT INTO User (id, username, email, password, confirmed, role, blocked, avatar, theme, accent, favoriteArtists, onboardingComplete, telegramChatId, telegramUsername)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          data.username,
          data.email,
          data.password,
          data.confirmed ? 1 : 0,
          data.role || "user",
          data.avatar || "",
          data.theme || "default",
          data.accent || "#e03131",
          data.favoriteArtists || "[]",
          data.onboardingComplete ? 1 : 0,
          data.telegramChatId ?? null,
          data.telegramUsername ?? null,
        ],
      });
      const user = await this.findUserById(id);
      return user!;
    }
    const user = await db.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: data.password,
        confirmed: data.confirmed ?? false,
        role: data.role,
        telegramChatId: data.telegramChatId,
        telegramUsername: data.telegramUsername,
        avatar: data.avatar,
        theme: data.theme,
        accent: data.accent,
        favoriteArtists: data.favoriteArtists,
        onboardingComplete: data.onboardingComplete,
      },
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async updateUser(id: string, data: Record<string, unknown>): Promise<void> {
    if (isTurso()) {
      const allowedFields = [
        "username", "email", "password", "confirmed", "role", "blocked",
        "blockedAt", "blockedReason", "avatar", "theme", "accent",
        "favoriteArtists", "onboardingComplete", "telegramChatId",
        "telegramUsername", "lastSeen",
      ];

      const setClauses: string[] = [];
      const args: InValue[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (!allowedFields.includes(key)) continue;

        // Convert booleans to integers for SQLite
        let sqlValue = value;
        if (typeof value === "boolean") {
          sqlValue = value ? 1 : 0;
        } else if (value instanceof Date) {
          sqlValue = value.toISOString();
        } else if (value === undefined) {
          continue;
        }

        setClauses.push(`${key} = ?`);
        args.push(sqlValue as InValue);
      }

      if (setClauses.length === 0) return;

      args.push(id);
      await getTurso().execute({
        sql: `UPDATE User SET ${setClauses.join(", ")} WHERE id = ?`,
        args,
      });
      return;
    }

    // Prisma: convert string dates back to Date objects
    const prismaData: Record<string, unknown> = {};
    const dateFields = ["blockedAt", "lastSeen"];
    for (const [key, value] of Object.entries(data)) {
      if (dateFields.includes(key) && typeof value === "string") {
        prismaData[key] = new Date(value);
      } else {
        prismaData[key] = value;
      }
    }

    await db.user.update({ where: { id }, data: prismaData });
  },

  async findUserFirstWhereNotId(where: { username: string; id: string }): Promise<UserRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM User WHERE username = ? AND id != ?",
        args: [where.username, where.id],
      });
      if (result.rows.length === 0) return null;
      return parseUserRow(result.rows[0] as Record<string, unknown>);
    }
    const user = await db.user.findFirst({
      where: { username: where.username, id: { not: where.id } },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      confirmed: user.confirmed,
      role: user.role,
      blocked: user.blocked,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      blockedReason: user.blockedReason ?? null,
      avatar: user.avatar,
      theme: user.theme,
      accent: user.accent,
      favoriteArtists: user.favoriteArtists,
      onboardingComplete: user.onboardingComplete,
      telegramChatId: user.telegramChatId ?? null,
      telegramUsername: user.telegramUsername ?? null,
      lastSeen: user.lastSeen?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  },

  async deleteUser(id: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({ sql: "DELETE FROM User WHERE id = ?", args: [id] });
      return;
    }
    await db.user.delete({ where: { id } });
  },

  /**
   * Cascade-delete a user and all their related data.
   * Used by admin user-delete and self-delete flows.
   * On Turso: runs a sequence of DELETE statements (libSQL doesn't support
   * interactive transactions the way Prisma does, so we batch the deletes).
   * On Prisma: uses db.$transaction for atomicity.
   */
  async deleteUserCascade(id: string): Promise<void> {
    if (isTurso()) {
      const t = getTurso();
      // Order matters: child tables first.
      // batch() accepts an array of SQL statements (not Promise<ResultSet>).
      await t.batch([
        { sql: "DELETE FROM Message WHERE senderId = ? OR receiverId = ?", args: [id, id] },
        { sql: "DELETE FROM Friend WHERE requesterId = ? OR addresseeId = ?", args: [id, id] },
        { sql: "DELETE FROM StoryLike WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM StoryComment WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM Story WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM PlaylistLike WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM Playlist WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM UserSync WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM GroupChatMember WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM GroupMessage WHERE senderId = ?", args: [id] },
        { sql: "DELETE FROM Notification WHERE userId = ?", args: [id] },
        { sql: "DELETE FROM ListenSession WHERE hostId = ? OR guestId = ?", args: [id, id] },
        { sql: "DELETE FROM VerificationCode WHERE userId = ?", args: [id] },
      ]);
      // Find group chats created by this user and cascade-delete them
      const createdGroups = await t.execute({ sql: "SELECT id FROM GroupChat WHERE createdBy = ?", args: [id] });
      const groupIds = createdGroups.rows.map((r) => String((r as Record<string, unknown>).id));
      for (const gId of groupIds) {
        await t.batch([
          { sql: "DELETE FROM GroupChatMember WHERE groupChatId = ?", args: [gId] },
          { sql: "DELETE FROM GroupMessage WHERE groupChatId = ?", args: [gId] },
          { sql: "DELETE FROM GroupChat WHERE id = ?", args: [gId] },
        ]);
      }
      // Finally delete the user
      await t.execute({ sql: "DELETE FROM User WHERE id = ?", args: [id] });
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
      await tx.friend.deleteMany({ where: { OR: [{ requesterId: id }, { addresseeId: id }] } });
      await tx.storyLike.deleteMany({ where: { userId: id } });
      await tx.storyComment.deleteMany({ where: { userId: id } });
      await tx.story.deleteMany({ where: { userId: id } });
      await tx.playlistLike.deleteMany({ where: { userId: id } });
      await tx.playlist.deleteMany({ where: { userId: id } });
      await tx.userSync.deleteMany({ where: { userId: id } });
      await tx.groupChatMember.deleteMany({ where: { userId: id } });
      await tx.groupMessage.deleteMany({ where: { senderId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.listenSession.deleteMany({ where: { OR: [{ hostId: id }, { guestId: id }] } });
      const createdGroups = await tx.groupChat.findMany({ where: { createdBy: id }, select: { id: true } });
      for (const g of createdGroups) {
        await tx.groupChatMember.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupMessage.deleteMany({ where: { groupChatId: g.id } });
        await tx.groupChat.delete({ where: { id: g.id } });
      }
      await tx.verificationCode.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  },

  async countUsers(): Promise<number> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT COUNT(*) as count FROM User");
      return Number(result.rows[0]?.count ?? 0);
    }
    return db.user.count();
  },

  /**
   * Paginated user list with optional substring search across username + email.
   * Returns minimal fields for admin tables (no password, no favoriteArtists).
   */
  async findManyUsers(opts: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{ users: Array<{
    id: string;
    username: string;
    email: string;
    confirmed: boolean;
    role: string;
    blocked: boolean;
    blockedAt: string | null;
    blockedReason: string | null;
    createdAt: string;
  }>; total: number }> {
    const { page, limit, search } = opts;
    const offset = (page - 1) * limit;
    if (isTurso()) {
      if (search) {
        const like = `%${search}%`;
        const totalResult = await getTurso().execute({
          sql: "SELECT COUNT(*) as count FROM User WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?)",
          args: [like, like],
        });
        const total = Number(totalResult.rows[0]?.count ?? 0);
        const result = await getTurso().execute({
          sql: "SELECT id, username, email, confirmed, role, blocked, blockedAt, blockedReason, createdAt FROM User WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) ORDER BY createdAt DESC LIMIT ? OFFSET ?",
          args: [like, like, limit, offset],
        });
        return { users: result.rows.map((r) => parseUserRow(r as Record<string, unknown>)!).filter(Boolean) as any, total };
      }
      const totalResult = await getTurso().execute("SELECT COUNT(*) as count FROM User");
      const total = Number(totalResult.rows[0]?.count ?? 0);
      const result = await getTurso().execute({
        sql: "SELECT id, username, email, confirmed, role, blocked, blockedAt, blockedReason, createdAt FROM User ORDER BY createdAt DESC LIMIT ? OFFSET ?",
        args: [limit, offset],
      });
      return { users: result.rows.map((r) => parseUserRow(r as Record<string, unknown>)!).filter(Boolean) as any, total };
    }
    const where: Record<string, unknown> = search
      ? { OR: [{ username: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] }
      : {};
    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true, username: true, email: true, confirmed: true, role: true,
          blocked: true, blockedAt: true, blockedReason: true, createdAt: true,
        },
      }),
      db.user.count({ where }),
    ]);
    return {
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        confirmed: u.confirmed,
        role: u.role,
        blocked: u.blocked,
        blockedAt: u.blockedAt?.toISOString() ?? null,
        blockedReason: u.blockedReason ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
    };
  },

  /** Count transactions (for admin billing dashboard). */
  async countTransactions(): Promise<number> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT COUNT(*) as count FROM Transaction");
      return Number(result.rows[0]?.count ?? 0);
    }
    return db.transaction.count();
  },

  /** Sum revenue (only completed transactions). */
  async sumRevenue(): Promise<number> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT COALESCE(SUM(amount), 0) as total FROM Transaction WHERE status = 'completed'");
      return Number(result.rows[0]?.total ?? 0);
    }
    const agg = await db.transaction.aggregate({ _sum: { amount: true }, where: { status: "completed" } });
    return agg._sum.amount ?? 0;
  },

  /** Find all feature flags. */
  async findAllFeatureFlags(): Promise<FeatureFlagRow[]> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT * FROM FeatureFlag ORDER BY createdAt DESC");
      return result.rows.map((r) => parseFeatureFlagRow(r as Record<string, unknown>));
    }
    const flags = await db.featureFlag.findMany({ orderBy: { createdAt: "desc" } });
    return flags.map((f) => ({
      id: f.id, key: f.key, name: f.name, description: f.description,
      enabled: f.enabled, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
    }));
  },

  /** Delete a feature flag by key. */
  async deleteFeatureFlag(key: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({ sql: "DELETE FROM FeatureFlag WHERE key = ?", args: [key] });
      return;
    }
    await db.featureFlag.delete({ where: { key } });
  },

  /** Find recent audit logs (for admin audit page). */
  async findAuditLogs(opts: { limit?: number; adminId?: string } = {}): Promise<Array<{
    id: string; adminId: string; action: string; targetId: string | null;
    details: string | null; createdAt: string;
    admin?: { id: string; username: string; avatar: string };
  }>> {
    const limit = opts.limit ?? 50;
    if (isTurso()) {
      const result = opts.adminId
        ? await getTurso().execute({
            sql: "SELECT * FROM AuditLog WHERE adminId = ? ORDER BY createdAt DESC LIMIT ?",
            args: [opts.adminId, limit],
          })
        : await getTurso().execute({
            sql: "SELECT * FROM AuditLog ORDER BY createdAt DESC LIMIT ?",
            args: [limit],
          });
      const logs: Array<{
        id: string; adminId: string; action: string; targetId: string | null;
        details: string | null; createdAt: string;
        admin?: { id: string; username: string; avatar: string };
      }> = result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          adminId: String(row.adminId ?? ""),
          action: String(row.action ?? ""),
          targetId: row.targetId != null ? String(row.targetId) : null,
          details: row.details != null ? String(row.details) : null,
          createdAt: String(row.createdAt ?? ""),
          admin: undefined as { id: string; username: string; avatar: string } | undefined,
        };
      });
      // Hydrate admin usernames
      const adminIds = [...new Set(logs.map((l) => l.adminId))];
      if (adminIds.length > 0) {
        const placeholders = adminIds.map(() => "?").join(",");
        const adminResult = await getTurso().execute({
          sql: `SELECT id, username, avatar FROM User WHERE id IN (${placeholders})`,
          args: adminIds,
        });
        const adminMap = new Map<string, { id: string; username: string; avatar: string }>();
        for (const r of adminResult.rows) {
          const row = r as Record<string, unknown>;
          adminMap.set(String(row.id), {
            id: String(row.id ?? ""),
            username: String(row.username ?? ""),
            avatar: String(row.avatar ?? ""),
          });
        }
        for (const log of logs) {
          log.admin = adminMap.get(log.adminId);
        }
      }
      return logs;
    }
    const logs = await db.auditLog.findMany({
      where: opts.adminId ? { adminId: opts.adminId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { admin: { select: { id: true, username: true, avatar: true } } },
    });
    return logs.map((l) => ({
      id: l.id, adminId: l.adminId, action: l.action,
      targetId: l.targetId, details: l.details,
      createdAt: l.createdAt.toISOString(),
      admin: l.admin ? { id: l.admin.id, username: l.admin.username, avatar: l.admin.avatar } : undefined,
    }));
  },

  /** Count support messages by status. */
  async countSupportMessages(): Promise<{ total: number; new: number; read: number; replied: number; closed: number }> {
    if (isTurso()) {
      const result = await getTurso().execute(
        "SELECT status, COUNT(*) as count FROM SupportMessage GROUP BY status"
      );
      const out = { total: 0, new: 0, read: 0, replied: 0, closed: 0 };
      for (const r of result.rows) {
        const row = r as Record<string, unknown>;
        const status = String(row.status ?? "new") as keyof typeof out;
        const count = Number(row.count ?? 0);
        out[status] = count;
        out.total += count;
      }
      return out;
    }
    const [total, newCount, readCount, repliedCount, closedCount] = await Promise.all([
      db.supportMessage.count(),
      db.supportMessage.count({ where: { status: "new" } }),
      db.supportMessage.count({ where: { status: "read" } }),
      db.supportMessage.count({ where: { status: "replied" } }),
      db.supportMessage.count({ where: { status: "closed" } }),
    ]);
    return { total, new: newCount, read: readCount, replied: repliedCount, closed: closedCount };
  },

  /** Count all cron jobs. */
  async countCronJobs(): Promise<number> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT COUNT(*) as count FROM CronJob");
      return Number(result.rows[0]?.count ?? 0);
    }
    return db.cronJob.count();
  },

  /** Find all cron jobs. */
  async findAllCronJobs(): Promise<Array<{
    id: string; name: string; cronExpr: string | null; status: string;
    lastRun: string | null; nextRun: string | null; log: string | null;
    createdAt: string;
  }>> {
    if (isTurso()) {
      const result = await getTurso().execute("SELECT * FROM CronJob ORDER BY createdAt DESC");
      return result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          cronExpr: row.cronExpr != null ? String(row.cronExpr) : null,
          status: String(row.status ?? "idle"),
          lastRun: row.lastRun != null ? String(row.lastRun) : null,
          nextRun: row.nextRun != null ? String(row.nextRun) : null,
          log: row.log != null ? String(row.log) : null,
          createdAt: String(row.createdAt ?? ""),
        };
      });
    }
    const jobs = await db.cronJob.findMany({ orderBy: { createdAt: "desc" } });
    return jobs.map((j) => ({
      id: j.id, name: j.name, cronExpr: j.cronExpr, status: j.status,
      lastRun: j.lastRun?.toISOString() ?? null,
      nextRun: j.nextRun?.toISOString() ?? null,
      log: j.log,
      createdAt: j.createdAt.toISOString(),
    }));
  },

  // ─── FeatureFlag operations ───────────────────────────────────────────────

  async findFeatureFlagByKey(key: string): Promise<FeatureFlagRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM FeatureFlag WHERE key = ?",
        args: [key],
      });
      if (result.rows.length === 0) return null;
      return parseFeatureFlagRow(result.rows[0] as Record<string, unknown>);
    }
    const flag = await db.featureFlag.findUnique({ where: { key } });
    if (!flag) return null;
    return {
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description ?? null,
      enabled: flag.enabled,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  },

  // ─── VerificationCode operations ──────────────────────────────────────────

  async findVerificationCode(where: {
    email: string;
    code: string;
    used: boolean;
    expiresAfter: Date;
  }): Promise<VerificationCodeRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM VerificationCode WHERE email = ? AND code = ? AND used = ? AND expiresAt > ? LIMIT 1",
        args: [where.email, where.code, where.used ? 1 : 0, where.expiresAfter.toISOString()],
      });
      if (result.rows.length === 0) return null;
      return parseVerificationCodeRow(result.rows[0] as Record<string, unknown>);
    }
    const vc = await db.verificationCode.findFirst({
      where: {
        email: where.email,
        code: where.code,
        used: where.used,
        expiresAt: { gt: where.expiresAfter },
      },
    });
    if (!vc) return null;
    return {
      id: vc.id,
      email: vc.email,
      code: vc.code,
      userId: vc.userId,
      expiresAt: vc.expiresAt.toISOString(),
      used: vc.used,
      createdAt: vc.createdAt.toISOString(),
    };
  },

  async findRecentVerificationCode(email: string, since: Date): Promise<VerificationCodeRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM VerificationCode WHERE email = ? AND createdAt > ? LIMIT 1",
        args: [email, since.toISOString()],
      });
      if (result.rows.length === 0) return null;
      return parseVerificationCodeRow(result.rows[0] as Record<string, unknown>);
    }
    const vc = await db.verificationCode.findFirst({
      where: { email, createdAt: { gt: since } },
    });
    if (!vc) return null;
    return {
      id: vc.id,
      email: vc.email,
      code: vc.code,
      userId: vc.userId,
      expiresAt: vc.expiresAt.toISOString(),
      used: vc.used,
      createdAt: vc.createdAt.toISOString(),
    };
  },

  async createVerificationCode(data: {
    email: string;
    code: string;
    userId: string;
    expiresAt: Date;
  }): Promise<VerificationCodeRow> {
    const id = createId();
    if (isTurso()) {
      await getTurso().execute({
        sql: "INSERT INTO VerificationCode (id, email, code, userId, expiresAt, used) VALUES (?, ?, ?, ?, ?, 0)",
        args: [id, data.email, data.code, data.userId, data.expiresAt.toISOString()],
      });
      const vc = await this.findVerificationCode({
        email: data.email,
        code: data.code,
        used: false,
        expiresAfter: new Date(0),
      });
      return vc!;
    }
    const vc = await db.verificationCode.create({ data });
    return {
      id: vc.id,
      email: vc.email,
      code: vc.code,
      userId: vc.userId,
      expiresAt: vc.expiresAt.toISOString(),
      used: vc.used,
      createdAt: vc.createdAt.toISOString(),
    };
  },

  async deleteUnusedVerificationCodes(email: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "DELETE FROM VerificationCode WHERE email = ? AND used = 0",
        args: [email],
      });
      return;
    }
    await db.verificationCode.deleteMany({ where: { email, used: false } });
  },

  async markVerificationCodeUsed(id: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "UPDATE VerificationCode SET used = 1 WHERE id = ?",
        args: [id],
      });
      return;
    }
    await db.verificationCode.update({ where: { id }, data: { used: true } });
  },

  // ─── TelegramAuthCode operations ──────────────────────────────────────────

  async findTelegramAuthCode(where: {
    code: string;
    used: boolean;
    expiresAfter: Date;
  }): Promise<TelegramAuthCodeRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM TelegramAuthCode WHERE code = ? AND used = ? AND expiresAt > ? LIMIT 1",
        args: [where.code, where.used ? 1 : 0, where.expiresAfter.toISOString()],
      });
      if (result.rows.length === 0) return null;
      return parseTelegramAuthCodeRow(result.rows[0] as Record<string, unknown>);
    }
    const tac = await db.telegramAuthCode.findFirst({
      where: {
        code: where.code,
        used: where.used,
        expiresAt: { gt: where.expiresAfter },
      },
    });
    if (!tac) return null;
    return {
      id: tac.id,
      chatId: tac.chatId,
      telegramUserId: Number(tac.telegramUserId),
      telegramUsername: tac.telegramUsername ?? null,
      code: tac.code,
      expiresAt: tac.expiresAt.toISOString(),
      used: tac.used,
      createdAt: tac.createdAt.toISOString(),
    };
  },

  async markTelegramAuthCodeUsed(id: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "UPDATE TelegramAuthCode SET used = 1 WHERE id = ?",
        args: [id],
      });
      return;
    }
    await db.telegramAuthCode.update({ where: { id }, data: { used: true } });
  },

  // ─── Notification operations ──────────────────────────────────────────────

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data: string;
  }): Promise<NotificationRow> {
    const id = createId();
    if (isTurso()) {
      await getTurso().execute({
        sql: "INSERT INTO Notification (id, userId, type, title, body, data, read) VALUES (?, ?, ?, ?, ?, ?, 0)",
        args: [id, data.userId, data.type, data.title, data.body, data.data],
      });
      const result = await getTurso().execute({
        sql: "SELECT * FROM Notification WHERE id = ?",
        args: [id],
      });
      return parseNotificationRow(result.rows[0] as Record<string, unknown>);
    }
    const n = await db.notification.create({ data });
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    };
  },

  async createNotifications(data: Array<{
    userId: string;
    type: string;
    title: string;
    body: string;
    data: string;
  }>): Promise<void> {
    if (isTurso()) {
      // Turso doesn't support createMany, so insert one by one in a batch
      const stmts = data.map((d) => ({
        sql: "INSERT INTO Notification (id, userId, type, title, body, data, read) VALUES (?, ?, ?, ?, ?, ?, 0)",
        args: [createId(), d.userId, d.type, d.title, d.body, d.data],
      }));
      await getTurso().batch(stmts);
      return;
    }
    await db.notification.createMany({ data });
  },

  async findNotifications(userId: string, limit: number = 50): Promise<NotificationRow[]> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM Notification WHERE userId = ? ORDER BY createdAt DESC LIMIT ?",
        args: [userId, limit],
      });
      return result.rows.map((r) => parseNotificationRow(r as Record<string, unknown>));
    }
    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));
  },

  async countUnreadNotifications(userId: string): Promise<number> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT COUNT(*) as count FROM Notification WHERE userId = ? AND read = 0",
        args: [userId],
      });
      return Number(result.rows[0]?.count ?? 0);
    }
    return db.notification.count({ where: { userId, read: false } });
  },

  async markNotificationRead(id: string, userId: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "UPDATE Notification SET read = 1 WHERE id = ? AND userId = ?",
        args: [id, userId],
      });
      return;
    }
    await db.notification.update({ where: { id, userId }, data: { read: true } });
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "UPDATE Notification SET read = 1 WHERE userId = ? AND read = 0",
        args: [userId],
      });
      return;
    }
    await db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  },

  async deleteNotification(id: string, userId: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "DELETE FROM Notification WHERE id = ? AND userId = ?",
        args: [id, userId],
      });
      return;
    }
    await db.notification.delete({ where: { id, userId } });
  },

  // ─── Friend operations ────────────────────────────────────────────────────

  async findFriendship(userId1: string, userId2: string): Promise<FriendRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM Friend WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?) LIMIT 1",
        args: [userId1, userId2, userId2, userId1],
      });
      if (result.rows.length === 0) return null;
      return parseFriendRow(result.rows[0] as Record<string, unknown>);
    }
    const friend = await db.friend.findFirst({
      where: {
        OR: [
          { requesterId: userId1, addresseeId: userId2 },
          { requesterId: userId2, addresseeId: userId1 },
        ],
      },
    });
    if (!friend) return null;
    return {
      id: friend.id,
      requesterId: friend.requesterId,
      addresseeId: friend.addresseeId,
      status: friend.status,
      createdAt: friend.createdAt.toISOString(),
      updatedAt: friend.updatedAt.toISOString(),
    };
  },

  async createFriend(data: { requesterId: string; addresseeId: string; status: string }): Promise<FriendRow> {
    const id = createId();
    if (isTurso()) {
      const now = new Date().toISOString();
      await getTurso().execute({
        sql: "INSERT INTO Friend (id, requesterId, addresseeId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        args: [id, data.requesterId, data.addresseeId, data.status, now, now],
      });
      return {
        id,
        requesterId: data.requesterId,
        addresseeId: data.addresseeId,
        status: data.status,
        createdAt: now,
        updatedAt: now,
      };
    }
    const friend = await db.friend.create({ data });
    return {
      id: friend.id,
      requesterId: friend.requesterId,
      addresseeId: friend.addresseeId,
      status: friend.status,
      createdAt: friend.createdAt.toISOString(),
      updatedAt: friend.updatedAt.toISOString(),
    };
  },

  async updateFriendStatus(id: string, status: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "UPDATE Friend SET status = ?, updatedAt = ? WHERE id = ?",
        args: [status, new Date().toISOString(), id],
      });
      return;
    }
    await db.friend.update({ where: { id }, data: { status } });
  },

  async deleteFriend(id: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({ sql: "DELETE FROM Friend WHERE id = ?", args: [id] });
      return;
    }
    await db.friend.delete({ where: { id } });
  },

  async findFriends(userId: string): Promise<Array<FriendRow & { requester: UserRow; addressee: UserRow }>> {
    if (isTurso()) {
      return await tursoQuery(async () => {
        const result = await getTurso().execute({
          sql: `SELECT f.*,
                r.id as r_id, r.username as r_username, r.avatar as r_avatar, r.email as r_email, r.password as r_password, r.confirmed as r_confirmed, r.role as r_role, r.blocked as r_blocked, r.blockedAt as r_blockedAt, r.blockedReason as r_blockedReason, r.theme as r_theme, r.accent as r_accent, r.favoriteArtists as r_favoriteArtists, r.onboardingComplete as r_onboardingComplete, r.telegramChatId as r_telegramChatId, r.telegramUsername as r_telegramUsername, r.lastSeen as r_lastSeen, r.createdAt as r_createdAt,
                a.id as a_id, a.username as a_username, a.avatar as a_avatar, a.email as a_email, a.password as a_password, a.confirmed as a_confirmed, a.role as a_role, a.blocked as a_blocked, a.blockedAt as a_blockedAt, a.blockedReason as a_blockedReason, a.theme as a_theme, a.accent as a_accent, a.favoriteArtists as a_favoriteArtists, a.onboardingComplete as a_onboardingComplete, a.telegramChatId as a_telegramChatId, a.telegramUsername as a_telegramUsername, a.lastSeen as a_lastSeen, a.createdAt as a_createdAt
              FROM Friend f
              JOIN User r ON f.requesterId = r.id
              JOIN User a ON f.addresseeId = a.id
              WHERE f.requesterId = ? OR f.addresseeId = ?
              ORDER BY f.updatedAt DESC`,
          args: [userId, userId],
        });
        return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        const friend = parseFriendRow(r);
        const requester = parseUserRow({
          id: r.r_id, username: r.r_username, email: r.r_email, password: r.r_password,
          confirmed: r.r_confirmed, role: r.r_role, blocked: r.r_blocked,
          blockedAt: r.r_blockedAt, blockedReason: r.r_blockedReason, avatar: r.r_avatar,
          theme: r.r_theme, accent: r.r_accent, favoriteArtists: r.r_favoriteArtists,
          onboardingComplete: r.r_onboardingComplete, telegramChatId: r.r_telegramChatId,
          telegramUsername: r.r_telegramUsername, lastSeen: r.r_lastSeen, createdAt: r.r_createdAt,
        });
        const addressee = parseUserRow({
          id: r.a_id, username: r.a_username, email: r.a_email, password: r.a_password,
          confirmed: r.a_confirmed, role: r.a_role, blocked: r.a_blocked,
          blockedAt: r.a_blockedAt, blockedReason: r.a_blockedReason, avatar: r.a_avatar,
          theme: r.a_theme, accent: r.a_accent, favoriteArtists: r.a_favoriteArtists,
          onboardingComplete: r.a_onboardingComplete, telegramChatId: r.a_telegramChatId,
          telegramUsername: r.a_telegramUsername, lastSeen: r.a_lastSeen, createdAt: r.a_createdAt,
        });
        return { ...friend, requester, addressee };
        });
      });
    }
    const friendships = await db.friend.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: { id: true, username: true, avatar: true } },
        addressee: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return friendships.map((f) => ({
      id: f.id,
      requesterId: f.requesterId,
      addresseeId: f.addresseeId,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      requester: {
        id: f.requester.id, username: f.requester.username, email: "", password: "",
        confirmed: false, role: "user", blocked: false, blockedAt: null, blockedReason: null,
        avatar: f.requester.avatar, theme: "default", accent: "#e03131",
        favoriteArtists: "[]", onboardingComplete: false,
        telegramChatId: null, telegramUsername: null, lastSeen: null,
        createdAt: new Date().toISOString(),
      },
      addressee: {
        id: f.addressee.id, username: f.addressee.username, email: "", password: "",
        confirmed: false, role: "user", blocked: false, blockedAt: null, blockedReason: null,
        avatar: f.addressee.avatar, theme: "default", accent: "#e03131",
        favoriteArtists: "[]", onboardingComplete: false,
        telegramChatId: null, telegramUsername: null, lastSeen: null,
        createdAt: new Date().toISOString(),
      },
    }));
  },

  // ─── UserSync operations ──────────────────────────────────────────────────

  async findUserSyncData(userId: string): Promise<UserSyncRow[]> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM UserSync WHERE userId = ?",
        args: [userId],
      });
      return result.rows.map((r) => parseUserSyncRow(r as Record<string, unknown>));
    }
    const rows = await db.userSync.findMany({ where: { userId } });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      key: r.key,
      data: r.data,
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async upsertUserSync(userId: string, key: string, data: string): Promise<void> {
    if (isTurso()) {
      const now = new Date().toISOString();
      // Try update first, then insert
      const existing = await getTurso().execute({
        sql: "SELECT id FROM UserSync WHERE userId = ? AND key = ?",
        args: [userId, key],
      });
      if (existing.rows.length > 0) {
        await getTurso().execute({
          sql: "UPDATE UserSync SET data = ?, updatedAt = ? WHERE userId = ? AND key = ?",
          args: [data, now, userId, key],
        });
      } else {
        const id = createId();
        await getTurso().execute({
          sql: "INSERT INTO UserSync (id, userId, key, data, updatedAt) VALUES (?, ?, ?, ?, ?)",
          args: [id, userId, key, data, now],
        });
      }
      return;
    }
    await db.userSync.upsert({
      where: { userId_key: { userId, key } },
      update: { data },
      create: { userId, key, data },
    });
  },

  async findUserSyncDataByKeys(userId: string, keys: string[]): Promise<UserSyncRow[]> {
    if (keys.length === 0) return [];
    if (isTurso()) {
      const placeholders = keys.map(() => "?").join(",");
      const result = await getTurso().execute({
        sql: `SELECT * FROM UserSync WHERE userId = ? AND key IN (${placeholders})`,
        args: [userId, ...keys],
      });
      return result.rows.map((r) => parseUserSyncRow(r as Record<string, unknown>));
    }
    const rows = await db.userSync.findMany({
      where: { userId, key: { in: keys } },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      key: r.key,
      data: r.data,
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  // ─── Social: now-listening / live sessions (Phase 3 — unified with adapter) ──
  // Previously these lived only in Prisma-direct API routes, which silently
  // targeted PostgreSQL/Neon while production runs on Turso — a split-brain
  // database bug. The methods below keep the exact API behavior of the old
  // routes while working on both backends.

  /** Accepted friend ids in both directions (requester or addressee). */
  async findAcceptedFriendIds(userId: string): Promise<string[]> {
    if (isTurso()) {
      const result = await tursoQuery(() =>
        getTurso().execute({
          sql: "SELECT requesterId, addresseeId FROM Friend WHERE status = 'accepted' AND (requesterId = ? OR addresseeId = ?)",
          args: [userId, userId],
        })
      );
      return result.rows.map((r) => {
        const row = r as Record<string, unknown>;
        const requesterId = toString(row.requesterId);
        return requesterId === userId ? toString(row.addresseeId) : requesterId;
      });
    }
    const sent = await db.friend.findMany({
      where: { requesterId: userId, status: "accepted" },
      select: { addresseeId: true },
    });
    const received = await db.friend.findMany({
      where: { addresseeId: userId, status: "accepted" },
      select: { requesterId: true },
    });
    return [...sent.map((f) => f.addresseeId), ...received.map((f) => f.requesterId)];
  },

  /** Listening statuses of the given users, updated after `sinceMs`, newest first. */
  async findActiveListeningStatuses(
    userIds: string[],
    sinceMs: number
  ): Promise<Array<ListeningStatusRow & { user: { id: string; username: string; avatar: string } }>> {
    if (userIds.length === 0) return [];
    const since = new Date(sinceMs).toISOString();
    if (isTurso()) {
      return await tursoQuery(async () => {
        const placeholders = userIds.map(() => "?").join(",");
        const result = await getTurso().execute({
          sql: `SELECT ls.id, ls.userId, ls.trackId, ls.trackTitle, ls.trackArtist, ls.trackCover,
                    ls.scTrackId, ls.isPlaying, ls.progress, ls.duration, ls.source, ls.updatedAt,
                    u.id AS u_id, u.username AS u_username, u.avatar AS u_avatar
                FROM ListeningStatus ls
                JOIN User u ON ls.userId = u.id
                WHERE ls.userId IN (${placeholders}) AND ls.updatedAt >= ?
                ORDER BY ls.updatedAt DESC`,
          args: [...userIds, since],
        });
        return result.rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            ...parseListeningStatusRow(row),
            user: {
              id: toString(row.u_id),
              username: toString(row.u_username),
              avatar: toString(row.u_avatar),
            },
          };
        });
      });
    }
    const statuses = await db.listeningStatus.findMany({
      where: { userId: { in: userIds }, updatedAt: { gte: new Date(sinceMs) } },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return statuses.map((s) => ({
      id: s.id,
      userId: s.userId,
      trackId: s.trackId,
      trackTitle: s.trackTitle,
      trackArtist: s.trackArtist,
      trackCover: s.trackCover,
      scTrackId: s.scTrackId,
      isPlaying: s.isPlaying,
      progress: s.progress,
      duration: s.duration,
      source: s.source,
      updatedAt: s.updatedAt.toISOString(),
      user: s.user,
    }));
  },

  /** Upsert the user's listening status (one row per user). */
  async upsertListeningStatus(
    userId: string,
    data: {
      trackId: string;
      trackTitle: string;
      trackArtist: string;
      trackCover: string;
      scTrackId: number | null;
      isPlaying: boolean;
      progress: number;
      duration: number;
      source: string;
    }
  ): Promise<void> {
    if (isTurso()) {
      const now = new Date().toISOString();
      const existing = await getTurso().execute({
        sql: "SELECT id FROM ListeningStatus WHERE userId = ?",
        args: [userId],
      });
      if (existing.rows.length > 0) {
        await getTurso().execute({
          sql: `UPDATE ListeningStatus SET trackId = ?, trackTitle = ?, trackArtist = ?, trackCover = ?,
                  scTrackId = ?, isPlaying = ?, progress = ?, duration = ?, source = ?, updatedAt = ?
                WHERE userId = ?`,
          args: [
            data.trackId, data.trackTitle, data.trackArtist, data.trackCover,
            data.scTrackId, data.isPlaying ? 1 : 0, data.progress, data.duration,
            data.source, now, userId,
          ],
        });
      } else {
        const id = createId();
        await getTurso().execute({
          sql: `INSERT INTO ListeningStatus (id, userId, trackId, trackTitle, trackArtist, trackCover,
                  scTrackId, isPlaying, progress, duration, source, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id, userId, data.trackId, data.trackTitle, data.trackArtist, data.trackCover,
            data.scTrackId, data.isPlaying ? 1 : 0, data.progress, data.duration,
            data.source, now,
          ],
        });
      }
      return;
    }
    const payload = {
      trackId: data.trackId,
      trackTitle: data.trackTitle,
      trackArtist: data.trackArtist,
      trackCover: data.trackCover,
      scTrackId: data.scTrackId,
      isPlaying: data.isPlaying,
      progress: data.progress,
      duration: data.duration,
      source: data.source,
    };
    await db.listeningStatus.upsert({
      where: { userId },
      create: { userId, ...payload },
      update: payload,
    });
  },

  /** Active live sessions hosted by any of hostIds, updated after sinceMs, newest first. */
  async findActiveLiveSessions(
    hostIds: string[],
    sinceMs: number,
    limit = 20
  ): Promise<Array<LiveSessionRow & { host: { id: string; username: string; avatar: string } }>> {
    if (hostIds.length === 0) return [];
    const since = new Date(sinceMs).toISOString();
    if (isTurso()) {
      return await tursoQuery(async () => {
        const placeholders = hostIds.map(() => "?").join(",");
        const result = await getTurso().execute({
          sql: `SELECT s.id, s.hostId, s.code, s.trackId, s.trackTitle, s.trackArtist, s.trackCover,
                    s.scTrackId, s.audioUrl, s.source, s.progress, s.isPlaying, s.guestCount,
                    s.createdAt, s.updatedAt,
                    u.id AS u_id, u.username AS u_username, u.avatar AS u_avatar
                FROM LiveSession s
                JOIN User u ON s.hostId = u.id
                WHERE s.hostId IN (${placeholders}) AND s.updatedAt >= ?
                ORDER BY s.updatedAt DESC
                LIMIT ?`,
          args: [...hostIds, since, limit],
        });
        return result.rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            ...parseLiveSessionRow(row),
            host: {
              id: toString(row.u_id),
              username: toString(row.u_username),
              avatar: toString(row.u_avatar),
            },
          };
        });
      });
    }
    const sessions = await db.liveSession.findMany({
      where: { hostId: { in: hostIds }, updatedAt: { gte: new Date(sinceMs) } },
      include: { host: { select: { id: true, username: true, avatar: true } } },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return sessions.map((s) => ({
      id: s.id,
      hostId: s.hostId,
      code: s.code,
      trackId: s.trackId,
      trackTitle: s.trackTitle,
      trackArtist: s.trackArtist,
      trackCover: s.trackCover,
      scTrackId: s.scTrackId,
      audioUrl: s.audioUrl,
      source: s.source,
      progress: s.progress,
      isPlaying: s.isPlaying,
      guestCount: s.guestCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      host: s.host,
    }));
  },

  /** Single live session by id (no relations). */
  async findLiveSessionById(id: string): Promise<LiveSessionRow | null> {
    if (isTurso()) {
      const result = await tursoQuery(() =>
        getTurso().execute({ sql: "SELECT * FROM LiveSession WHERE id = ?", args: [id] })
      );
      if (result.rows.length === 0) return null;
      return parseLiveSessionRow(result.rows[0] as Record<string, unknown>);
    }
    const s = await db.liveSession.findUnique({ where: { id } });
    if (!s) return null;
    return {
      id: s.id,
      hostId: s.hostId,
      code: s.code,
      trackId: s.trackId,
      trackTitle: s.trackTitle,
      trackArtist: s.trackArtist,
      trackCover: s.trackCover,
      scTrackId: s.scTrackId,
      audioUrl: s.audioUrl,
      source: s.source,
      progress: s.progress,
      isPlaying: s.isPlaying,
      guestCount: s.guestCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  },

  /** Live session id by join code (collision check). */
  async findLiveSessionIdByCode(code: string): Promise<string | null> {
    if (isTurso()) {
      const result = await tursoQuery(() =>
        getTurso().execute({ sql: "SELECT id FROM LiveSession WHERE code = ?", args: [code] })
      );
      if (result.rows.length === 0) return null;
      return toString((result.rows[0] as Record<string, unknown>).id);
    }
    const s = await db.liveSession.findUnique({ where: { code }, select: { id: true } });
    return s?.id ?? null;
  },

  /** Members of a live session, in join order. */
  async findLiveSessionMembers(sessionId: string): Promise<LiveSessionMemberRow[]> {
    if (isTurso()) {
      const result = await tursoQuery(() =>
        getTurso().execute({
          sql: "SELECT * FROM LiveSessionMember WHERE sessionId = ? ORDER BY joinedAt ASC",
          args: [sessionId],
        })
      );
      return result.rows.map((r) => parseLiveSessionMemberRow(r as Record<string, unknown>));
    }
    const members = await db.liveSessionMember.findMany({
      where: { sessionId },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      userId: m.userId,
      username: m.username,
      avatar: m.avatar,
      joinedAt: m.joinedAt.toISOString(),
      lastSyncAt: m.lastSyncAt.toISOString(),
    }));
  },

  /**
   * Create a live session + its first member (the host) atomically.
   * guestCount starts at 1, matching the original route behavior.
   */
  async createLiveSession(
    data: {
      hostId: string;
      code: string;
      trackId: string;
      trackTitle: string;
      trackArtist: string;
      trackCover: string;
      scTrackId: number | null;
      audioUrl: string;
      source: string;
    },
    host: { username: string; avatar: string }
  ): Promise<LiveSessionRow> {
    const id = createId();
    if (isTurso()) {
      const now = new Date().toISOString();
      await tursoQuery(async () => {
        const memberId = createId();
        await getTurso().batch(
          [
            {
              sql: `INSERT INTO LiveSession (id, hostId, code, trackId, trackTitle, trackArtist, trackCover,
                      scTrackId, audioUrl, source, progress, isPlaying, guestCount, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)`,
              args: [
                id, data.hostId, data.code, data.trackId, data.trackTitle, data.trackArtist,
                data.trackCover, data.scTrackId, data.audioUrl, data.source, now, now,
              ],
            },
            {
              sql: `INSERT INTO LiveSessionMember (id, sessionId, userId, username, avatar, joinedAt, lastSyncAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [memberId, id, data.hostId, host.username, host.avatar, now, now],
            },
          ],
          "write"
        );
      });
      return {
        id,
        hostId: data.hostId,
        code: data.code,
        trackId: data.trackId,
        trackTitle: data.trackTitle,
        trackArtist: data.trackArtist,
        trackCover: data.trackCover,
        scTrackId: data.scTrackId,
        audioUrl: data.audioUrl,
        source: data.source,
        progress: 0,
        isPlaying: true,
        guestCount: 1,
        createdAt: now,
        updatedAt: now,
      };
    }
    const s = await db.liveSession.create({
      data: {
        hostId: data.hostId,
        code: data.code,
        trackId: data.trackId,
        trackTitle: data.trackTitle,
        trackArtist: data.trackArtist,
        trackCover: data.trackCover,
        scTrackId: data.scTrackId,
        audioUrl: data.audioUrl,
        source: data.source,
        isPlaying: true,
        progress: 0,
        guestCount: 1,
        members: {
          create: {
            userId: data.hostId,
            username: host.username,
            avatar: host.avatar,
          },
        },
      },
    });
    return {
      id: s.id,
      hostId: s.hostId,
      code: s.code,
      trackId: s.trackId,
      trackTitle: s.trackTitle,
      trackArtist: s.trackArtist,
      trackCover: s.trackCover,
      scTrackId: s.scTrackId,
      audioUrl: s.audioUrl,
      source: s.source,
      progress: s.progress,
      isPlaying: s.isPlaying,
      guestCount: s.guestCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  },

  /** Partial update of a live session (playback state / track change). */
  async updateLiveSession(
    id: string,
    data: Partial<{
      trackId: string;
      trackTitle: string;
      trackArtist: string;
      trackCover: string;
      scTrackId: number | null;
      audioUrl: string;
      source: string;
      isPlaying: boolean;
      progress: number;
    }>
  ): Promise<LiveSessionRow | null> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (isTurso()) {
      if (entries.length > 0) {
        const now = new Date().toISOString();
        const sets = entries.map(([k]) => `${k} = ?`).join(", ");
        const values = entries.map(([k, v]) =>
          k === "isPlaying" ? (v ? 1 : 0) : (v as string | number | null)
        );
        await tursoQuery(() =>
          getTurso().execute({
            sql: `UPDATE LiveSession SET ${sets}, updatedAt = ? WHERE id = ?`,
            args: [...values, now, id],
          })
        );
      }
      return await this.findLiveSessionById(id);
    }
    const update: Record<string, unknown> = {};
    for (const [k, v] of entries) update[k] = v;
    if (Object.keys(update).length === 0) {
      return await this.findLiveSessionById(id);
    }
    try {
      const s = await db.liveSession.update({ where: { id }, data: update });
      return {
        id: s.id,
        hostId: s.hostId,
        code: s.code,
        trackId: s.trackId,
        trackTitle: s.trackTitle,
        trackArtist: s.trackArtist,
        trackCover: s.trackCover,
        scTrackId: s.scTrackId,
        audioUrl: s.audioUrl,
        source: s.source,
        progress: s.progress,
        isPlaying: s.isPlaying,
        guestCount: s.guestCount,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    } catch {
      // Prisma update throws P2025 when the row vanished between read and write
      return null;
    }
  },

  /** Delete a live session (host leaving). Members cascade. */
  async deleteLiveSession(id: string): Promise<void> {
    if (isTurso()) {
      await tursoQuery(async () => {
        // libSQL has no FK cascade for this table pair on older instances —
        // delete members explicitly in the same write batch.
        await getTurso().batch(
          [
            { sql: "DELETE FROM LiveSessionMember WHERE sessionId = ?", args: [id] },
            { sql: "DELETE FROM LiveSession WHERE id = ?", args: [id] },
          ],
          "write"
        );
      });
      return;
    }
    await db.liveSession.delete({ where: { id } });
  },

  /**
   * Add a member to a live session and bump guestCount (atomic).
   * No-op if the user is already a member.
   */
  async addLiveSessionMember(
    sessionId: string,
    userId: string,
    username: string,
    avatar: string
  ): Promise<void> {
    if (isTurso()) {
      await tursoQuery(async () => {
        const now = new Date().toISOString();
        await getTurso().batch(
          [
            {
              sql: `INSERT INTO LiveSessionMember (id, sessionId, userId, username, avatar, joinedAt, lastSyncAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [createId(), sessionId, userId, username, avatar, now, now],
            },
            {
              sql: "UPDATE LiveSession SET guestCount = guestCount + 1, updatedAt = ? WHERE id = ?",
              args: [now, sessionId],
            },
          ],
          "write"
        );
      });
      return;
    }
    await db.$transaction([
      db.liveSessionMember.create({
        data: { sessionId, userId, username, avatar },
      }),
      db.liveSession.update({
        where: { id: sessionId },
        data: { guestCount: { increment: 1 } },
      }),
    ]);
  },

  /**
   * Remove a member from a live session and decrement guestCount.
   * Returns true when a member row was actually removed; false when the user
   * was not a member (in which case guestCount is untouched — the old route
   * decremented unconditionally and could drive the count negative).
   */
  async removeLiveSessionMember(sessionId: string, userId: string): Promise<boolean> {
    if (isTurso()) {
      return await tursoQuery(async () => {
        const now = new Date().toISOString();
        const deleted = await getTurso().execute({
          sql: "DELETE FROM LiveSessionMember WHERE sessionId = ? AND userId = ?",
          args: [sessionId, userId],
        });
        const removed = (deleted.rowsAffected ?? 0) > 0;
        if (removed) {
          await getTurso().execute({
            sql: "UPDATE LiveSession SET guestCount = MAX(guestCount - 1, 0), updatedAt = ? WHERE id = ?",
            args: [now, sessionId],
          });
        }
        return removed;
      });
    }
    const result = await db.liveSessionMember.deleteMany({
      where: { sessionId, userId },
    });
    if (result.count > 0) {
      await db.liveSession.update({
        where: { id: sessionId },
        data: { guestCount: { decrement: 1 } },
      });
    }
    return result.count > 0;
  },

  // ─── Message operations ───────────────────────────────────────────────────

  async findMessageById(id: string): Promise<MessageRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({ sql: "SELECT * FROM Message WHERE id = ?", args: [id] });
      if (result.rows.length === 0) return null;
      return parseMessageRow(result.rows[0] as Record<string, unknown>);
    }
    const m = await db.message.findUnique({ where: { id } });
    if (!m) return null;
    return {
      id: m.id, content: m.content, senderId: m.senderId, receiverId: m.receiverId,
      encrypted: m.encrypted, messageType: m.messageType, replyToId: m.replyToId,
      edited: m.edited, editedAt: m.editedAt?.toISOString() ?? null,
      deleted: m.deleted, voiceUrl: m.voiceUrl, voiceDuration: m.voiceDuration,
      createdAt: m.createdAt.toISOString(),
    };
  },

  async updateMessage(id: string, data: {
    content?: string;
    edited?: boolean;
    editedAt?: string;
    deleted?: boolean;
    encrypted?: boolean;
    messageType?: string;
  }): Promise<void> {
    if (isTurso()) {
      const sets: string[] = [];
      const args: InValue[] = [];
      if (data.content !== undefined) { sets.push("content = ?"); args.push(data.content); }
      if (data.edited !== undefined) { sets.push("edited = ?"); args.push(data.edited ? 1 : 0); }
      if (data.editedAt !== undefined) { sets.push("editedAt = ?"); args.push(data.editedAt); }
      if (data.deleted !== undefined) { sets.push("deleted = ?"); args.push(data.deleted ? 1 : 0); }
      if (data.encrypted !== undefined) { sets.push("encrypted = ?"); args.push(data.encrypted ? 1 : 0); }
      if (data.messageType !== undefined) { sets.push("messageType = ?"); args.push(data.messageType); }
      if (sets.length === 0) return;
      args.push(id);
      await getTurso().execute({ sql: `UPDATE Message SET ${sets.join(", ")} WHERE id = ?`, args });
      return;
    }
    const update: Record<string, unknown> = {};
    if (data.content !== undefined) update.content = data.content;
    if (data.edited !== undefined) update.edited = data.edited;
    if (data.editedAt !== undefined) update.editedAt = new Date(data.editedAt);
    if (data.deleted !== undefined) update.deleted = data.deleted;
    if (data.encrypted !== undefined) update.encrypted = data.encrypted;
    if (data.messageType !== undefined) update.messageType = data.messageType;
    if (Object.keys(update).length === 0) return;
    await db.message.update({ where: { id }, data: update });
  },

  async createMessage(data: {
    content: string;
    senderId: string;
    receiverId: string;
    encrypted?: boolean;
    messageType?: string;
    replyToId?: string | null;
    voiceUrl?: string | null;
    voiceDuration?: number | null;
  }): Promise<MessageRow> {
    const id = createId();
    if (isTurso()) {
      await getTurso().execute({
        sql: `INSERT INTO Message (id, content, senderId, receiverId, encrypted, messageType, replyToId, edited, deleted, voiceUrl, voiceDuration)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        args: [
          id,
          data.content,
          data.senderId,
          data.receiverId,
          (data.encrypted !== false) ? 1 : 0,
          data.messageType || "text",
          data.replyToId ?? null,
          data.voiceUrl ?? null,
          data.voiceDuration ?? null,
        ],
      });
      const result = await getTurso().execute({
        sql: "SELECT * FROM Message WHERE id = ?",
        args: [id],
      });
      return parseMessageRow(result.rows[0] as Record<string, unknown>);
    }
    const msg = await db.message.create({
      data: {
        content: data.content,
        senderId: data.senderId,
        receiverId: data.receiverId,
        encrypted: data.encrypted !== false,
        messageType: data.messageType || "text",
        replyToId: data.replyToId ?? null,
        voiceUrl: data.voiceUrl ?? null,
        voiceDuration: data.voiceDuration ?? null,
      },
    });
    return {
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      encrypted: msg.encrypted,
      messageType: msg.messageType,
      replyToId: msg.replyToId ?? null,
      edited: msg.edited,
      editedAt: msg.editedAt?.toISOString() ?? null,
      deleted: msg.deleted,
      voiceUrl: msg.voiceUrl ?? null,
      voiceDuration: msg.voiceDuration ?? null,
      createdAt: msg.createdAt.toISOString(),
    };
  },

  async findMessages(where: {
    userId: string;
    receiverId: string;
    since?: string;
    deleted?: boolean;
    limit?: number;
  }): Promise<Array<MessageRow & { sender?: { id: string; username: string; avatar: string }; receiver?: { id: string; username: string; avatar: string } }>> {
    const limit = where.limit || 200;
    if (isTurso()) {
      let sql = `SELECT m.*,
                  s.id as s_id, s.username as s_username, s.avatar as s_avatar,
                  r.id as r_id, r.username as r_username, r.avatar as r_avatar
                FROM Message m
                JOIN User s ON m.senderId = s.id
                JOIN User r ON m.receiverId = r.id
                WHERE ((m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?))
                  AND m.deleted = ?`;
      const args: InValue[] = [where.userId, where.receiverId, where.receiverId, where.userId, where.deleted ? 1 : 0];

      if (where.since) {
        sql += " AND m.createdAt > ?";
        args.push(where.since);
      }

      sql += " ORDER BY m.createdAt ASC LIMIT ?";
      args.push(limit);

      const result = await getTurso().execute({ sql, args });
      return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        const msg = parseMessageRow(r);
        return {
          ...msg,
          sender: { id: toString(r.s_id), username: toString(r.s_username), avatar: toString(r.s_avatar) },
          receiver: { id: toString(r.r_id), username: toString(r.r_username), avatar: toString(r.r_avatar) },
        };
      });
    }
    const prismaWhere: Record<string, unknown> = {
      OR: [
        { senderId: where.userId, receiverId: where.receiverId },
        { senderId: where.receiverId, receiverId: where.userId },
      ],
      deleted: where.deleted ?? false,
    };
    if (where.since) {
      prismaWhere.createdAt = { gt: new Date(where.since) };
    }
    const messages = await db.message.findMany({
      where: prismaWhere,
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        receiver: { select: { id: true, username: true, avatar: true } },
      },
    });
    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      receiverId: m.receiverId,
      encrypted: m.encrypted,
      messageType: m.messageType,
      replyToId: m.replyToId ?? null,
      edited: m.edited,
      editedAt: m.editedAt?.toISOString() ?? null,
      deleted: m.deleted,
      voiceUrl: m.voiceUrl ?? null,
      voiceDuration: m.voiceDuration ?? null,
      createdAt: m.createdAt.toISOString(),
      sender: m.sender ? { id: m.sender.id, username: m.sender.username, avatar: m.sender.avatar } : undefined,
      receiver: m.receiver ? { id: m.receiver.id, username: m.receiver.username, avatar: m.receiver.avatar } : undefined,
    }));
  },

  // ─── Playlist operations ──────────────────────────────────────────────────

  async findPlaylists(userId: string): Promise<PlaylistRow[]> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM Playlist WHERE userId = ? ORDER BY updatedAt DESC",
        args: [userId],
      });
      return result.rows.map((r) => parsePlaylistRow(r as Record<string, unknown>));
    }
    const playlists = await db.playlist.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return playlists.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description,
      cover: p.cover,
      isPublic: p.isPublic,
      tags: p.tags,
      tracksJson: p.tracksJson,
      playCount: p.playCount,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  },

  async findPublicPlaylists(limit: number = 50): Promise<Array<PlaylistRow & { user: { id: string; username: string; avatar: string } }>> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: `SELECT p.*, u.id as u_id, u.username as u_username, u.avatar as u_avatar
              FROM Playlist p
              JOIN User u ON p.userId = u.id
              WHERE p.isPublic = 1
              ORDER BY p.playCount DESC, p.updatedAt DESC
              LIMIT ?`,
        args: [limit],
      });
      return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        const playlist = parsePlaylistRow(r);
        return {
          ...playlist,
          user: { id: toString(r.u_id), username: toString(r.u_username), avatar: toString(r.u_avatar) },
        };
      });
    }
    const playlists = await db.playlist.findMany({
      where: { isPublic: true },
      orderBy: [{ playCount: "desc" }, { updatedAt: "desc" }],
      take: limit,
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    return playlists.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description,
      cover: p.cover,
      isPublic: p.isPublic,
      tags: p.tags,
      tracksJson: p.tracksJson,
      playCount: p.playCount,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      user: { id: p.user.id, username: p.user.username, avatar: p.user.avatar },
    }));
  },

  async createPlaylist(data: {
    userId: string;
    name: string;
    description?: string;
    cover?: string;
    isPublic?: boolean;
    tags?: string;
    tracksJson?: string;
  }): Promise<PlaylistRow> {
    const id = createId();
    if (isTurso()) {
      const now = new Date().toISOString();
      await getTurso().execute({
        sql: `INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          id, data.userId, data.name, data.description || "", data.cover || "",
          data.isPublic !== false ? 1 : 0, data.tags || "", data.tracksJson || "[]",
          now, now,
        ],
      });
      const result = await getTurso().execute({ sql: "SELECT * FROM Playlist WHERE id = ?", args: [id] });
      return parsePlaylistRow(result.rows[0] as Record<string, unknown>);
    }
    const playlist = await db.playlist.create({ data: { ...data } });
    return {
      id: playlist.id,
      userId: playlist.userId,
      name: playlist.name,
      description: playlist.description,
      cover: playlist.cover,
      isPublic: playlist.isPublic,
      tags: playlist.tags,
      tracksJson: playlist.tracksJson,
      playCount: playlist.playCount,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    };
  },

  // ─── FeatureFlag extended operations ──────────────────────────────────────

  async createFeatureFlag(data: {
    key: string;
    name: string;
    description?: string;
    enabled?: boolean;
  }): Promise<FeatureFlagRow> {
    const id = createId();
    const now = new Date().toISOString();
    if (isTurso()) {
      await getTurso().execute({
        sql: "INSERT INTO FeatureFlag (id, key, name, description, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [id, data.key, data.name, data.description ?? null, data.enabled ? 1 : 0, now, now],
      });
      const result = await getTurso().execute({
        sql: "SELECT * FROM FeatureFlag WHERE id = ?",
        args: [id],
      });
      return parseFeatureFlagRow(result.rows[0] as Record<string, unknown>);
    }
    const flag = await db.featureFlag.create({
      data: {
        key: data.key,
        name: data.name,
        description: data.description,
        enabled: data.enabled ?? false,
      },
    });
    return {
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description ?? null,
      enabled: flag.enabled,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  },

  async updateFeatureFlag(key: string, data: { enabled?: boolean; name?: string; description?: string }): Promise<FeatureFlagRow | null> {
    const now = new Date().toISOString();
    if (isTurso()) {
      const setClauses: string[] = [];
      const args: InValue[] = [];
      if (data.enabled !== undefined) {
        setClauses.push("enabled = ?");
        args.push(data.enabled ? 1 : 0);
      }
      if (data.name !== undefined) {
        setClauses.push("name = ?");
        args.push(data.name);
      }
      if (data.description !== undefined) {
        setClauses.push("description = ?");
        args.push(data.description);
      }
      setClauses.push("updatedAt = ?");
      args.push(now);

      if (setClauses.length === 0) return this.findFeatureFlagByKey(key);

      args.push(key);
      await getTurso().execute({
        sql: `UPDATE FeatureFlag SET ${setClauses.join(", ")} WHERE key = ?`,
        args,
      });
      return this.findFeatureFlagByKey(key);
    }
    await db.featureFlag.update({
      where: { key },
      data: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
    return this.findFeatureFlagByKey(key);
  },

  // ─── AuditLog operations ──────────────────────────────────────────────────

  async createAuditLog(data: {
    adminId: string;
    action: string;
    targetId?: string;
    details?: string;
  }): Promise<AuditLogRow> {
    const id = createId();
    if (isTurso()) {
      await getTurso().execute({
        sql: "INSERT INTO AuditLog (id, adminId, action, targetId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        args: [id, data.adminId, data.action, data.targetId ?? null, data.details ?? null, new Date().toISOString()],
      });
      return {
        id,
        adminId: data.adminId,
        action: data.action,
        targetId: data.targetId ?? null,
        details: data.details ?? null,
        createdAt: new Date().toISOString(),
      };
    }
    const log = await db.auditLog.create({ data });
    return {
      id: log.id,
      adminId: log.adminId,
      action: log.action,
      targetId: log.targetId ?? null,
      details: log.details ?? null,
      createdAt: log.createdAt.toISOString(),
    };
  },

  // ─── UserSync extended operations ─────────────────────────────────────────

  async findUserSyncByUserIdAndKey(userId: string, key: string): Promise<UserSyncRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM UserSync WHERE userId = ? AND key = ?",
        args: [userId, key],
      });
      if (result.rows.length === 0) return null;
      return parseUserSyncRow(result.rows[0] as Record<string, unknown>);
    }
    const sync = await db.userSync.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!sync) return null;
    return {
      id: sync.id,
      userId: sync.userId,
      key: sync.key,
      data: sync.data,
      updatedAt: sync.updatedAt.toISOString(),
    };
  },

  async deleteUserSync(userId: string, key: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({
        sql: "DELETE FROM UserSync WHERE userId = ? AND key = ?",
        args: [userId, key],
      });
      return;
    }
    await db.userSync.deleteMany({ where: { userId, key } });
  },

  // ─── TelegramBotState operations ──────────────────────────────────────────

  async findTelegramBotState(chatId: string): Promise<TelegramBotStateRow | null> {
    if (isTurso()) {
      const result = await getTurso().execute({
        sql: "SELECT * FROM TelegramBotState WHERE chatId = ?",
        args: [chatId],
      });
      if (result.rows.length === 0) return null;
      return parseTelegramBotStateRow(result.rows[0] as Record<string, unknown>);
    }
    const row = await db.telegramBotState.findUnique({ where: { chatId } });
    if (!row) return null;
    return {
      id: row.id, chatId: row.chatId, state: row.state,
      data: row.data, results: row.results, audioBatch: row.audioBatch,
      collectingMessageId: row.collectingMessageId ?? null,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  },

  async upsertTelegramBotState(data: {
    chatId: string;
    state: string;
    data: string;
    results: string;
    audioBatch: string;
    collectingMessageId?: number | null;
  }): Promise<void> {
    if (isTurso()) {
      const now = new Date().toISOString();
      // Try update first, then insert
      const existing = await getTurso().execute({
        sql: "SELECT id FROM TelegramBotState WHERE chatId = ?",
        args: [data.chatId],
      });
      if (existing.rows.length > 0) {
        await getTurso().execute({
          sql: "UPDATE TelegramBotState SET state = ?, data = ?, results = ?, audioBatch = ?, collectingMessageId = ?, updatedAt = ? WHERE chatId = ?",
          args: [data.state, data.data, data.results, data.audioBatch, data.collectingMessageId ?? null, now, data.chatId],
        });
        return;
      }
      const id = createId();
      await getTurso().execute({
        sql: "INSERT INTO TelegramBotState (id, chatId, state, data, results, audioBatch, collectingMessageId, updatedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [id, data.chatId, data.state, data.data, data.results, data.audioBatch, data.collectingMessageId ?? null, now, now],
      });
      return;
    }
    await db.telegramBotState.upsert({
      where: { chatId: data.chatId },
      create: {
        chatId: data.chatId, state: data.state,
        data: data.data, results: data.results, audioBatch: data.audioBatch,
        collectingMessageId: data.collectingMessageId ?? null,
      },
      update: {
        state: data.state, data: data.data, results: data.results,
        audioBatch: data.audioBatch, collectingMessageId: data.collectingMessageId ?? null,
      },
    });
  },

  async deleteTelegramBotState(chatId: string): Promise<void> {
    if (isTurso()) {
      await getTurso().execute({ sql: "DELETE FROM TelegramBotState WHERE chatId = ?", args: [chatId] });
      return;
    }
    await db.telegramBotState.delete({ where: { chatId } }).catch(() => {});
  },

  // ─── Transaction support ──────────────────────────────────────────────────

  /**
   * Execute multiple operations in a transaction.
   * For Prisma: uses $transaction
   * For Turso: uses batch (which is transactional by default)
   */
  async transaction<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    if (isTurso()) {
      // Turso batch is transactional — but our operations use turso.execute directly
      // So we just execute them sequentially (Turso batch doesn't support callbacks)
      const results: T[] = [];
      for (const op of operations) {
        results.push(await op());
      }
      return results;
    }
    return db.$transaction(operations.map((op) => op()) as any) as Promise<T[]>;
  },

  // ─── Schema initialization ────────────────────────────────────────────────

  async ensureSchema(): Promise<void> {
    if (isTurso()) {
      await initTursoSchema();
    }
    // Prisma schema is managed by migrations, no need to init
  },
};
