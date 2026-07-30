/**
 * Telegram Bot command handler & state machine (serverless-safe).
 *
 * All conversation state is persisted via the unified database adapter
 * (Turso on Vercel / Prisma+PostgreSQL in dev), making it reliable
 * across serverless function invocations.
 *
 * Features:
 *   - Auth: /start, /code
 *   - Import: Send audio to bot → choose playlist → track added
 *   - Search: /search <query> → find on SoundCloud → preview → add to playlist
 *   - Playlists: /playlists — list, /newplaylist <name>
 *   - Help: /help, /menu
 *
 * Uses callback_query for inline keyboard interactions.
 */

import { database, isTurso, getTursoClient, tursoQuery, ensureTursoSchema } from "@/lib/database";
import { prismaRetry } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import {
  sendTelegramMessage,
  sendTelegramAudio,
  answerCallbackQuery,
  editMessageText,
  setMyCommands,
  setChatMenuButton,
  sendChatAction,
} from "@/lib/telegram";
import { searchSCTracks, resolveSCStreamUrl } from "@/lib/soundcloud";

/* ------------------------------------------------------------------ */
/*  Schema init — run ONCE per cold start, not per request             */
/* ------------------------------------------------------------------ */

// Module-scoped promise: the first call triggers ensureTursoSchema(), all
// subsequent calls await the same promise. This prevents every webhook
// invocation from firing a redundant schema check.
let _schemaInitPromise: Promise<void> | null = null;

function ensureSchemaOnce(): Promise<void> {
  if (!isTurso()) return Promise.resolve();
  if (!_schemaInitPromise) {
    _schemaInitPromise = ensureTursoSchema().catch((err) => {
      console.error("[telegram-bot] ensureTursoSchema failed:", err);
      // Reset so the next request can retry
      _schemaInitPromise = null;
    });
  }
  return _schemaInitPromise;
}

// Module-scoped bot setup flag — setMyCommands and setChatMenuButton are
// GLOBAL bot settings (per-bot, not per-chat). Calling them on every /start
// wastes 1-2s per request and hits Telegram rate limits. Run once per cold
// start, then skip.
let _botSetupDone = false;
async function setupBotOnce(): Promise<void> {
  if (_botSetupDone) return;
  await Promise.all([
    setMyCommands().catch(() => {}),
    setChatMenuButton().catch(() => {}),
  ]);
  _botSetupDone = true;
}

/* ------------------------------------------------------------------ */
/*  Site origin (set from webhook request)                             */
/* ------------------------------------------------------------------ */

let _siteOrigin = "";

/**
 * Strict origin allowlist for the Telegram bot. Previously this accepted
 * ANY URL containing "vercel.app" | "localhost" | "mq-player" — which
 * let an attacker redirect bot audio messages to an arbitrary server
 * (e.g. `https://evil-vercel-app.vercel.app`).
 *
 * Now we require an EXACT match against an allowlist. The allowlist is
 * populated from env (`ALLOWED_ORIGINS`, comma-separated) if set,
 * otherwise falls back to a small built-in list.
 *
 * To add a new deployment origin: set ALLOWED_ORIGINS in env.
 */
function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  // Built-in fallback — keep this list tight.
  return [
    APP_URL,
    "https://mq-player.vercel.app",
    "http://localhost:3000",
  ];
}

export function setSiteOrigin(origin: string): void {
  const cleaned = origin.replace(/\/$/, "").trim();
  const allowed = getAllowedOrigins();
  if (allowed.includes(cleaned)) {
    _siteOrigin = cleaned;
    return;
  }
  // Reject — log for audit but do NOT set _siteOrigin so the bot keeps
  // using the default origin (which is in the allowlist).
  console.warn(`[telegram-bot] Rejected disallowed origin: ${cleaned}. Allowed: ${allowed.join(", ")}`);
}

function getSiteOrigin(): string {
  return _siteOrigin || getAllowedOrigins()[0] || APP_URL;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BotState =
  | "idle"
  | "awaiting_import_playlist"
  | "awaiting_import_title"
  | "awaiting_search_query"
  | "awaiting_new_playlist"
  | "awaiting_add_to_playlist"
  | "awaiting_preview_choice"
  | "collecting_audios"
  | "awaiting_rename_playlist";

interface PendingImport {
  fileId?: string;
  fileUrl: string | null;
  fileDuration: number;
  originalFilename: string;
  scTrackId?: number;
  scData?: Record<string, unknown>;
}

interface AudioBatchItem {
  fileId?: string;
  fileUrl: string | null;
  fileDuration: number;
  originalFilename: string;
}

interface ChatState {
  state: BotState;
  data: PendingImport;
  searchResults?: any[];
  audioBatch?: AudioBatchItem[];
  collectingMessageId?: number;
  /** ID of the playlist currently being viewed/edited (for rename, view tracks, etc.) */
  activePlaylistId?: string;
  /** Pagination cursor for likes/playlist-tracks views */
  viewPage?: number;
}

/* ------------------------------------------------------------------ */
/*  DB-backed state (serverless-safe)                                  */
/* ------------------------------------------------------------------ */

async function getChatState(chatId: string): Promise<ChatState | null> {
  try {
    const row = await database.findTelegramBotState(chatId);
    if (!row) return null;
    // Expire states older than 15 minutes
    const ago = Date.now() - new Date(row.updatedAt).getTime();
    if (ago > 15 * 60 * 1000) {
      await database.deleteTelegramBotState(chatId);
      return null;
    }
    const parsed = JSON.parse(row.data || "{}");
    return {
      state: (row.state as BotState) || "idle",
      data: {
        fileUrl: null,
        fileDuration: 0,
        originalFilename: "",
        ...parsed,
      },
      searchResults: JSON.parse(row.results || "[]"),
      audioBatch: JSON.parse(row.audioBatch || "[]"),
      collectingMessageId: row.collectingMessageId || undefined,
      activePlaylistId: parsed?.activePlaylistId || undefined,
      viewPage: parsed?.viewPage || 0,
    };
  } catch {
    return null;
  }
}

async function setChatState(
  chatId: string,
  state: BotState,
  data: PendingImport = { fileUrl: null, fileDuration: 0, originalFilename: "" },
  searchResults?: any[],
  audioBatch?: AudioBatchItem[],
  collectingMessageId?: number,
  extra?: { activePlaylistId?: string; viewPage?: number },
): Promise<void> {
  const payload = { ...data, ...(extra || {}) };
  await database.upsertTelegramBotState({
    chatId,
    state,
    data: JSON.stringify(payload),
    results: JSON.stringify(searchResults || []),
    audioBatch: JSON.stringify(audioBatch || []),
    collectingMessageId: collectingMessageId || null,
  });
}

async function clearChatState(chatId: string): Promise<void> {
  await database.deleteTelegramBotState(chatId);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function findUserByChatId(chatId: string) {
  const user = await database.findUserByTelegramChatId(chatId);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    telegramChatId: user.telegramChatId,
  };
}

interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
}

async function getUserPlaylists(userId: string): Promise<PlaylistSummary[]> {
  if (isTurso()) {
    const t = getTursoClient();
    const result = await t.execute({
      sql: "SELECT id, name, tracksJson FROM Playlist WHERE userId = ? ORDER BY updatedAt DESC",
      args: [userId],
    });
    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        trackCount: trackCountFromJson(String(row.tracksJson ?? "[]")),
      };
    });
  }
  const { db } = await import("@/lib/db");
  const playlists = await db.playlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, tracksJson: true },
  });
  return playlists.map((pl) => ({
    id: pl.id,
    name: pl.name,
    trackCount: trackCountFromJson(pl.tracksJson),
  }));
}

function trackCountFromJson(tracksJson: string): number {
  try { return JSON.parse(tracksJson || "[]").length; } catch { return 0; }
}

/* ------------------------------------------------------------------ */
/*  Playlist helpers (Turso/Prisma dual path)                          */
/* ------------------------------------------------------------------ */

interface PlaylistRow {
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

async function findPlaylistById(playlistId: string): Promise<PlaylistRow | null> {
  if (isTurso()) {
    const t = getTursoClient();
    const result = await t.execute({
      sql: "SELECT * FROM Playlist WHERE id = ?",
      args: [playlistId],
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      userId: String(row.userId ?? ""),
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      cover: String(row.cover ?? ""),
      isPublic: row.isPublic === 1 || row.isPublic === true,
      tags: String(row.tags ?? ""),
      tracksJson: String(row.tracksJson ?? "[]"),
      playCount: Number(row.playCount ?? 0),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
    };
  }
  const { db } = await import("@/lib/db");
  const p = await db.playlist.findUnique({ where: { id: playlistId } });
  if (!p) return null;
  return {
    id: p.id, userId: p.userId, name: p.name, description: p.description,
    cover: p.cover, isPublic: p.isPublic, tags: p.tags, tracksJson: p.tracksJson,
    playCount: p.playCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function findPlaylistByUserAndName(userId: string, name: string): Promise<PlaylistRow | null> {
  if (isTurso()) {
    const t = getTursoClient();
    const result = await t.execute({
      sql: "SELECT * FROM Playlist WHERE userId = ? AND name = ? LIMIT 1",
      args: [userId, name.trim()],
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      userId: String(row.userId ?? ""),
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      cover: String(row.cover ?? ""),
      isPublic: row.isPublic === 1 || row.isPublic === true,
      tags: String(row.tags ?? ""),
      tracksJson: String(row.tracksJson ?? "[]"),
      playCount: Number(row.playCount ?? 0),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
    };
  }
  const { db } = await import("@/lib/db");
  const p = await db.playlist.findFirst({ where: { userId, name: name.trim() } });
  if (!p) return null;
  return {
    id: p.id, userId: p.userId, name: p.name, description: p.description,
    cover: p.cover, isPublic: p.isPublic, tags: p.tags, tracksJson: p.tracksJson,
    playCount: p.playCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function createPlaylist(userId: string, name: string, tracksJson: string = "[]"): Promise<PlaylistRow> {
  if (isTurso()) {
    const t = getTursoClient();
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    const now = new Date().toISOString();
    await t.execute({
      sql: "INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt) VALUES (?, ?, ?, '', '', 0, '', ?, 0, ?, ?)",
      args: [id, userId, name, tracksJson, now, now],
    });
    const p = await findPlaylistById(id);
    return p!;
  }
  const { db } = await import("@/lib/db");
  const p = await db.playlist.create({
    data: { userId, name, tracksJson },
  });
  return {
    id: p.id, userId: p.userId, name: p.name, description: p.description,
    cover: p.cover, isPublic: p.isPublic, tags: p.tags, tracksJson: p.tracksJson,
    playCount: p.playCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function updatePlaylistTracks(playlistId: string, tracksJson: string): Promise<void> {
  if (isTurso()) {
    const t = getTursoClient();
    await t.execute({
      sql: "UPDATE Playlist SET tracksJson = ?, updatedAt = ? WHERE id = ?",
      args: [tracksJson, new Date().toISOString(), playlistId],
    });
    return;
  }
  const { db } = await import("@/lib/db");
  await db.playlist.update({ where: { id: playlistId }, data: { tracksJson } });
}

async function deletePlaylist(playlistId: string): Promise<void> {
  if (isTurso()) {
    const t = getTursoClient();
    await t.batch([
      { sql: "DELETE FROM PlaylistLike WHERE playlistId = ?", args: [playlistId] },
      { sql: "DELETE FROM Playlist WHERE id = ?", args: [playlistId] },
    ]);
    return;
  }
  const { db } = await import("@/lib/db");
  await db.playlist.delete({ where: { id: playlistId } });
}

async function createTelegramAuthCode(data: {
  chatId: string;
  telegramUserId: number;
  telegramUsername?: string | null;
  code: string;
  expiresAt: string;
}): Promise<void> {
  if (isTurso()) {
    await tursoQuery(async () => {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      // First delete any existing unused codes for this chatId to avoid
      // UNIQUE(chatId, code) constraint issues
      await t.execute({
        sql: "DELETE FROM TelegramAuthCode WHERE chatId = ? AND used = 0",
        args: [data.chatId],
      });
      await t.execute({
        sql: "INSERT INTO TelegramAuthCode (id, chatId, telegramUserId, telegramUsername, code, expiresAt, used, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
        args: [id, data.chatId, data.telegramUserId, data.telegramUsername ?? null, data.code, data.expiresAt, now],
      });
    });
    return;
  }
  const { db } = await import("@/lib/db");
  await prismaRetry(() => db.telegramAuthCode.create({
    data: {
      chatId: data.chatId,
      telegramUserId: BigInt(data.telegramUserId),
      telegramUsername: data.telegramUsername ?? null,
      code: data.code,
      expiresAt: new Date(data.expiresAt),
    },
  }));
}

async function deleteExpiredTelegramAuthCodes(chatId: string): Promise<void> {
  if (isTurso()) {
    const t = getTursoClient();
    const now = new Date().toISOString();
    await t.execute({ sql: "DELETE FROM TelegramAuthCode WHERE chatId = ? AND (used = 1 OR expiresAt < ?)", args: [chatId, now] });
    return;
  }
  const { db } = await import("@/lib/db");
  await db.telegramAuthCode.deleteMany({ where: { chatId, OR: [{ used: true }, { expiresAt: { lt: new Date() } }] } });
}

/**
 * Get user playlists, auto-create "Избранное" if none exist.
 */
async function getUserPlaylistsOrCreate(chatId: string): Promise<{ userId: string; playlists: PlaylistSummary[] } | null> {
  const user = await findUserByChatId(chatId);
  if (!user) return null;

  let playlists = await getUserPlaylists(user.id);
  if (playlists.length === 0) {
    // Create default playlist
    if (isTurso()) {
      const t = getTursoClient();
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date().toISOString();
      await t.execute({
        sql: "INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt) VALUES (?, ?, 'Избранное', '', '', 0, '', '[]', 0, ?, ?)",
        args: [id, user.id, now, now],
      });
    } else {
      const { db } = await import("@/lib/db");
      await db.playlist.create({
        data: { userId: user.id, name: "Избранное", tracksJson: "[]" },
      });
    }
    playlists = await getUserPlaylists(user.id);
  }
  return { userId: user.id, playlists };
}

/* ------------------------------------------------------------------ */
/*  UserSync-backed data (shared with web app)                         */
/* ------------------------------------------------------------------ */

/**
 * Get a JSON-blob from UserSync by key, parsed as object.
 * Used for: likedTracks (string[]), likedTracksData (Track[]), history (Track[]).
 */
async function getUserSyncData<T = any>(userId: string, key: string): Promise<T | null> {
  try {
    const rows = await database.findUserSyncData(userId);
    const row = rows.find((r) => r.key === key);
    if (!row) return null;
    return JSON.parse(row.data || "null") as T;
  } catch {
    return null;
  }
}

async function setUserSyncData(userId: string, key: string, data: unknown): Promise<void> {
  await database.upsertUserSync(userId, key, JSON.stringify(data ?? null));
}

interface LikeEntry {
  id: string;
  title: string;
  artist: string;
  duration?: number;
  cover?: string;
  scTrackId?: number | null;
  source?: string;
  audioUrl?: string;
  likedAt?: string;
}

/**
 * Read the user's liked tracks (full data + IDs).
 * Mirrors the format the web app stores in UserSync.
 */
async function getUserLikes(userId: string): Promise<{ ids: string[]; tracks: LikeEntry[] }> {
  const [ids, tracks] = await Promise.all([
    getUserSyncData<string[]>(userId, "likedTracks"),
    getUserSyncData<LikeEntry[]>(userId, "likedTracksData"),
  ]);
  return {
    ids: Array.isArray(ids) ? ids : [],
    tracks: Array.isArray(tracks) ? tracks : [],
  };
}

/**
 * Add a track to the user's liked list (idempotent).
 * Writes BOTH likedTracks (IDs) and likedTracksData (full Track objects),
 * so the like is visible in the web app on next sync.
 */
async function addUserLike(userId: string, track: LikeEntry): Promise<{ added: boolean; total: number }> {
  const { ids, tracks } = await getUserLikes(userId);
  if (ids.includes(track.id)) {
    return { added: false, total: ids.length };
  }
  const newTrack: LikeEntry = { ...track, likedAt: new Date().toISOString() };
  const newIds = [...ids, track.id];
  const newTracks = [...tracks, newTrack];
  // Cap at 200 likes to avoid unbounded growth (matches web app's MAX_LIKED_TRACKS pattern)
  const MAX = 200;
  const trimmedIds = newIds.slice(-MAX);
  const trimmedTracks = newTracks.slice(-MAX);
  await Promise.all([
    setUserSyncData(userId, "likedTracks", trimmedIds),
    setUserSyncData(userId, "likedTracksData", trimmedTracks),
  ]);
  return { added: true, total: trimmedIds.length };
}

/** Remove a track from likes by ID. */
async function removeUserLike(userId: string, trackId: string): Promise<{ removed: boolean; total: number }> {
  const { ids, tracks } = await getUserLikes(userId);
  if (!ids.includes(trackId)) {
    return { removed: false, total: ids.length };
  }
  const newIds = ids.filter((id) => id !== trackId);
  const newTracks = tracks.filter((t) => t.id !== trackId);
  await Promise.all([
    setUserSyncData(userId, "likedTracks", newIds),
    setUserSyncData(userId, "likedTracksData", newTracks),
  ]);
  return { removed: true, total: newIds.length };
}

/**
 * Read the user's recent listening history (mirror of web app's history key).
 * Returns tracks newest-last.
 */
async function getUserHistory(userId: string, limit = 20): Promise<LikeEntry[]> {
  const history = await getUserSyncData<LikeEntry[]>(userId, "history");
  if (!Array.isArray(history)) return [];
  return history.slice(-limit).reverse();
}

/* ------------------------------------------------------------------ */
/*  Recommendations (calls internal /api/music/recommendations)        */
/* ------------------------------------------------------------------ */

interface RecTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  cover?: string;
  genre?: string;
  audioUrl?: string;
  previewUrl?: string;
  source?: string;
  scTrackId?: number | null;
  scStreamPolicy?: string;
  scIsFull?: boolean;
}

interface RecCategory {
  id: string;
  title: string;
  icon: string;
  tracks: RecTrack[];
}

interface RecResponse {
  tracks: RecTrack[];
  categories: RecCategory[];
  _meta?: {
    seedCount?: number;
    totalCandidates?: number;
    afterDedup?: number;
    forYouCount?: number;
    discoveryCount?: number;
  };
}

/**
 * Fetch personalized recommendations for the user.
 * Mirrors what the web app does — uses the user's likes + history as seeds.
 *
 * Hits our own /api/music/recommendations endpoint (same Vercel function).
 * Falls back gracefully if any step fails.
 */
async function fetchRecommendations(
  userId: string,
  options: { limit?: number; category?: string } = {},
): Promise<{ tracks: RecTrack[]; category?: RecCategory; meta?: RecResponse["_meta"] }> {
  const limit = options.limit || 15;
  const origin = getSiteOrigin();

  // Build seeds from likes + history (parallel)
  const [likes, history] = await Promise.all([
    getUserLikes(userId),
    getUserHistory(userId, 50),
  ]);

  // Extract SoundCloud IDs (only valid numbers)
  const likedScIds = likes.tracks
    .map((t) => Number(t.scTrackId))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 10);
  const historyScIds = history
    .map((t) => Number(t.scTrackId))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 10);

  // Extract top artists from history (most-listened)
  const artistCount = new Map<string, number>();
  for (const t of history) {
    if (!t.artist) continue;
    artistCount.set(t.artist, (artistCount.get(t.artist) || 0) + 1);
  }
  const topArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  // Extract top genres from history + likes
  const genreCount = new Map<string, number>();
  for (const t of [...history, ...likes.tracks]) {
    const g = (t as any).genre || "";
    if (!g || typeof g !== "string") continue;
    genreCount.set(g, (genreCount.get(g) || 0) + 1);
  }
  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  // No seeds at all — can't personalize
  if (likedScIds.length === 0 && historyScIds.length === 0 && topArtists.length === 0) {
    return { tracks: [] };
  }

  const params = new URLSearchParams();
  if (likedScIds.length) params.set("likedScIds", likedScIds.join(","));
  if (historyScIds.length) params.set("historyScIds", historyScIds.join(","));
  if (topArtists.length) params.set("artists", topArtists.join(","));
  if (topGenres.length) params.set("genres", topGenres.join(","));

  try {
    const res = await fetch(`${origin}/api/music/recommendations?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      // Same-instance fetch — no need for external auth
    });
    if (!res.ok) return { tracks: [] };
    const data = (await res.json()) as RecResponse;
    if (!data || !Array.isArray(data.tracks)) return { tracks: [] };

    // Pick a category if user asked for one, otherwise prefer "Для вас"
    const cats = data.categories || [];
    let chosenCat: RecCategory | undefined;
    if (options.category) {
      chosenCat = cats.find((c) => c.id === options.category);
    }
    if (!chosenCat) {
      chosenCat = cats.find((c) => c.id === "for_you") || cats[0];
    }

    // Source tracks: prefer chosen category, fallback to flat list
    const sourceTracks = chosenCat?.tracks?.length ? chosenCat.tracks : data.tracks;
    return {
      tracks: sourceTracks.slice(0, limit),
      category: chosenCat,
      meta: data._meta,
    };
  } catch (err) {
    console.error("[telegram-bot] fetchRecommendations error:", err);
    return { tracks: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  Inline Keyboard builders                                          */
/* ------------------------------------------------------------------ */

function buildPlaylistKeyboard(playlists: PlaylistSummary[], action: string) {
  const buttons = playlists.slice(0, 8).map((pl) => ({
    text: `${pl.name} (${pl.trackCount})`,
    callback_data: `${action}:${pl.id}`,
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "Отмена", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

function buildSearchResultsKeyboard(tracks: any[], page: number = 0) {
  const perPage = 5;
  const start = page * perPage;
  const end = start + perPage;
  const items = tracks.slice(start, end);
  const buttons = items.map((t: any, i: number) => ({
    text: `${t.title} — ${t.artist}`,
    callback_data: `add_search:${start + i}`,
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = buttons.map((b) => [b]);
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `search_page:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `search_page:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "Отмена", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

function buildPreviewKeyboard(trackIndex: number, isLiked: boolean = false) {
  const likeText = isLiked ? "❤️ В лайках" : "🤍 Лайк";
  const likeCb = isLiked ? `unlike_idx:${trackIndex}` : `like_idx:${trackIndex}`;
  return {
    inline_keyboard: [
      [
        { text: "▶ Прослушать", callback_data: `preview:${trackIndex}` },
        { text: "+ В плейлист", callback_data: `add_search:${trackIndex}` },
      ],
      [
        { text: likeText, callback_data: likeCb },
        { text: "📂 Открыть на сайте", callback_data: `open_track:${trackIndex}` },
      ],
      [{ text: "✖ Закрыть", callback_data: "cancel" }],
    ],
  };
}

/**
 * Build the playlist-list keyboard with rich per-playlist actions.
 * Each row: [Open] [Rename] [Delete] for one playlist.
 * Plus footer: "New playlist", "Back to menu".
 */
function buildPlaylistListKeyboard(playlists: PlaylistSummary[]) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const pl of playlists.slice(0, 8)) {
    rows.push([
      { text: `📂 ${pl.name} (${pl.trackCount})`, callback_data: `view_playlist:${pl.id}` },
      { text: "✏️", callback_data: `rename_playlist:${pl.id}` },
      { text: "🗑", callback_data: `delete_playlist:${pl.id}` },
    ]);
  }
  rows.push([{ text: "+ Новый плейлист", callback_data: "cmd_newplaylist" }]);
  rows.push([{ text: "✖ Закрыть", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

/**
 * Build the tracks-in-a-playlist keyboard.
 * Each track row: [Title — Artist] [▶ open] [❤ like] [✖ remove]
 * Plus nav + footer.
 */
function buildPlaylistTracksKeyboard(
  playlist: PlaylistRow,
  page: number,
  pageSize = 5,
) {
  let tracks: any[] = [];
  try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }
  const start = page * pageSize;
  const end = start + pageSize;
  const items = tracks.slice(start, end);

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const trackIdx = start + i;
    const title = String(t.title || "Без названия").slice(0, 40);
    const artist = String(t.artist || "").slice(0, 25);
    rows.push([
      { text: `${title} — ${artist}`, callback_data: `track_info:${playlist.id}:${trackIdx}` },
    ]);
    rows.push([
      { text: "▶ Слушать", callback_data: `play_pl_track:${playlist.id}:${trackIdx}` },
      { text: "🤍 Лайк", callback_data: `like_pl_track:${playlist.id}:${trackIdx}` },
      { text: "🗑 Убрать", callback_data: `remove_pl_track:${playlist.id}:${trackIdx}` },
    ]);
  }

  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `pl_tracks_page:${playlist.id}:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `pl_tracks_page:${playlist.id}:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);

  rows.push([
    { text: "✏️ Переименовать", callback_data: `rename_playlist:${playlist.id}` },
    { text: playlist.isPublic ? "🔒 Сделать приватным" : "🌐 Опубликовать", callback_data: `toggle_public:${playlist.id}` },
  ]);
  rows.push([{ text: "🔗 Поделиться", callback_data: `share_playlist:${playlist.id}` }]);
  rows.push([{ text: "« К плейлистам", callback_data: "cmd_playlists" }]);
  return { inline_keyboard: rows };
}

/**
 * Build the likes-list keyboard with pagination + per-track actions.
 */
function buildLikesKeyboard(tracks: LikeEntry[], page: number, pageSize = 5) {
  const start = page * pageSize;
  const end = start + pageSize;
  const items = tracks.slice(start, end);

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const trackIdx = start + i;
    const title = String(t.title || "Без названия").slice(0, 40);
    const artist = String(t.artist || "").slice(0, 25);
    rows.push([{ text: `❤ ${title} — ${artist}`, callback_data: `track_info_like:${trackIdx}` }]);
    rows.push([
      { text: "▶ Слушать", callback_data: `play_like_track:${trackIdx}` },
      { text: "🗑 Убрать", callback_data: `unlike:${trackIdx}` },
    ]);
  }

  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `likes_page:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `likes_page:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "✖ Закрыть", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

function buildHistoryKeyboard(tracks: LikeEntry[], page: number, pageSize = 5) {
  const start = page * pageSize;
  const end = start + pageSize;
  const items = tracks.slice(start, end);

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const trackIdx = start + i;
    const title = String(t.title || "Без названия").slice(0, 40);
    const artist = String(t.artist || "").slice(0, 25);
    rows.push([{ text: `▶ ${title} — ${artist}`, callback_data: `hist_play:${trackIdx}` }]);
    rows.push([
      { text: "+ В плейлист", callback_data: `hist_to_pl:${trackIdx}` },
      { text: "🤍 Лайк", callback_data: `hist_like:${trackIdx}` },
    ]);
  }

  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `hist_page:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `hist_page:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "✖ Закрыть", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

/**
 * Recommendations keyboard — reuses search_results state machine.
 * Each track row: [▶ preview] [+ add to playlist] [🤍 like]
 * If user has an active playlist open, the "+ Add" button adds directly there.
 */
function buildRecommendationsKeyboard(
  tracks: RecTrack[],
  page: number,
  hasActivePlaylist: boolean,
) {
  const perPage = 5;
  const start = page * perPage;
  const end = start + perPage;
  const items = tracks.slice(start, end);

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const idx = start + i;
    const title = String(t.title || "Без названия").slice(0, 40);
    const artist = String(t.artist || "").slice(0, 25);
    rows.push([
      { text: `▶ ${title} — ${artist}`, callback_data: `preview:${idx}` },
      { text: hasActivePlaylist ? "+ Сюда" : "+ Добавить", callback_data: `add_search:${idx}` },
    ]);
    rows.push([
      { text: "🤍 Лайк", callback_data: `like_idx:${idx}` },
      { text: "📂 Открыть", callback_data: `open_track:${idx}` },
    ]);
  }

  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `search_page:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `search_page:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "🔄 Обновить", callback_data: "cmd_recs" }]);
  rows.push([{ text: "✖ Закрыть", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

/* ------------------------------------------------------------------ */
/*  Menu / Help text                                                   */
/* ------------------------------------------------------------------ */

const HELP_TEXT = `🎵 <b>mq — музыкальный бот</b>

<b>Рекомендации:</b>
/recs — персональные рекомендации на основе ваших лайков и истории
Алгоритм как на сайте: похожее на лайкнутое + открытия по жанрам

<b>Поиск и сохранение:</b>
/search — найти треки на SoundCloud
В результатах: ▶ прослушать, + в плейлист, 🤍 лайкнуть

<b>Лайки:</b>
/likes — ваши любимые треки (общие с сайтом)
Можно лайкнуть из поиска, рекомендаций или плейлиста

<b>Плейлисты:</b>
/playlists — открыть плейлист → смотреть треки, переименовать, удалить, поделиться
/newplaylist — создать новый

💡 <b>Хитрость:</b> если открыт плейлист и вы скидываете аудио —
оно автоматически добавится в этот плейлист, без выбора.

<b>История:</b>
/recent — недавние прослушивания (зеркало сайта)

<b>Статистика:</b>
/stats — сколько треков, лайков и плейлистов

<b>Сайт:</b>
/link — открыть веб-версию плеера

<b>Импорт треков:</b>
Отправьте аудио или голосовое сообщение боту — он предложит добавить в плейлист. Можно отправить сразу несколько.

<b>Команды:</b>
/menu — это меню
/help — помощь
/code — получить код входа на сайт

Все данные синхронизируются между ботом и сайтом.`;

const MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "✨ Рекомендации", callback_data: "cmd_recs" }],
    [{ text: "🔍 Поиск треков", callback_data: "cmd_search" }],
    [
      { text: "❤️ Лайки", callback_data: "cmd_likes" },
      { text: "🎵 Плейлисты", callback_data: "cmd_playlists" },
    ],
    [
      { text: "🕑 Недавнее", callback_data: "cmd_recent" },
      { text: "📊 Статистика", callback_data: "cmd_stats" },
    ],
    [
      { text: "📂 Открыть сайт", callback_data: "cmd_link" },
      { text: "❓ Справка", callback_data: "cmd_help" },
    ],
  ],
};

/* ================================================================== */
/*  Handle incoming Telegram message                                   */
/* ================================================================== */

export async function handleTelegramMessage(body: Record<string, any>) {
  const message = body.message;
  if (!message) return;

  const chatId = String(message.chat?.id);
  const from = message.from;
  const text = (message.text || "").trim();
  if (!chatId || !from) return;

  // ---- /start (with optional deep link payload) ----
  // /start → welcome message
  // /start code → auto-trigger /code (user clicked "Открыть бота" from login page)
  if (text === "/start" || text.startsWith("/start ")) {
    const payload = text.replace("/start", "").trim();

    // Bot menu setup is global and idempotent — run once per cold start
    // (was firing on EVERY /start, wasting 1-2s and hitting rate limits).
    setupBotOnce().catch(() => {});

    // If payload is "code" — auto-trigger auth code flow
    if (payload === "code") {
      await handleAuthCode(chatId, from);
      return;
    }

    // Default welcome
    await sendTelegramMessage(chatId,
      `🎵 <b>Добро пожаловать в mq!</b>\n\n` +
      `Введите <b>любое сообщение</b> (или /code), чтобы получить код входа.\n\n` +
      `После авторизации используйте /menu для доступа к функциям плеера.`,
      { parseMode: "HTML" }
    );
    return;
  }

  // ---- /code (auth) — only when idle (no active state) ----
  if (text === "/code") {
    await handleAuthCode(chatId, from);
    return;
  }

  // ---- /menu ----
  if (text === "/menu") {
    await sendTelegramMessage(chatId, "🎵 <b>Главное меню mq</b>\n\nВыберите действие:", {
      parseMode: "HTML",
      replyMarkup: MENU_KEYBOARD,
    });
    return;
  }

  // ---- /help ----
  if (text === "/help") {
    await sendTelegramMessage(chatId, HELP_TEXT, { parseMode: "HTML" });
    return;
  }

  // ---- /playlists ----
  if (text === "/playlists") {
    await handlePlaylists(chatId);
    return;
  }

  // ---- /likes — show user's liked tracks
  if (text === "/likes") {
    await handleLikes(chatId);
    return;
  }

  // ---- /recent — show recently played history
  if (text === "/recent") {
    await handleRecent(chatId);
    return;
  }

  // ---- /stats — show user stats
  if (text === "/stats") {
    await handleStats(chatId);
    return;
  }

  // ---- /link — get webapp link
  if (text === "/link") {
    const origin = getSiteOrigin();
    await sendTelegramMessage(chatId,
      `📂 <b>Открыть mq в браузере</b>\n\n` +
      `<a href="${origin}">${origin}</a>\n\n` +
      `Все ваши плейлисты, лайки и история доступны и на сайте.`,
      { parseMode: "HTML" }
    );
    return;
  }

  // ---- /recs или /recommendations — персональные рекомендации
  if (text === "/recs" || text === "/recommendations" || text.startsWith("/recs ") || text.startsWith("/recommendations ")) {
    await handleRecommendations(chatId);
    return;
  }

  // ---- /newplaylist ----
  if (text === "/newplaylist") {
    const user = await findUserByChatId(chatId);
    if (!user) { await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await setChatState(chatId, "awaiting_new_playlist");
    await sendTelegramMessage(chatId, "Введите название нового плейлиста:");
    return;
  }

  // ---- /rename <playlistId> — internal use, also reachable via button
  if (text.startsWith("/rename ")) {
    const user = await findUserByChatId(chatId);
    if (!user) { await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code"); return; }
    const playlistId = text.slice(8).trim();
    const pl = await findPlaylistById(playlistId);
    if (!pl || pl.userId !== user.id) {
      await sendTelegramMessage(chatId, "Плейлист не найден.");
      return;
    }
    await setChatState(chatId, "awaiting_rename_playlist", { fileUrl: null, fileDuration: 0, originalFilename: "" }, undefined, undefined, undefined, { activePlaylistId: playlistId });
    await sendTelegramMessage(chatId, `Текущее название: <b>${pl.name}</b>\n\nВведите новое название:`, { parseMode: "HTML" });
    return;
  }

  // ---- /search [query] or /search ----
  if (text === "/search" || text.startsWith("/search ")) {
    const user = await findUserByChatId(chatId);
    if (!user) { await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code"); return; }
    const query = text.slice(8).trim();
    if (!query) {
      await setChatState(chatId, "awaiting_search_query");
      await sendTelegramMessage(chatId, "Введите название трека или исполнителя для поиска:");
      return;
    }
    await handleSearch(chatId, query);
    return;
  }

  // ---- Audio message received (before state check) ----
  if (message.audio || message.voice) {
    // Parallel: fetch user + state at the same time (was 2 sequential DB calls)
    const [user, existingState] = await Promise.all([
      findUserByChatId(chatId),
      getChatState(chatId),
    ]);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code для получения кода входа.");
      return;
    }
    // Check if already collecting — if so, add to batch
    if (existingState && existingState.state === "collecting_audios") {
      await addToAudioBatch(chatId, message, existingState);
      return;
    }
    // Start new batch collection
    await handleAudioMessage(chatId, message);
    return;
  }

  // ---- Handle conversation states ----
  const chatState = await getChatState(chatId);

  // If in collecting_audios state, handle user text
  if (chatState && chatState.state === "collecting_audios") {
    if (text === "/cancel" || text.toLowerCase() === "стоп") {
      // Cancel collection
      await clearChatState(chatId);
      if (chatState.collectingMessageId) {
        await editMessageText(chatId, chatState.collectingMessageId, "Коллекция отменена.");
      }
      return;
    }
    if (text.toLowerCase() === "добавить" || text.toLowerCase() === "готово") {
      await handleFinishBatchCollection(chatId, chatState);
      return;
    }
    // Otherwise ignore — user is still collecting audios
    return;
  }

  // Non-command text with no active state → auth code
  if (!chatState && !text.startsWith("/")) {
    await handleAuthCode(chatId, from);
    return;
  }

  if (!chatState) return;

  // Awaiting search query
  if (chatState.state === "awaiting_search_query" && text) {
    await clearChatState(chatId);
    await handleSearch(chatId, text);
    return;
  }

  // Awaiting new playlist name
  if (chatState.state === "awaiting_new_playlist" && text) {
    await clearChatState(chatId);
    await handleNewPlaylist(chatId, text);
    return;
  }

  // Awaiting import title
  if (chatState.state === "awaiting_import_title" && text) {
    await clearChatState(chatId);
    await handleImportWithTitle(chatId, text, chatState.data);
    return;
  }

  // Awaiting rename playlist — user typed new name
  if (chatState.state === "awaiting_rename_playlist" && text) {
    const playlistId = chatState.activePlaylistId;
    await clearChatState(chatId);
    if (!playlistId) {
      await sendTelegramMessage(chatId, "Сессия истекла. Используйте /playlists.");
      return;
    }
    await handleRenamePlaylist(chatId, playlistId, text);
    return;
  }
}

/* ================================================================== */
/*  Handle callback query (inline keyboard presses)                    */
/* ================================================================== */

export async function handleCallbackQuery(body: Record<string, any>) {
  const callbackQuery = body.callback_query;
  if (!callbackQuery) return;

  const chatId = String(callbackQuery.message?.chat?.id);
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data || "";

  if (!chatId || !messageId) return;

  await answerCallbackQuery(callbackQuery.id);

  // Cancel
  if (data === "cancel") {
    await clearChatState(chatId);
    await editMessageText(chatId, messageId, "Действие отменено.");
    return;
  }

  // Menu commands from keyboard
  if (data === "cmd_help") {
    await editMessageText(chatId, messageId, HELP_TEXT, { parseMode: "HTML" });
    return;
  }
  if (data === "cmd_import") {
    await editMessageText(chatId, messageId,
      "Отправьте аудио файл или голосовое сообщение, чтобы импортировать его в плеер.\n\n" +
      "Вы можете отправить сразу несколько аудио — бот соберёт их все и предложит добавить в плейлист.\n\n" +
      "Поддерживаются форматы: MP3, OGG, M4A, WAV и другие.",
      { parseMode: "HTML" }
    );
    return;
  }
  if (data === "cmd_search") {
    // react-best-practices rule async-parallel: findUserByChatId and
    // setChatState are independent — run in parallel instead of sequential.
    const [user] = await Promise.all([
      findUserByChatId(chatId),
      setChatState(chatId, "awaiting_search_query"),
    ]);
    if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await editMessageText(chatId, messageId, "Введите название трека или исполнителя для поиска:");
    return;
  }
  if (data === "cmd_playlists") {
    await handlePlaylists(chatId, messageId);
    return;
  }
  if (data === "cmd_newplaylist") {
    // async-parallel: findUserByChatId + setChatState independent
    const [user] = await Promise.all([
      findUserByChatId(chatId),
      setChatState(chatId, "awaiting_new_playlist"),
    ]);
    if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await editMessageText(chatId, messageId, "Введите название нового плейлиста:");
    return;
  }
  if (data === "cmd_likes") {
    await handleLikes(chatId, messageId);
    return;
  }
  if (data === "cmd_recent") {
    await handleRecent(chatId, messageId);
    return;
  }
  if (data === "cmd_stats") {
    await handleStats(chatId, messageId);
    return;
  }
  if (data === "cmd_link") {
    const origin = getSiteOrigin();
    await editMessageText(chatId, messageId,
      `📂 <b>Открыть mq в браузере</b>\n\n<a href="${origin}">${origin}</a>`,
      { parseMode: "HTML" }
    );
    return;
  }
  if (data === "cmd_recs") {
    await handleRecommendations(chatId, messageId);
    return;
  }

  // ---- State-dependent callbacks ----
  const state = await getChatState(chatId);

  // Batch add: user clicked "Add all to playlist" during collection
  if (data === "batch_add") {
    if (!state || state.state !== "collecting_audios") {
      await editMessageText(chatId, messageId, "Сессия истекла. Отправьте аудио заново.");
      return;
    }
    await handleFinishBatchCollection(chatId, state);
    return;
  }

  // User wants to switch target playlist during batch collection
  if (data === "batch_pick_playlist") {
    if (!state || state.state !== "collecting_audios") {
      await editMessageText(chatId, messageId, "Сессия истекла. Отправьте аудио заново.");
      return;
    }
    // Clear the active target so handleFinishBatchCollection shows the picker
    await setChatState(
      chatId,
      "collecting_audios",
      state.data,
      state.searchResults,
      state.audioBatch,
      state.collectingMessageId,
      { activePlaylistId: undefined, viewPage: undefined },
    );
    const updatedState: ChatState = { ...state, activePlaylistId: undefined };
    await handleFinishBatchCollection(chatId, updatedState);
    return;
  }

  // Preview: user wants to listen to a track before adding
  if (data.startsWith("preview:")) {
    const index = parseInt(data.slice("preview:".length), 10);
    if (!state || !state.searchResults?.length) {
      await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
      return;
    }
    const track = state.searchResults[index];
    if (!track) return;

    // Check like state from DB
    const user = await findUserByChatId(chatId);
    let isLiked = false;
    if (user) {
      const likes = await getUserLikes(user.id);
      const trackId = String(track.scTrackId ? `sc_${track.scTrackId}` : `tg_${track.id || ""}`);
      isLiked = likes.ids.includes(trackId);
    }
    const keyboard = buildPreviewKeyboard(index, isLiked);

    // Send "searching audio..." message
    await editMessageText(chatId, messageId,
      `Загружаю: <b>${track.title}</b> — ${track.artist}...`,
      { parseMode: "HTML" }
    );

    // Try to resolve a direct audio URL from SoundCloud
    if (track.scTrackId) {
      const audioUrl = await resolveSCStreamUrl(track.scTrackId);
      if (audioUrl) {
        // Send audio as a proper Telegram audio message
        await sendTelegramAudio(chatId, audioUrl, {
          title: track.title,
          performer: track.artist,
          duration: track.duration,
          caption: `🎵 ${track.title} — ${track.artist}`,
          replyMarkup: keyboard,
        });
        return;
      }
    }

    // Fallback: if we can't resolve audio, send a link
    const scLink = track.permalinkUrl || `https://soundcloud.com/search?q=${encodeURIComponent(track.title + ' ' + track.artist)}`;
    await editMessageText(chatId, messageId,
      `<b>${track.title}</b> — ${track.artist}\n\nНе удалось загрузить аудио.\nПрослушать: <a href="${scLink}">открыть на SoundCloud</a>`,
      { parseMode: "HTML", replyMarkup: keyboard }
    );
    return;
  }

  // Import: user chose a playlist
  if (data.startsWith("import_playlist:")) {
    const playlistId = data.slice("import_playlist:".length);
    if (!state || state.state !== "awaiting_import_playlist") {
      await editMessageText(chatId, messageId, "Сессия истекла. Отправьте аудио заново.");
      return;
    }
    await clearChatState(chatId);
    // Check if this is a batch import (audioBatch exists)
    if (state.audioBatch && state.audioBatch.length > 0) {
      await handleBatchImportToPlaylist(chatId, messageId, playlistId, state.audioBatch);
    } else {
      await handleImportToPlaylist(chatId, playlistId, state.data);
    }
    return;
  }

  // Import: user wants to type title
  if (data === "import_custom_title") {
    if (!state || state.state !== "awaiting_import_playlist") {
      await editMessageText(chatId, messageId, "Сессия истекла. Отправьте аудио заново.");
      return;
    }
    await setChatState(chatId, "awaiting_import_title", state.data);
    await editMessageText(chatId, messageId,
      "Введите название трека и исполнителя (например: <i>Название — Исполнитель</i>):",
      { parseMode: "HTML" }
    );
    return;
  }

  // Search: user chose a track to add → show preview choice first
  if (data.startsWith("add_search:")) {
    const index = parseInt(data.slice("add_search:".length), 10);
    if (!state || !state.searchResults?.length) {
      await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
      return;
    }
    const track = state.searchResults[index];
    if (!track) return;

    // Check if user has playlists, auto-create if needed
    const user = await findUserByChatId(chatId);
    if (!user) { await editMessageText(chatId, messageId, "Ошибка авторизации."); return; }

    // If a playlist is currently "open", add directly there — skip the picker.
    // This makes the "+ Сюда" button on recs / search results work as expected.
    const targetPlaylistId = state.activePlaylistId;
    if (targetPlaylistId) {
      const pl = await findPlaylistById(targetPlaylistId);
      if (pl && pl.userId === user.id) {
        // Ensure track has stable id
        const trackId = String(track.id || (track.scTrackId ? `sc_${track.scTrackId}` : `sc_${index}`));
        if (!track.id) track.id = trackId;
        // Add directly
        await handleAddSearchTrackToPlaylist(chatId, targetPlaylistId, {
          ...state.data,
          scTrackId: track.scTrackId,
          scData: track,
        });
        return;
      }
    }

    const playlists = await getUserPlaylists(user.id);
    if (playlists.length === 0) {
      // Auto-create "Избранное" and try again
      await createPlaylist(user.id, "Избранное", "[]");
      const newPlaylists = await getUserPlaylists(user.id);
      await setChatState(chatId, "awaiting_add_to_playlist",
        { ...state.data, scTrackId: track.scTrackId, scData: track },
        state.searchResults,
        undefined,
        undefined,
        { activePlaylistId: state.activePlaylistId, viewPage: state.viewPage },
      );
      await editMessageText(chatId, messageId,
        `Выбран трек: <b>${track.title}</b> — ${track.artist}\n\n` +
        `Плейлист <b>Избранное</b> создан автоматически.\n\nВ какой плейлист добавить?`,
        { parseMode: "HTML", replyMarkup: buildPlaylistKeyboard(newPlaylists, "add_search_pl") }
      );
      return;
    }

    // Show playlist picker directly (user already decided to add)
    await setChatState(chatId, "awaiting_add_to_playlist",
      { ...state.data, scTrackId: track.scTrackId, scData: track },
      state.searchResults,
      undefined,
      undefined,
      { activePlaylistId: state.activePlaylistId, viewPage: state.viewPage },
    );
    await editMessageText(chatId, messageId,
      `Выбран трек: <b>${track.title}</b> — ${track.artist}\n\nВ какой плейлист добавить?`,
      { parseMode: "HTML", replyMarkup: buildPlaylistKeyboard(playlists, "add_search_pl") }
    );
    return;
  }

  // Search: user chose playlist for search result
  if (data.startsWith("add_search_pl:")) {
    const playlistId = data.slice("add_search_pl:".length);
    if (!state || state.state !== "awaiting_add_to_playlist") {
      await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
      return;
    }
    await clearChatState(chatId);
    await handleAddSearchTrackToPlaylist(chatId, playlistId, state.data);
    return;
  }

  // Search pagination — rebuild keyboard with preview buttons
  if (data.startsWith("search_page:")) {
    const page = parseInt(data.slice("search_page:".length), 10);
    if (!state || !state.searchResults?.length) {
      await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
      return;
    }
    const hasActivePl = !!state.activePlaylistId;
    // Build enhanced keyboard with preview + add buttons per track
    const perPage = 5;
    const start = page * perPage;
    const end = start + perPage;
    const items = state.searchResults.slice(start, end);
    const rows: Array<Array<{ text: string; callback_data: string }>> = items.map((t: any, i: number) => {
      const idx = start + i;
      return [
        { text: `▶ ${t.title} — ${t.artist}`, callback_data: `preview:${idx}` },
        { text: hasActivePl ? "+ Сюда" : "+ Добавить", callback_data: `add_search:${idx}` },
      ];
    });
    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 0) navRow.push({ text: "< Назад", callback_data: `search_page:${page - 1}` });
    if (end < state.searchResults.length) navRow.push({ text: "Далее >", callback_data: `search_page:${page + 1}` });
    if (navRow.length > 0) rows.push(navRow);
    rows.push([{ text: "Отмена", callback_data: "cancel" }]);

    await editMessageText(chatId, messageId,
      `Найдено ${state.searchResults.length} треков:\n\n` +
      (hasActivePl ? `💡 Активный плейлист — кнопка «+ Сюда» добавит сразу туда.\n\n` : "") +
      `Нажмите ▶ для прослушивания, или + для добавления в плейлист.`,
      { parseMode: "HTML", replyMarkup: { inline_keyboard: rows } }
    );
    return;
  }

  // Delete playlist
  if (data.startsWith("delete_playlist:")) {
    const playlistId = data.slice("delete_playlist:".length);
    const user = await findUserByChatId(chatId);
    if (!user) return;
    const existing = await findPlaylistById(playlistId);
    if (!existing || existing.userId !== user.id) {
      await editMessageText(chatId, messageId, "Плейлист не найден.");
      return;
    }
    await deletePlaylist(playlistId);
    await editMessageText(chatId, messageId, `Плейлист "${existing.name}" удалён.`);
    return;
  }

  // ─── View playlist tracks ────────────────────────────────────────────
  if (data.startsWith("view_playlist:")) {
    const playlistId = data.slice("view_playlist:".length);
    await handleViewPlaylist(chatId, messageId, playlistId, 0);
    return;
  }
  if (data.startsWith("pl_tracks_page:")) {
    const parts = data.slice("pl_tracks_page:".length).split(":");
    const playlistId = parts[0];
    const page = parseInt(parts[1] || "0", 10);
    await handleViewPlaylist(chatId, messageId, playlistId, page);
    return;
  }

  // ─── Rename playlist ────────────────────────────────────────────────
  if (data.startsWith("rename_playlist:")) {
    const playlistId = data.slice("rename_playlist:".length);
    const user = await findUserByChatId(chatId);
    if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — /code"); return; }
    const pl = await findPlaylistById(playlistId);
    if (!pl || pl.userId !== user.id) {
      await editMessageText(chatId, messageId, "Плейлист не найден.");
      return;
    }
    await setChatState(chatId, "awaiting_rename_playlist", { fileUrl: null, fileDuration: 0, originalFilename: "" }, undefined, undefined, undefined, { activePlaylistId: playlistId });
    await editMessageText(chatId, messageId,
      `Переименование плейлиста.\nТекущее название: <b>${pl.name}</b>\n\nВведите новое название:`,
      { parseMode: "HTML" }
    );
    return;
  }

  // ─── Toggle public/private ───────────────────────────────────────────
  if (data.startsWith("toggle_public:")) {
    const playlistId = data.slice("toggle_public:".length);
    const user = await findUserByChatId(chatId);
    if (!user) return;
    const pl = await findPlaylistById(playlistId);
    if (!pl || pl.userId !== user.id) {
      await editMessageText(chatId, messageId, "Плейлист не найден.");
      return;
    }
    await togglePlaylistPublic(playlistId, !pl.isPublic);
    await handleViewPlaylist(chatId, messageId, playlistId, 0);
    return;
  }

  // ─── Share playlist ──────────────────────────────────────────────────
  if (data.startsWith("share_playlist:")) {
    const playlistId = data.slice("share_playlist:".length);
    const user = await findUserByChatId(chatId);
    if (!user) return;
    const pl = await findPlaylistById(playlistId);
    if (!pl || pl.userId !== user.id) {
      await editMessageText(chatId, messageId, "Плейлист не найден.");
      return;
    }
    if (!pl.isPublic) {
      await editMessageText(chatId, messageId,
        `Плейлист <b>${pl.name}</b> сейчас приватный.\n\nСначала сделайте его публичным, чтобы поделиться.`,
        { parseMode: "HTML" }
      );
      return;
    }
    const origin = getSiteOrigin();
    const shareUrl = `${origin}/?playlist=${encodeURIComponent(playlistId)}`;
    const trackCount = trackCountFromJson(pl.tracksJson);
    await editMessageText(chatId, messageId,
      `🔗 <b>Ссылка на плейлист</b>\n\n<b>${pl.name}</b>\n${trackCount > 0 ? `Треков: ${trackCount}\n` : ""}\n` +
      `<a href="${shareUrl}">${shareUrl}</a>\n\n` +
      `Эту ссылку можно отправить друзьям — они смогут слушать ваш плейлист.`,
      { parseMode: "HTML", disablePreview: true }
    );
    return;
  }

  // ─── Remove track from playlist ─────────────────────────────────────
  if (data.startsWith("remove_pl_track:")) {
    const parts = data.slice("remove_pl_track:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handleRemoveTrackFromPlaylist(chatId, messageId, playlistId, trackIdx);
    return;
  }

  // ─── Play track from playlist (open in webapp) ──────────────────────
  if (data.startsWith("play_pl_track:")) {
    const parts = data.slice("play_pl_track:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handlePlayPlaylistTrack(chatId, messageId, playlistId, trackIdx);
    return;
  }

  // ─── Like track from playlist ───────────────────────────────────────
  if (data.startsWith("like_pl_track:")) {
    const parts = data.slice("like_pl_track:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handleLikePlaylistTrack(chatId, messageId, playlistId, trackIdx);
    return;
  }
  // ─── Unlike track from playlist track-info view ─────────────────────
  if (data.startsWith("unlike_pl:")) {
    const parts = data.slice("unlike_pl:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handleUnlikePlaylistTrack(chatId, messageId, playlistId, trackIdx);
    return;
  }

  // ─── Track info (from playlist) ─────────────────────────────────────
  if (data.startsWith("track_info:")) {
    const parts = data.slice("track_info:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handleTrackInfoFromPlaylist(chatId, messageId, playlistId, trackIdx);
    return;
  }

  // ─── Likes pagination ───────────────────────────────────────────────
  if (data.startsWith("likes_page:")) {
    const page = parseInt(data.slice("likes_page:".length), 10);
    await handleLikes(chatId, messageId, page);
    return;
  }
  if (data.startsWith("unlike:")) {
    const idx = parseInt(data.slice("unlike:".length), 10);
    await handleUnlikeByIndex(chatId, messageId, idx);
    return;
  }
  if (data.startsWith("track_info_like:")) {
    const idx = parseInt(data.slice("track_info_like:".length), 10);
    await handleTrackInfoFromLikes(chatId, messageId, idx);
    return;
  }
  if (data.startsWith("play_like_track:")) {
    const idx = parseInt(data.slice("play_like_track:".length), 10);
    await handlePlayLikedTrack(chatId, messageId, idx);
    return;
  }

  // ─── Like / unlike from search preview ──────────────────────────────
  if (data.startsWith("like_idx:") || data.startsWith("unlike_idx:")) {
    const isUnlike = data.startsWith("unlike_idx:");
    const idx = parseInt(data.slice(isUnlike ? "unlike_idx:".length : "like_idx:".length), 10);
    await handleLikeSearchTrack(chatId, messageId, idx, isUnlike);
    return;
  }

  // ─── Open track on website (from search) ────────────────────────────
  if (data.startsWith("open_track:")) {
    const idx = parseInt(data.slice("open_track:".length), 10);
    if (!state?.searchResults?.length) return;
    const track = state.searchResults[idx];
    if (!track) return;
    const origin = getSiteOrigin();
    const url = track.scTrackId ? `${origin}/?track=sc_${track.scTrackId}` : origin;
    await editMessageText(chatId, messageId,
      `📂 <b>Открыть трек</b>\n\n${track.title} — ${track.artist}\n\n<a href="${url}">${url}</a>`,
      { parseMode: "HTML", disablePreview: true }
    );
    return;
  }

  // ─── History pagination + actions ───────────────────────────────────
  if (data.startsWith("hist_page:")) {
    const page = parseInt(data.slice("hist_page:".length), 10);
    await handleRecent(chatId, messageId, page);
    return;
  }
  if (data.startsWith("hist_play:")) {
    const idx = parseInt(data.slice("hist_play:".length), 10);
    await handlePlayHistoryTrack(chatId, messageId, idx);
    return;
  }
  if (data.startsWith("hist_like:")) {
    const idx = parseInt(data.slice("hist_like:".length), 10);
    await handleLikeHistoryTrack(chatId, messageId, idx);
    return;
  }
  if (data.startsWith("hist_to_pl:")) {
    const idx = parseInt(data.slice("hist_to_pl:".length), 10);
    await handleAddHistoryToPlaylist(chatId, messageId, idx);
    return;
  }

  // ─── Like / play a track that was just added to a playlist ──────────
  if (data.startsWith("like_added:")) {
    const trackId = data.slice("like_added:".length);
    await handleLikeAddedTrack(chatId, messageId, trackId);
    return;
  }
  if (data.startsWith("play_added:")) {
    const parts = data.slice("play_added:".length).split(":");
    const playlistId = parts[0];
    const trackIdx = parseInt(parts[1] || "0", 10);
    await handlePlayPlaylistTrack(chatId, messageId, playlistId, trackIdx);
    return;
  }
}

/* ================================================================== */
/*  Auth: generate and send verification code                         */
/* ================================================================== */

async function handleAuthCode(chatId: string, from: Record<string, any>) {
  try {
    // Ensure DB schema exists before any DB operation (cached at module scope)
    await ensureSchemaOnce();

    const crypto = await import("crypto");
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Delete old unused codes first (sequential to avoid unique constraint race)
    await deleteExpiredTelegramAuthCodes(chatId).catch(() => {});

    // Telegram user ID — BigInt in Prisma, regular number in Turso.
    let telegramUserId: number;
    try {
      telegramUserId = BigInt(from.id) as unknown as number;
    } catch {
      telegramUserId = Math.abs(Number(from.id)) || 0;
    }

    await createTelegramAuthCode({
      chatId,
      telegramUserId: Number(telegramUserId),
      telegramUsername: from.username || null,
      code,
      expiresAt: expiresAt.toISOString(),
    });

    await sendTelegramMessage(chatId,
      `🔐 <b>Код подтверждения mq:</b>\n\n<code>${code}</code>\n\nКод действителен 10 минут.`,
      { parseMode: "HTML" }
    );
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error("[TG Bot] handleAuthCode error:", errMsg, err?.stack);
    // Provide more specific error message based on error type
    let userMsg = "Ошибка при генерации кода. Попробуйте ещё раз.";

    if (errMsg.includes("no such table") || errMsg.includes("does not exist")) {
      userMsg = "База данных инициализируется. Попробуйте через 10 секунд.";
    } else if (errMsg.includes("UNIQUE") || errMsg.includes("constraint")) {
      userMsg = "Попробуйте ещё раз — произошёл конфликт кодов.";
    } else if (errMsg.includes("TURSO_DATABASE_URL") || errMsg.includes("not configured")) {
      console.error("[TG Bot] CRITICAL: TURSO_DATABASE_URL not configured!");
      userMsg = "Сервис временно недоступен. Мы уже чиним это.";
    } else if (errMsg.includes("Can't reach database") || errMsg.includes("Connection terminated") || errMsg.includes("fetch failed")) {
      // Neon cold start or network error — prismaRetry should handle this,
      // but if all retries failed:
      userMsg = "База данных просыпается. Попробуйте через 10 секунд.";
    } else if (errMsg.includes("ECONNREFUSED") || errMsg.includes("ETIMEDOUT") || errMsg.includes("connect")) {
      userMsg = "Не удалось подключиться к базе. Попробуйте через минуту.";
    } else if (errMsg.includes("prisma") || errMsg.includes("database")) {
      userMsg = "Временная ошибка базы данных. Попробуйте через минуту.";
    }

    await sendTelegramMessage(chatId, userMsg);
  }
}

/* ================================================================== */
/*  Audio message handler                                             */
/* ================================================================== */

async function handleAudioMessage(chatId: string, message: Record<string, any>) {
  const audio = message.audio || message.voice;
  const fileId = audio.file_id;
  const duration = audio.duration || 0;
  const title = audio.title || "";
  const performer = audio.performer || "";
  const fileName = audio.file_name || (message.voice ? "Голосовое сообщение" : "audio");

  if (duration > 600) {
    await sendTelegramMessage(chatId, "Аудио слишком длинное (максимум 10 минут).");
    return;
  }

  const importTitle = (title && performer) ? `${title} — ${performer}` : title || fileName;
  const batchItem: AudioBatchItem = { fileId, fileUrl: null, fileDuration: duration, originalFilename: importTitle };

  // Start batch collection mode
  const pendingData: PendingImport = { fileId, fileUrl: null, fileDuration: duration, originalFilename: importTitle };

  // Check if a playlist is currently "open" — if so, target it directly
  // so subsequent audio uploads land in that playlist without a picker.
  const existingState = await getChatState(chatId);
  const targetPlaylistId = existingState?.activePlaylistId;
  let targetPlaylistName = "";
  if (targetPlaylistId) {
    const user0 = await findUserByChatId(chatId);
    if (user0) {
      const pl = await findPlaylistById(targetPlaylistId);
      if (pl && pl.userId === user0.id) targetPlaylistName = pl.name;
    }
  }

  // Auto-create playlist if user has none AND no target
  if (!targetPlaylistId) {
    const result = await getUserPlaylistsOrCreate(chatId);
    if (!result) return;
  }

  // Set state to collecting_audios with the first item, preserving target
  await setChatState(
    chatId,
    "collecting_audios",
    pendingData,
    undefined,
    [batchItem],
    undefined,
    { activePlaylistId: targetPlaylistId, viewPage: existingState?.viewPage },
  );

  const collectingKeyboard = targetPlaylistId
    ? {
        inline_keyboard: [
          [{ text: `➕ Добавить 1 трек в «${targetPlaylistName}»`, callback_data: "batch_add" }],
          [{ text: "📂 Выбрать другой плейлист", callback_data: "batch_pick_playlist" }],
          [{ text: "Отмена", callback_data: "cancel" }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: `Добавить 1 трек в плейлист`, callback_data: "batch_add" }],
          [{ text: "Отмена", callback_data: "cancel" }],
        ],
      };

  const sentMsg = await sendTelegramMessage(chatId,
    `Аудио получено: <b>${importTitle}</b> (${formatDuration(duration)})\n\n` +
    `Отправьте ещё аудио или нажмите кнопку, чтобы добавить.\n` +
    (targetPlaylistId
      ? `Целевой плейлист: <b>${targetPlaylistName}</b>\n`
      : ""),
    { parseMode: "HTML", replyMarkup: collectingKeyboard }
  );

  // Store the message ID for later editing (preserve target)
  const sentMsgId = sentMsg?.result?.message_id || sentMsg?.message_id;
  if (sentMsgId) {
    await setChatState(
      chatId,
      "collecting_audios",
      pendingData,
      undefined,
      [batchItem],
      sentMsgId,
      { activePlaylistId: targetPlaylistId, viewPage: existingState?.viewPage },
    );
  }
}

/* ================================================================== */
/*  Add to audio batch (when already collecting)                       */
/* ================================================================== */

async function addToAudioBatch(chatId: string, message: Record<string, any>, existingState: ChatState) {
  const audio = message.audio || message.voice;
  const fileId = audio.file_id;
  const duration = audio.duration || 0;
  const title = audio.title || "";
  const performer = audio.performer || "";
  const fileName = audio.file_name || (message.voice ? "Голосовое сообщение" : "audio");

  if (duration > 600) {
    await sendTelegramMessage(chatId, "Это аудио слишком длинное (максимум 10 минут). Пропущено.");
    return;
  }

  const importTitle = (title && performer) ? `${title} — ${performer}` : title || fileName;
  const batchItem: AudioBatchItem = { fileId, fileUrl: null, fileDuration: duration, originalFilename: importTitle };

  const batch = [...(existingState.audioBatch || []), batchItem];
  const count = batch.length;

  // Preserve the target playlist across batch additions
  const targetPlaylistId = existingState.activePlaylistId;
  let targetPlaylistName = "";
  if (targetPlaylistId) {
    const user = await findUserByChatId(chatId);
    if (user) {
      const pl = await findPlaylistById(targetPlaylistId);
      if (pl && pl.userId === user.id) targetPlaylistName = pl.name;
    }
  }

  // Update state with new batch
  await setChatState(
    chatId,
    "collecting_audios",
    existingState.data,
    undefined,
    batch,
    existingState.collectingMessageId,
    { activePlaylistId: targetPlaylistId, viewPage: existingState.viewPage },
  );

  // Update the collecting message
  const collectingKeyboard = targetPlaylistId
    ? {
        inline_keyboard: [
          [{ text: `➕ Добавить ${count} ${getTrackWord(count)} в «${targetPlaylistName}»`, callback_data: "batch_add" }],
          [{ text: "📂 Выбрать другой плейлист", callback_data: "batch_pick_playlist" }],
          [{ text: "Отмена", callback_data: "cancel" }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: `Добавить ${count} ${getTrackWord(count)} в плейлист`, callback_data: "batch_add" }],
          [{ text: "Отмена", callback_data: "cancel" }],
        ],
      };

  if (existingState.collectingMessageId) {
    const lastTracks = batch.slice(-3).map((t) => `  - ${t.originalFilename}`).join("\n");

    await editMessageText(chatId, existingState.collectingMessageId,
      `Получено <b>${count}</b> ${getTrackWord(count)}.` +
      (targetPlaylistId ? ` → <b>${targetPlaylistName}</b>` : "") +
      `\n\nПоследние:\n${lastTracks}\n\nОтправьте ещё или нажмите кнопку, чтобы добавить.`,
      { parseMode: "HTML", replyMarkup: collectingKeyboard }
    );
  } else {
    await sendTelegramMessage(chatId, `Получено <b>${count}</b> ${getTrackWord(count)}. Отправьте ещё или нажмите кнопку.`, { parseMode: "HTML" });
  }
}

/* ================================================================== */
/*  Finish batch collection — show playlist picker                     */
/* ================================================================== */

async function handleFinishBatchCollection(chatId: string, chatState: ChatState) {
  const batch = chatState.audioBatch || [];
  if (batch.length === 0) {
    await clearChatState(chatId);
    return;
  }

  // If a target playlist is active (e.g. user has it open), import directly
  // there — skip the picker entirely.
  const targetPlaylistId = chatState.activePlaylistId;
  if (targetPlaylistId) {
    const user = await findUserByChatId(chatId);
    if (user) {
      const pl = await findPlaylistById(targetPlaylistId);
      if (pl && pl.userId === user.id) {
        // Edit the collecting message to "Adding..." before importing
        if (chatState.collectingMessageId) {
          try {
            await editMessageText(chatId, chatState.collectingMessageId,
              `Добавляю ${batch.length} ${getTrackWord(batch.length)} в <b>${pl.name}</b>...`,
              { parseMode: "HTML" }
            );
          } catch {}
        }
        // Preserve activePlaylistId so user can keep adding more after import
        await setChatState(
          chatId,
          "idle",
          { fileUrl: null, fileDuration: 0, originalFilename: "" },
          undefined,
          undefined,
          undefined,
          { activePlaylistId: targetPlaylistId, viewPage: chatState.viewPage },
        );
        await handleBatchImportToPlaylist(chatId, chatState.collectingMessageId || 0, targetPlaylistId, batch);
        return;
      }
    }
    // Target invalid — fall through to picker
  }

  const result = await getUserPlaylistsOrCreate(chatId);
  if (!result) {
    await clearChatState(chatId);
    return;
  }

  const count = batch.length;
  const totalDuration = batch.reduce((s, t) => s + t.fileDuration, 0);

  // Transition to awaiting_import_playlist with batch data (preserve target if any)
  await setChatState(
    chatId,
    "awaiting_import_playlist",
    chatState.data,
    undefined,
    batch,
    undefined,
    { activePlaylistId: targetPlaylistId, viewPage: chatState.viewPage },
  );

  // Send fresh message with playlist picker (since we can't reliably edit with new keyboard type)
  const msgText =
    `<b>${count}</b> ${getTrackWord(count)} (${formatDuration(totalDuration)}) готово к добавлению.\n\n` +
    `В какой плейлист добавить?`;

  // Delete old collecting message if exists
  if (chatState.collectingMessageId) {
    try {
      // Telegram doesn't have a deleteMessage in our lib, so just edit it
      await editMessageText(chatId, chatState.collectingMessageId, "Выбираем плейлист...");
    } catch {}
  }

  await sendTelegramMessage(chatId, msgText, {
    parseMode: "HTML",
    replyMarkup: buildPlaylistKeyboard(result.playlists, "import_playlist"),
  });
}

/* ================================================================== */
/*  Batch import to playlist (save multiple tracks)                    */
/* ================================================================== */

async function handleBatchImportToPlaylist(chatId: string, messageId: number, playlistId: string, batch: AudioBatchItem[]) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  const playlist = await findPlaylistById(playlistId);
  if (!playlist || playlist.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }

  const existingTitles = new Set(tracks.map((t: any) => `${t.title}|||${t.artist}`));
  const added: string[] = [];
  const skipped: string[] = [];

  for (const item of batch) {
    const parts = item.originalFilename.includes(" — ")
      ? item.originalFilename.split(" — ") : [item.originalFilename];
    const trackTitle = (parts[0] || "").trim();
    const trackArtist = (parts[1] || "").trim() || "Неизвестный";

    const key = `${trackTitle}|||${trackArtist}`;
    if (existingTitles.has(key)) {
      skipped.push(trackTitle);
      continue;
    }
    existingTitles.add(key);

    const proxyAudioUrl = `${getSiteOrigin()}/api/telegram/audio-proxy?fileId=${encodeURIComponent(item.fileId || "")}`;

    tracks.push({
      id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: trackTitle,
      artist: trackArtist,
      album: "",
      duration: item.fileDuration,
      cover: "",
      genre: "",
      audioUrl: proxyAudioUrl,
      previewUrl: "",
      source: "telegram",
      telegramFileId: item.fileId,
      scTrackId: null,
      scStreamPolicy: "ALLOW",
      scIsFull: true,
    });
    added.push(`${trackTitle} — ${trackArtist}`);
  }

  if (added.length === 0) {
    await sendTelegramMessage(chatId, `Все ${batch.length} ${getTrackWord(batch.length)} уже есть в плейлисте "${playlist.name}".`);
    return;
  }

  await updatePlaylistTracks(playlistId, JSON.stringify(tracks));

  let resultText = `В <b>${playlist.name}</b> добавлено <b>${added.length}</b> ${getTrackWord(added.length)}:\n`;
  for (const t of added.slice(0, 5)) resultText += `+ ${t}\n`;
  if (added.length > 5) resultText += `... и ещё ${added.length - 5}\n`;
  if (skipped.length > 0) resultText += `\nПропущено (уже есть): ${skipped.length}`;
  resultText += `\n\nВсего треков: ${tracks.length}`;

  await sendTelegramMessage(chatId, resultText, { parseMode: "HTML" });
}

/* ================================================================== */
/*  Import with custom title                                          */
/* ================================================================== */

async function handleImportWithTitle(chatId: string, customTitle: string, data: PendingImport) {
  const result = await getUserPlaylistsOrCreate(chatId);
  if (!result) return;

  await setChatState(chatId, "awaiting_import_playlist", { ...data, originalFilename: customTitle });
  await sendTelegramMessage(chatId,
    `Название: <b>${customTitle}</b>\n\nВ какой плейлист добавить?`,
    { parseMode: "HTML", replyMarkup: buildPlaylistKeyboard(result.playlists, "import_playlist") }
  );
}

/* ================================================================== */
/*  Import to playlist (save track)                                   */
/* ================================================================== */

async function handleImportToPlaylist(chatId: string, playlistId: string, data: PendingImport) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  const playlist = await findPlaylistById(playlistId);
  if (!playlist || playlist.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }

  const parts = data.originalFilename.includes(" — ")
    ? data.originalFilename.split(" — ") : [data.originalFilename];
  const trackTitle = (parts[0] || "").trim();
  const trackArtist = (parts[1] || "").trim() || "Неизвестный";

  const proxyAudioUrl = `${getSiteOrigin()}/api/telegram/audio-proxy?fileId=${encodeURIComponent(data.fileId || "")}`;

  const newTrack = {
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: trackTitle,
    artist: trackArtist,
    album: "",
    duration: data.fileDuration,
    cover: "",
    genre: "",
    audioUrl: proxyAudioUrl,
    previewUrl: "",
    source: "telegram",
    telegramFileId: data.fileId,
    scTrackId: null,
    scStreamPolicy: "ALLOW",
    scIsFull: true,
  };

  const exists = tracks.some((t: any) => t.title === trackTitle && t.artist === trackArtist);
  if (exists) {
    await sendTelegramMessage(chatId, `Трек "${trackTitle} — ${trackArtist}" уже есть в плейлисте "${playlist.name}".`);
    return;
  }

  tracks.push(newTrack);
  await updatePlaylistTracks(playlistId, JSON.stringify(tracks));

  await sendTelegramMessage(chatId,
    `Трек добавлен в <b>${playlist.name}</b>:\n${trackTitle} — ${trackArtist} (${formatDuration(data.fileDuration)})\n\nВсего треков: ${tracks.length}\nТрек доступен для воспроизведения на сайте.`,
    { parseMode: "HTML" }
  );
}

/* ================================================================== */
/*  SoundCloud search                                                 */
/* ================================================================== */

async function handleSearch(chatId: string, query: string) {
  // Fire typing indicator + initial "searching" message IN PARALLEL — user
  // sees feedback within 200ms instead of waiting 3-5s for SC API response.
  // The typing indicator auto-expires after 5s, so we re-send it below if
  // SC search takes longer.
  await Promise.all([
    sendChatAction(chatId, "typing"),
    sendTelegramMessage(chatId, `Ищу: <i>${query}</i>...`, { parseMode: "HTML" }),
  ]);

  // Start a 4s interval to keep the typing indicator alive during long searches.
  // Cleared when the results message is sent.
  const typingInterval = setInterval(() => {
    sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);

  try {
    const results = await searchSCTracks(query, 15);
    if (results.length === 0) {
      await sendTelegramMessage(chatId, "Ничего не найдено. Попробуйте другой запрос.");
      return;
    }

    // Preserve activePlaylistId so "+ Сюда" button works if user has a playlist open
    const existingState = await getChatState(chatId);
    const activePlaylistId = existingState?.activePlaylistId;

    // Store search results in DB state
    await setChatState(
      chatId,
      "idle",
      { fileUrl: null, fileDuration: 0, originalFilename: "" },
      results,
      undefined,
      undefined,
      { activePlaylistId, viewPage: 0 },
    );

    // Build keyboard with preview + add buttons per track
    const perPage = 5;
    const items = results.slice(0, perPage);
    const rows: Array<Array<{ text: string; callback_data: string }>> = items.map((t: any, i: number) => [
      { text: `▶ ${t.title} — ${t.artist}`, callback_data: `preview:${i}` },
      { text: activePlaylistId ? "+ Сюда" : "+ Добавить", callback_data: `add_search:${i}` },
    ]);
    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (results.length > perPage) navRow.push({ text: "Далее >", callback_data: "search_page:1" });
    if (navRow.length > 0) rows.push(navRow);
    rows.push([{ text: "Отмена", callback_data: "cancel" }]);

    await sendTelegramMessage(chatId,
      `Найдено ${results.length} треков по запросу "${query}":\n\n` +
      (activePlaylistId ? `💡 Активный плейлист — кнопка «+ Сюда» добавит сразу туда.\n\n` : "") +
      `Нажмите ▶ для прослушивания, или + для добавления в плейлист.`,
      { parseMode: "HTML", replyMarkup: { inline_keyboard: rows } }
    );
  } finally {
    clearInterval(typingInterval);
  }
}

/* ================================================================== */
/*  Add SoundCloud search result to playlist                          */
/* ================================================================== */

async function handleAddSearchTrackToPlaylist(chatId: string, playlistId: string, data: PendingImport) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  const playlist = await findPlaylistById(playlistId);
  if (!playlist || playlist.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }

  const scTrack = data.scData;
  if (!scTrack) { await sendTelegramMessage(chatId, "Ошибка: трек не найден."); return; }

  const exists = tracks.some((t: any) => t.scTrackId === scTrack.scTrackId);
  if (exists) {
    await sendTelegramMessage(chatId, `Трек "${scTrack.title}" уже есть в плейлисте "${playlist.name}".`);
    return;
  }

  tracks.push(scTrack);
  await updatePlaylistTracks(playlistId, JSON.stringify(tracks));

  // Persist the track ID so the Like button (if pressed) can find it.
  // The track object stored in the playlist uses its own id field; we keep
  // a reference by storing it in chat state under scData.
  const trackId = String(scTrack.id || (scTrack.scTrackId ? `sc_${scTrack.scTrackId}` : `pl_${playlistId}_${tracks.length - 1}`));

  // Ensure scTrack has an id so handleLikePlaylistTrack can find it later
  if (!scTrack.id) scTrack.id = trackId;
  await updatePlaylistTracks(playlistId, JSON.stringify(tracks));

  const likeKeyboard = {
    inline_keyboard: [
      [
        { text: "🤍 Лайкнуть", callback_data: `like_added:${trackId}` },
        { text: "▶ Слушать", callback_data: `play_added:${playlistId}:${tracks.length - 1}` },
      ],
      [{ text: "К плейлисту", callback_data: `view_playlist:${playlistId}` }],
    ],
  };

  await sendTelegramMessage(chatId,
    `✅ Трек добавлен в <b>${playlist.name}</b>:\n${scTrack.title} — ${scTrack.artist}\n\nВсего треков: ${tracks.length}`,
    { parseMode: "HTML", replyMarkup: likeKeyboard }
  );
}

/* ================================================================== */
/*  List playlists                                                    */
/* ================================================================== */

async function handlePlaylists(chatId: string, messageId?: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    if (messageId) {
      await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code");
    } else {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
    }
    return;
  }

  // M3/M2: use shared getUserPlaylists helper (returns PlaylistSummary with
  // id/name/trackCount). For the playlist-list command we only need name +
  // track count — no description or createdAt, so the helper is enough.
  let playlists = await getUserPlaylists(user.id);

  // Auto-create "Избранное" if no playlists exist
  if (playlists.length === 0) {
    await createPlaylist(user.id, "Избранное", "[]");
    playlists = await getUserPlaylists(user.id);
  }

  const lines = playlists.map((pl, i) => {
    return `<b>${i + 1}.</b> ${pl.name} — ${pl.trackCount} треков`;
  });

  const markup = buildPlaylistListKeyboard(playlists);

  const text = `♫ <b>Ваши плейлисты</b> (${playlists.length}):\n\n${lines.join("\n")}\n\n` +
    `Нажмите на плейлист, чтобы открыть его треки.\n✏ — переименовать · 🗑 — удалить`;

  // Edit existing message (from button press) or send new (from /playlists command)
  if (messageId) {
    await editMessageText(chatId, messageId, text, { parseMode: "HTML", replyMarkup: markup });
  } else {
    await sendTelegramMessage(chatId, text, { parseMode: "HTML", replyMarkup: markup });
  }
}

/* ================================================================== */
/*  Create new playlist                                               */
/* ================================================================== */

async function handleNewPlaylist(chatId: string, name: string) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  if (name.length > 200) {
    await sendTelegramMessage(chatId, "Название слишком длинное (максимум 200 символов).");
    return;
  }

  const existing = await findPlaylistByUserAndName(user.id, name);
  if (existing) {
    await sendTelegramMessage(chatId, `Плейлист "${name.trim()}" уже существует.`);
    return;
  }

  await createPlaylist(user.id, name.trim(), "[]");

  await sendTelegramMessage(chatId,
    `Плейлист <b>${name.trim()}</b> создан!\nОн также доступен на сайте в вашем аккаунте.\n\nТеперь вы можете:\n` +
    `• Отправить аудио боту для импорта\n• Использовать /search для поиска треков\n• Открыть /playlists для просмотра всех плейлистов`,
    { parseMode: "HTML" }
  );
}

/* ------------------------------------------------------------------ */
/*  Utility                                                           */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTrackWord(count: number): string {
  if (count === 1) return "трек";
  if (count >= 2 && count <= 4) return "трека";
  return "треков";
}

/* ================================================================== */
/*  Likes view — /likes                                               */
/* ================================================================== */

async function handleLikes(chatId: string, messageId?: number, page: number = 0) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    const txt = "Сначала авторизуйтесь — отправьте /code";
    if (messageId) await editMessageText(chatId, messageId, txt);
    else await sendTelegramMessage(chatId, txt);
    return;
  }

  const { tracks } = await getUserLikes(user.id);
  if (tracks.length === 0) {
    const txt = "❤️ <b>У вас пока нет лайкнутых треков.</b>\n\n" +
      "Чтобы лайкнуть трек:\n" +
      "• Используйте /search и нажмите 🤍 в результатах\n" +
      "• Откройте плейлист и нажмите 🤍 у любого трека\n\n" +
      "Лайки синхронизируются с сайтом — появятся в разделе «Избранное».";
    if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML" });
    else await sendTelegramMessage(chatId, txt, { parseMode: "HTML" });
    return;
  }

  const pageSize = 5;
  const totalPages = Math.ceil(tracks.length / pageSize);
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  // Newest first for likes
  const sortedTracks = [...tracks].reverse();
  const markup = buildLikesKeyboard(sortedTracks, safePage, pageSize);

  const start = safePage * pageSize;
  const end = start + pageSize;
  const items = sortedTracks.slice(start, end);

  const lines = items.map((t, i) => {
    const dur = t.duration ? ` (${formatDuration(t.duration)})` : "";
    return `<b>${start + i + 1}.</b> ${t.title} — ${t.artist}${dur}`;
  }).join("\n");

  const txt = `❤️ <b>Ваши лайки</b> (${tracks.length}):\n\n${lines}` +
    (totalPages > 1 ? `\n\nСтраница ${safePage + 1} из ${totalPages}` : "");

  if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
  else await sendTelegramMessage(chatId, txt, { parseMode: "HTML", replyMarkup: markup });
}

/* ================================================================== */
/*  Recent history — /recent                                          */
/* ================================================================== */

async function handleRecent(chatId: string, messageId?: number, page: number = 0) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    const txt = "Сначала авторизуйтесь — отправьте /code";
    if (messageId) await editMessageText(chatId, messageId, txt);
    else await sendTelegramMessage(chatId, txt);
    return;
  }

  const tracks = await getUserHistory(user.id, 50);
  if (tracks.length === 0) {
    const txt = "🕑 <b>История пуста.</b>\n\n" +
      "Слушайте треки на сайте или через бота — они появятся здесь.\n" +
      "История синхронизируется с сайтом.";
    if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML" });
    else await sendTelegramMessage(chatId, txt, { parseMode: "HTML" });
    return;
  }

  const pageSize = 5;
  const totalPages = Math.ceil(tracks.length / pageSize);
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const markup = buildHistoryKeyboard(tracks, safePage, pageSize);

  const start = safePage * pageSize;
  const end = start + pageSize;
  const items = tracks.slice(start, end);

  const lines = items.map((t, i) => {
    const dur = t.duration ? ` (${formatDuration(t.duration)})` : "";
    return `<b>${start + i + 1}.</b> ${t.title} — ${t.artist}${dur}`;
  }).join("\n");

  const txt = `🕑 <b>Недавние треки</b> (последние ${tracks.length}):\n\n${lines}` +
    (totalPages > 1 ? `\n\nСтраница ${safePage + 1} из ${totalPages}` : "");

  if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
  else await sendTelegramMessage(chatId, txt, { parseMode: "HTML", replyMarkup: markup });
}

/* ================================================================== */
/*  Stats view — /stats                                               */
/* ================================================================== */

async function handleStats(chatId: string, messageId?: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    const txt = "Сначала авторизуйтесь — отправьте /code";
    if (messageId) await editMessageText(chatId, messageId, txt);
    else await sendTelegramMessage(chatId, txt);
    return;
  }

  // Parallel data fetch
  const [playlists, likes, history] = await Promise.all([
    getUserPlaylists(user.id),
    getUserLikes(user.id),
    getUserHistory(user.id, 100),
  ]);

  const totalTracks = playlists.reduce((sum, pl) => sum + pl.trackCount, 0);
  const totalLikes = likes.ids.length;
  const totalHistory = history.length;
  const totalPlaylists = playlists.length;

  // Find most-listened artist from history
  const artistCount = new Map<string, number>();
  for (const t of history) {
    if (!t.artist) continue;
    artistCount.set(t.artist, (artistCount.get(t.artist) || 0) + 1);
  }
  const topArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  let txt = `📊 <b>Ваша статистика mq</b>\n\n` +
    `📂 Плейлистов: <b>${totalPlaylists}</b>\n` +
    `🎵 Треков в плейлистах: <b>${totalTracks}</b>\n` +
    `❤️ Лайкнутых треков: <b>${totalLikes}</b>\n` +
    `🕑 Прослушано за всё время: <b>${totalHistory}</b>\n`;

  if (topArtists.length > 0) {
    txt += `\n<b>Топ исполнители:</b>\n`;
    topArtists.forEach(([artist, count], i) => {
      txt += `${i + 1}. ${artist} — ${count} ${getTrackWord(count)}\n`;
    });
  }

  if (playlists.length > 0) {
    const biggest = [...playlists].sort((a, b) => b.trackCount - a.trackCount)[0];
    txt += `\n📦 Самый большой плейлист: <b>${biggest.name}</b> (${biggest.trackCount} ${getTrackWord(biggest.trackCount)})\n`;
  }

  txt += `\n📂 <a href="${getSiteOrigin()}">Открыть на сайте</a>`;

  if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML" });
  else await sendTelegramMessage(chatId, txt, { parseMode: "HTML" });
}

/* ================================================================== */
/*  View playlist tracks (with pagination)                            */
/* ================================================================== */

async function handleViewPlaylist(chatId: string, messageId: number, playlistId: string, page: number) {
  const user = await findUserByChatId(chatId);
  if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — /code"); return; }
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) {
    await editMessageText(chatId, messageId, "Плейлист не найден.");
    return;
  }

  // Persist the "open playlist" so subsequent audio uploads land here automatically.
  // State is auto-expired after 15 min of inactivity (see getChatState).
  await setChatState(
    chatId,
    "idle",
    { fileUrl: null, fileDuration: 0, originalFilename: "" },
    undefined,
    undefined,
    undefined,
    { activePlaylistId: playlistId, viewPage: page },
  );

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const markup = buildPlaylistTracksKeyboard(pl, safePage, pageSize);
  const start = safePage * pageSize;
  const end = start + pageSize;
  const items = tracks.slice(start, end);

  const lines = items.map((t: any, i: number) => {
    const dur = t.duration ? ` (${formatDuration(t.duration)})` : "";
    return `<b>${start + i + 1}.</b> ${t.title || "Без названия"} — ${t.artist || "Неизвестный"}${dur}`;
  }).join("\n");

  const visibility = pl.isPublic ? "🌐 публичный" : "🔒 приватный";

  const txt = `📂 <b>${pl.name}</b>\n` +
    `${tracks.length} ${getTrackWord(tracks.length)} · ${visibility}` +
    (totalPages > 1 ? ` · стр. ${safePage + 1}/${totalPages}` : "") +
    `\n\n${lines || "<i>В плейлисте нет треков</i>"}` +
    `\n\n<i>💡 Отправьте аудио — оно добавится в этот плейлист.</i>`;

  await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
}

/* ================================================================== */
/*  Toggle playlist public/private                                    */
/* ================================================================== */

async function togglePlaylistPublic(playlistId: string, isPublic: boolean): Promise<void> {
  if (isTurso()) {
    const t = getTursoClient();
    await t.execute({
      sql: "UPDATE Playlist SET isPublic = ?, updatedAt = ? WHERE id = ?",
      args: [isPublic ? 1 : 0, new Date().toISOString(), playlistId],
    });
    return;
  }
  const { db } = await import("@/lib/db");
  await db.playlist.update({ where: { id: playlistId }, data: { isPublic } });
}

/* ================================================================== */
/*  Rename playlist                                                   */
/* ================================================================== */

async function handleRenamePlaylist(chatId: string, playlistId: string, newName: string) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  const trimmed = newName.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    await sendTelegramMessage(chatId, "Название должно быть 1–200 символов.");
    return;
  }
  if (trimmed === pl.name) {
    await sendTelegramMessage(chatId, "Название не изменилось.");
    return;
  }
  // Check name conflict
  const conflict = await findPlaylistByUserAndName(user.id, trimmed);
  if (conflict && conflict.id !== playlistId) {
    await sendTelegramMessage(chatId, `У вас уже есть плейлист с названием "${trimmed}".`);
    return;
  }

  if (isTurso()) {
    const t = getTursoClient();
    await t.execute({
      sql: "UPDATE Playlist SET name = ?, updatedAt = ? WHERE id = ?",
      args: [trimmed, new Date().toISOString(), playlistId],
    });
  } else {
    const { db } = await import("@/lib/db");
    await db.playlist.update({ where: { id: playlistId }, data: { name: trimmed } });
  }

  await sendTelegramMessage(chatId,
    `Плейлист переименован:\n<b>${pl.name}</b> → <b>${trimmed}</b>`,
    { parseMode: "HTML" }
  );
}

/* ================================================================== */
/*  Remove track from playlist                                        */
/* ================================================================== */

async function handleRemoveTrackFromPlaylist(chatId: string, messageId: number, playlistId: string, trackIdx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) {
    await editMessageText(chatId, messageId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }

  if (trackIdx < 0 || trackIdx >= tracks.length) {
    await editMessageText(chatId, messageId, "Трек не найден.");
    return;
  }

  const removed = tracks[trackIdx];
  tracks.splice(trackIdx, 1);
  await updatePlaylistTracks(playlistId, JSON.stringify(tracks));

  // Re-fetch updated playlist for the keyboard
  const updated = await findPlaylistById(playlistId);
  if (updated) {
    // Adjust page if we removed the last item on a non-first page
    const pageSize = 5;
    const newTotalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
    const currentPage = Math.min(Math.floor(trackIdx / pageSize), newTotalPages - 1);
    await handleViewPlaylist(chatId, messageId, playlistId, currentPage);
  } else {
    await editMessageText(chatId, messageId, `Трек "${removed?.title}" удалён из плейлиста.`);
  }

  // Notify via separate message
  await sendTelegramMessage(chatId,
    `Трек <b>${removed?.title || ""}</b> удалён из плейлиста.`,
    { parseMode: "HTML" }
  ).catch(() => {});
}

/* ================================================================== */
/*  Play track from playlist (send audio or open webapp link)         */
/* ================================================================== */

async function handlePlayPlaylistTrack(chatId: string, messageId: number, playlistId: string, trackIdx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) {
    await editMessageText(chatId, messageId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }
  const track = tracks[trackIdx];
  if (!track) {
    await editMessageText(chatId, messageId, "Трек не найден.");
    return;
  }

  // Try to send audio
  if (track.audioUrl) {
    await editMessageText(chatId, messageId, `▶ Воспроизвожу: <b>${track.title}</b> — ${track.artist}`, { parseMode: "HTML" });
    const result = await sendTelegramAudio(chatId, track.audioUrl, {
      title: track.title,
      performer: track.artist,
      duration: track.duration,
      caption: `🎵 ${track.title} — ${track.artist}`,
    });
    if (result.ok) return;
  }

  // Fallback: webapp link
  const origin = getSiteOrigin();
  const trackParam = track.scTrackId ? `sc_${track.scTrackId}` : (track.id || "");
  const url = `${origin}/?track=${encodeURIComponent(trackParam)}`;
  await editMessageText(chatId, messageId,
    `▶ <b>${track.title}</b> — ${track.artist}\n\nНе удалось отправить аудио напрямую.\n<a href="${url}">Открыть на сайте</a>`,
    { parseMode: "HTML", disablePreview: true }
  );
}

/* ================================================================== */
/*  Like track from playlist                                          */
/* ================================================================== */

async function handleLikePlaylistTrack(chatId: string, messageId: number, playlistId: string, trackIdx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) return;

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }
  const track = tracks[trackIdx];
  if (!track) return;

  const trackId = String(track.id || `pl_${playlistId}_${trackIdx}`);
  const result = await addUserLike(user.id, {
    id: trackId,
    title: track.title || "Без названия",
    artist: track.artist || "Неизвестный",
    duration: track.duration,
    cover: track.cover,
    scTrackId: track.scTrackId || null,
    source: track.source || "playlist",
    audioUrl: track.audioUrl,
  });

  await editMessageText(chatId, messageId,
    result.added
      ? `❤️ <b>Добавлено в лайки!</b>\n\n${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`
      : `Уже в лайках: ${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`,
    { parseMode: "HTML" }
  );
}

/**
 * Unlike a track from the playlist track-info view.
 * Re-renders the track-info view with updated like state.
 */
async function handleUnlikePlaylistTrack(chatId: string, messageId: number, playlistId: string, trackIdx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) return;

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }
  const track = tracks[trackIdx];
  if (!track) return;

  const trackId = String(track.id || `pl_${playlistId}_${trackIdx}`);
  const res = await removeUserLike(user.id, trackId);

  await editMessageText(chatId, messageId,
    `💔 <b>Убран из лайков.</b>\n\n${track.title} — ${track.artist}\n\nВсего лайков: ${res.total}`,
    { parseMode: "HTML" }
  );
}

/* ================================================================== */
/*  Track info from playlist (show details + actions)                 */
/* ================================================================== */

async function handleTrackInfoFromPlaylist(chatId: string, messageId: number, playlistId: string, trackIdx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const pl = await findPlaylistById(playlistId);
  if (!pl || pl.userId !== user.id) return;

  let tracks: any[] = [];
  try { tracks = JSON.parse(pl.tracksJson || "[]"); } catch { tracks = []; }
  const track = tracks[trackIdx];
  if (!track) return;

  // Check like state
  const likes = await getUserLikes(user.id);
  const trackId = String(track.id || `pl_${playlistId}_${trackIdx}`);
  const isLiked = likes.ids.includes(trackId);

  const dur = track.duration ? `${formatDuration(track.duration)}` : "—";
  const txt = `🎵 <b>${track.title || "Без названия"}</b>\n` +
    `Исполнитель: ${track.artist || "Неизвестный"}\n` +
    `Длительность: ${dur}\n` +
    `Источник: ${track.source || "—"}\n` +
    `Статус: ${isLiked ? "❤️ в лайках" : "🤍 не лайкнут"}`;

  const markup = {
    inline_keyboard: [
      [
        { text: "▶ Слушать", callback_data: `play_pl_track:${playlistId}:${trackIdx}` },
        { text: isLiked ? "💔 Убрать лайк" : "🤍 Лайк", callback_data: isLiked ? `unlike_pl:${playlistId}:${trackIdx}` : `like_pl_track:${playlistId}:${trackIdx}` },
      ],
      [{ text: "🗑 Убрать из плейлиста", callback_data: `remove_pl_track:${playlistId}:${trackIdx}` }],
      [{ text: "« Назад к плейлисту", callback_data: `view_playlist:${playlistId}` }],
    ],
  };

  await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
}

/* ================================================================== */
/*  Like/unlike track from search results                             */
/* ================================================================== */

async function handleLikeSearchTrack(chatId: string, messageId: number, idx: number, isUnlike: boolean) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const state = await getChatState(chatId);
  if (!state?.searchResults?.length) {
    await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
    return;
  }
  const track = state.searchResults[idx];
  if (!track) return;

  const trackId = String(track.scTrackId ? `sc_${track.scTrackId}` : `tg_${track.id || idx}`);

  if (isUnlike) {
    const res = await removeUserLike(user.id, trackId);
    await editMessageText(chatId, messageId,
      `💔 Убран из лайков: ${track.title} — ${track.artist}\n\nВсего лайков: ${res.total}`,
      { parseMode: "HTML", replyMarkup: buildPreviewKeyboard(idx, false) }
    );
    return;
  }

  const result = await addUserLike(user.id, {
    id: trackId,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    cover: track.cover,
    scTrackId: track.scTrackId || null,
    source: "soundcloud",
  });

  await editMessageText(chatId, messageId,
    result.added
      ? `❤️ <b>Добавлено в лайки!</b>\n\n${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`
      : `Уже в лайках: ${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`,
    { parseMode: "HTML", replyMarkup: buildPreviewKeyboard(idx, true) }
  );
}

/* ================================================================== */
/*  Likes actions: unlike by index, track info, play                  */
/* ================================================================== */

async function handleUnlikeByIndex(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const { tracks } = await getUserLikes(user.id);
  const sorted = [...tracks].reverse();
  const track = sorted[idx];
  if (!track) return;

  const res = await removeUserLike(user.id, track.id);
  // Show updated likes view (previous page if we removed the last item on a page)
  const pageSize = 5;
  const newTotalPages = Math.max(1, Math.ceil(res.total / pageSize));
  const currentPage = Math.min(Math.floor(idx / pageSize), newTotalPages - 1);
  await handleLikes(chatId, messageId, currentPage);
}

async function handleTrackInfoFromLikes(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const { tracks } = await getUserLikes(user.id);
  const sorted = [...tracks].reverse();
  const track = sorted[idx];
  if (!track) return;

  const dur = track.duration ? formatDuration(track.duration) : "—";
  const likedAt = track.likedAt ? new Date(track.likedAt).toLocaleString("ru-RU") : "—";

  const txt = `❤️ <b>${track.title}</b>\n` +
    `Исполнитель: ${track.artist}\n` +
    `Длительность: ${dur}\n` +
    `Источник: ${track.source || "—"}\n` +
    `Лайкнут: ${likedAt}`;

  const markup = {
    inline_keyboard: [
      [
        { text: "▶ Слушать", callback_data: `play_like_track:${idx}` },
        { text: "💔 Убрать лайк", callback_data: `unlike:${idx}` },
      ],
      [{ text: "« Назад к лайкам", callback_data: "cmd_likes" }],
    ],
  };

  await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
}

async function handlePlayLikedTrack(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const { tracks } = await getUserLikes(user.id);
  const sorted = [...tracks].reverse();
  const track = sorted[idx];
  if (!track) return;

  // Try to send audio
  if (track.audioUrl) {
    await editMessageText(chatId, messageId, `▶ Воспроизвожу: <b>${track.title}</b> — ${track.artist}`, { parseMode: "HTML" });
    const result = await sendTelegramAudio(chatId, track.audioUrl, {
      title: track.title,
      performer: track.artist,
      duration: track.duration,
      caption: `🎵 ${track.title} — ${track.artist}`,
    });
    if (result.ok) return;
  }

  // Try SoundCloud resolution if we have scTrackId
  if (track.scTrackId) {
    const audioUrl = await resolveSCStreamUrl(track.scTrackId);
    if (audioUrl) {
      await editMessageText(chatId, messageId, `▶ Воспроизвожу: <b>${track.title}</b> — ${track.artist}`, { parseMode: "HTML" });
      const result = await sendTelegramAudio(chatId, audioUrl, {
        title: track.title,
        performer: track.artist,
        duration: track.duration,
        caption: `🎵 ${track.title} — ${track.artist}`,
      });
      if (result.ok) return;
    }
  }

  // Fallback: webapp link
  const origin = getSiteOrigin();
  const url = track.scTrackId ? `${origin}/?track=sc_${track.scTrackId}` : origin;
  await editMessageText(chatId, messageId,
    `▶ <b>${track.title}</b> — ${track.artist}\n\nНе удалось отправить аудио.\n<a href="${url}">Открыть на сайте</a>`,
    { parseMode: "HTML", disablePreview: true }
  );
}

/* ================================================================== */
/*  History actions: play, like, add to playlist                      */
/* ================================================================== */

async function handlePlayHistoryTrack(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const tracks = await getUserHistory(user.id, 50);
  const track = tracks[idx];
  if (!track) return;

  if (track.audioUrl) {
    await editMessageText(chatId, messageId, `▶ Воспроизвожу: <b>${track.title}</b> — ${track.artist}`, { parseMode: "HTML" });
    const result = await sendTelegramAudio(chatId, track.audioUrl, {
      title: track.title,
      performer: track.artist,
      duration: track.duration,
      caption: `🎵 ${track.title} — ${track.artist}`,
    });
    if (result.ok) return;
  }

  if (track.scTrackId) {
    const audioUrl = await resolveSCStreamUrl(track.scTrackId);
    if (audioUrl) {
      await editMessageText(chatId, messageId, `▶ Воспроизвожу: <b>${track.title}</b> — ${track.artist}`, { parseMode: "HTML" });
      const result = await sendTelegramAudio(chatId, audioUrl, {
        title: track.title,
        performer: track.artist,
        duration: track.duration,
        caption: `🎵 ${track.title} — ${track.artist}`,
      });
      if (result.ok) return;
    }
  }

  const origin = getSiteOrigin();
  const url = track.scTrackId ? `${origin}/?track=sc_${track.scTrackId}` : origin;
  await editMessageText(chatId, messageId,
    `▶ <b>${track.title}</b> — ${track.artist}\n\nНе удалось отправить аудио.\n<a href="${url}">Открыть на сайте</a>`,
    { parseMode: "HTML", disablePreview: true }
  );
}

async function handleLikeHistoryTrack(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const tracks = await getUserHistory(user.id, 50);
  const track = tracks[idx];
  if (!track) return;

  const trackId = String(track.id || `hist_${idx}`);
  const result = await addUserLike(user.id, {
    id: trackId,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    cover: track.cover,
    scTrackId: track.scTrackId || null,
    source: track.source || "history",
    audioUrl: track.audioUrl,
  });

  await editMessageText(chatId, messageId,
    result.added
      ? `❤️ <b>Добавлено в лайки!</b>\n\n${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`
      : `Уже в лайках: ${track.title} — ${track.artist}\n\nВсего лайков: ${result.total}`,
    { parseMode: "HTML" }
  );
}

async function handleAddHistoryToPlaylist(chatId: string, messageId: number, idx: number) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const tracks = await getUserHistory(user.id, 50);
  const track = tracks[idx];
  if (!track) return;

  const result = await getUserPlaylistsOrCreate(chatId);
  if (!result) return;

  // Set up state so that the playlist picker callback can complete the add
  const trackId = String(track.id || `hist_${idx}`);
  await setChatState(chatId, "awaiting_add_to_playlist", {
    fileUrl: null,
    fileDuration: track.duration || 0,
    originalFilename: `${track.title} — ${track.artist}`,
    scTrackId: track.scTrackId || undefined,
    scData: {
      id: trackId,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      cover: track.cover || "",
      scTrackId: track.scTrackId || null,
      source: track.source || "history",
      audioUrl: track.audioUrl || "",
    } as any,
  });

  await editMessageText(chatId, messageId,
    `Выбран трек: <b>${track.title}</b> — ${track.artist}\n\nВ какой плейлист добавить?`,
    { parseMode: "HTML", replyMarkup: buildPlaylistKeyboard(result.playlists, "add_search_pl") }
  );
}

/* ================================================================== */
/*  Like a track that was just added to a playlist                    */
/* ================================================================== */

/**
 * Handle "Like" press from the post-add confirmation message.
 * We only have a trackId — find the track in any of the user's playlists
 * (it should be in the most recently updated one).
 */
async function handleLikeAddedTrack(chatId: string, messageId: number, trackId: string) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  // Find the track in any playlist (newest-first)
  const playlists = await getUserPlaylists(user.id);
  let foundTrack: LikeEntry | null = null;
  for (const pl of playlists) {
    const full = await findPlaylistById(pl.id);
    if (!full) continue;
    let tracks: any[] = [];
    try { tracks = JSON.parse(full.tracksJson || "[]"); } catch { tracks = []; }
    const match = tracks.find((t: any) => String(t.id || (t.scTrackId ? `sc_${t.scTrackId}` : "")) === trackId);
    if (match) {
      foundTrack = {
        id: trackId,
        title: match.title || "Без названия",
        artist: match.artist || "Неизвестный",
        duration: match.duration,
        cover: match.cover,
        scTrackId: match.scTrackId || null,
        source: match.source || "playlist",
        audioUrl: match.audioUrl,
      };
      break;
    }
  }

  if (!foundTrack) {
    await editMessageText(chatId, messageId, "Трек не найден. Возможно, он был удалён из плейлиста.");
    return;
  }

  const result = await addUserLike(user.id, foundTrack);
  await editMessageText(chatId, messageId,
    result.added
      ? `❤️ <b>В лайках!</b>\n\n${foundTrack.title} — ${foundTrack.artist}\n\nВсего лайков: ${result.total}`
      : `Уже в лайках: ${foundTrack.title} — ${foundTrack.artist}\n\nВсего лайков: ${result.total}`,
    { parseMode: "HTML" }
  );
}

/* ================================================================== */
/*  Recommendations — /recs                                           */
/* ================================================================== */

async function handleRecommendations(chatId: string, messageId?: number) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    const txt = "Сначала авторизуйтесь — отправьте /code";
    if (messageId) await editMessageText(chatId, messageId, txt);
    else await sendTelegramMessage(chatId, txt);
    return;
  }

  // "Loading..." placeholder so user gets feedback within 1s
  if (messageId) {
    await editMessageText(chatId, messageId, "✨ <b>Готовлю рекомендации...</b>\n\nАнализирую ваши лайки и историю.", { parseMode: "HTML" });
  } else {
    await sendTelegramMessage(chatId, "✨ <b>Готовлю рекомендации...</b>\n\nАнализирую ваши лайки и историю.", { parseMode: "HTML" });
  }

  // Fetch recommendations
  const { tracks, category, meta } = await fetchRecommendations(user.id, { limit: 15 });

  if (tracks.length === 0) {
    // No seeds — user has no likes/history yet
    const { ids: likeIds } = await getUserLikes(user.id);
    const history = await getUserHistory(user.id, 5);
    const isFreshAccount = likeIds.length === 0 && history.length === 0;

    const txt = isFreshAccount
      ? "✨ <b>Пока нечего рекомендовать</b>\n\n" +
        "Чтобы получить персональные рекомендации:\n\n" +
        "1. Откройте /search и найдите любимых артистов\n" +
        "2. Нажмите 🤍 на треках, которые вам нравятся\n" +
        "3. Послушайте пару треков на сайте или через бота\n\n" +
        "После этого /recs предложит похожее на ваше вкусы."
      : "✨ <b>Не удалось получить рекомендации.</b>\n\n" +
        "Попробуйте позже или используйте /search для поиска треков.";

    if (messageId) await editMessageText(chatId, messageId, txt, { parseMode: "HTML" });
    else await sendTelegramMessage(chatId, txt, { parseMode: "HTML" });
    return;
  }

  // Save recs as search results so existing search_page/preview/add_search/like_idx handlers work
  // Convert RecTrack → search-result shape (they are already compatible)
  const searchShapedTracks = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album || "",
    duration: t.duration || 0,
    cover: t.cover || "",
    genre: t.genre || "",
    audioUrl: t.audioUrl || "",
    previewUrl: t.previewUrl || "",
    source: t.source || "soundcloud",
    scTrackId: t.scTrackId || null,
    scStreamPolicy: t.scStreamPolicy || "ALLOW",
    scIsFull: t.scIsFull ?? true,
    permalinkUrl: t.scTrackId ? `https://soundcloud.com/tracks/${t.scTrackId}` : "",
  }));

  // Preserve activePlaylistId if user has a playlist open — so "+ Сюда" works
  const existingState = await getChatState(chatId);
  const activePlaylistId = existingState?.activePlaylistId;

  await setChatState(
    chatId,
    "idle",
    { fileUrl: null, fileDuration: 0, originalFilename: "" },
    searchShapedTracks,
    undefined,
    undefined,
    { activePlaylistId, viewPage: 0 },
  );

  // Build keyboard (page 0)
  const markup = buildRecommendationsKeyboard(searchShapedTracks, 0, !!activePlaylistId);

  // Build text
  const catTitle = category?.title || "Для вас";
  const lines = tracks.slice(0, 5).map((t, i) => {
    const dur = t.duration ? ` (${formatDuration(t.duration)})` : "";
    return `<b>${i + 1}.</b> ${t.title} — ${t.artist}${dur}`;
  }).join("\n");

  let metaLine = "";
  if (meta) {
    const parts: string[] = [];
    if (meta.seedCount) parts.push(`seeds: ${meta.seedCount}`);
    if (meta.afterDedup) parts.push(`кандидатов: ${meta.afterDedup}`);
    if (parts.length) metaLine = `\n\n<i>${parts.join(" · ")}</i>`;
  }

  const txt = `✨ <b>${catTitle}</b>\n` +
    `Найдено ${tracks.length} ${getTrackWord(tracks.length)}` +
    (activePlaylistId ? ` · целевой плейлист активен (кнопка «+ Сюда»)` : "") +
    `\n\n${lines}` +
    (tracks.length > 5 ? `\n\n... и ещё ${tracks.length - 5}` : "") +
    metaLine +
    `\n\n▶ — прослушать · + — в плейлист · 🤍 — лайк`;

  if (messageId) {
    await editMessageText(chatId, messageId, txt, { parseMode: "HTML", replyMarkup: markup });
  } else {
    await sendTelegramMessage(chatId, txt, { parseMode: "HTML", replyMarkup: markup });
  }
}
