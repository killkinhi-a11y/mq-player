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
import { APP_URL } from "@/lib/config";
import {
  sendTelegramMessage,
  sendTelegramAudio,
  answerCallbackQuery,
  editMessageText,
  setMyCommands,
  setChatMenuButton,
} from "@/lib/telegram";
import { searchSCTracks, resolveSCStreamUrl } from "@/lib/soundcloud";

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
  | "collecting_audios";

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
    return {
      state: (row.state as BotState) || "idle",
      data: JSON.parse(row.data || "{}"),
      searchResults: JSON.parse(row.results || "[]"),
      audioBatch: JSON.parse(row.audioBatch || "[]"),
      collectingMessageId: row.collectingMessageId || undefined,
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
): Promise<void> {
  await database.upsertTelegramBotState({
    chatId,
    state,
    data: JSON.stringify(data),
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
  await db.telegramAuthCode.create({
    data: {
      chatId: data.chatId,
      telegramUserId: BigInt(data.telegramUserId),
      telegramUsername: data.telegramUsername ?? null,
      code: data.code,
      expiresAt: new Date(data.expiresAt),
    },
  });
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

function buildPreviewKeyboard(trackIndex: number) {
  return {
    inline_keyboard: [
      [
        { text: "Прослушать", callback_data: `preview:${trackIndex}` },
        { text: "Добавить в плейлист", callback_data: `add_search:${trackIndex}` },
      ],
      [{ text: "Отмена", callback_data: "cancel" }],
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Menu / Help text                                                   */
/* ------------------------------------------------------------------ */

const HELP_TEXT = `🎵 <b>mq — музыкальный бот</b>

<b>Команды:</b>
/menu — главное меню
/search — поиск треков на SoundCloud
/playlists — мои плейлисты
/newplaylist — создать плейлист
/help — помощь

<b>Импорт треков:</b>
Отправьте аудио или голосовое сообщение боту, чтобы импортировать его в выбранный плейлист.

<b>Быстрый поиск:</b>
/search текст — найдёт треки и предложит добавить в плейлист`;

const MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "Импортировать трек", callback_data: "cmd_import" }],
    [{ text: "Поиск треков", callback_data: "cmd_search" }],
    [{ text: "Мои плейлисты", callback_data: "cmd_playlists" }],
    [{ text: "Новый плейлист", callback_data: "cmd_newplaylist" }],
    [{ text: "Справка", callback_data: "cmd_help" }],
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

    // If payload is "code" — auto-trigger auth code flow
    if (payload === "code") {
      await Promise.all([
        setMyCommands().catch(() => {}),
        setChatMenuButton().catch(() => {}),
      ]);
      await handleAuthCode(chatId, from);
      return;
    }

    // Default welcome
    await Promise.all([
      sendTelegramMessage(chatId,
        `🎵 <b>Добро пожаловать в mq!</b>\n\n` +
        `Введите <b>любое сообщение</b> (или /code), чтобы получить код входа.\n\n` +
        `После авторизации используйте /menu для доступа к функциям плеера.`,
        { parseMode: "HTML" }
      ),
      setMyCommands().catch(() => {}),
      setChatMenuButton().catch(() => {}),
    ]);
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

  // ---- /newplaylist ----
  if (text === "/newplaylist") {
    const user = await findUserByChatId(chatId);
    if (!user) { await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await setChatState(chatId, "awaiting_new_playlist");
    await sendTelegramMessage(chatId, "Введите название нового плейлиста:");
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
    const user = await findUserByChatId(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code для получения кода входа.");
      return;
    }
    // Check if already collecting — if so, add to batch
    const existingState = await getChatState(chatId);
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
    const user = await findUserByChatId(chatId);
    if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await setChatState(chatId, "awaiting_search_query");
    await editMessageText(chatId, messageId, "Введите название трека или исполнителя для поиска:");
    return;
  }
  if (data === "cmd_playlists") {
    await handlePlaylists(chatId, messageId);
    return;
  }
  if (data === "cmd_newplaylist") {
    const user = await findUserByChatId(chatId);
    if (!user) { await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code"); return; }
    await setChatState(chatId, "awaiting_new_playlist");
    await editMessageText(chatId, messageId, "Введите название нового плейлиста:");
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

  // Preview: user wants to listen to a track before adding
  if (data.startsWith("preview:")) {
    const index = parseInt(data.slice("preview:".length), 10);
    if (!state || !state.searchResults?.length) {
      await editMessageText(chatId, messageId, "Сессия истекла. Используйте /search заново.");
      return;
    }
    const track = state.searchResults[index];
    if (!track) return;

    const keyboard = buildPreviewKeyboard(index);

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
    const playlists = await getUserPlaylists(user.id);
    if (playlists.length === 0) {
      // Auto-create "Избранное" and try again
      await createPlaylist(user.id, "Избранное", "[]");
      const newPlaylists = await getUserPlaylists(user.id);
      await setChatState(chatId, "awaiting_add_to_playlist",
        { ...state.data, scTrackId: track.scTrackId, scData: track },
        state.searchResults
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
      state.searchResults
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
    // Build enhanced keyboard with preview + add buttons per track
    const perPage = 5;
    const start = page * perPage;
    const end = start + perPage;
    const items = state.searchResults.slice(start, end);
    const rows: Array<Array<{ text: string; callback_data: string }>> = items.map((t: any, i: number) => {
      const idx = start + i;
      return [
        { text: `▶ ${t.title} — ${t.artist}`, callback_data: `preview:${idx}` },
        { text: `+ Добавить`, callback_data: `add_search:${idx}` },
      ];
    });
    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 0) navRow.push({ text: "< Назад", callback_data: `search_page:${page - 1}` });
    if (end < state.searchResults.length) navRow.push({ text: "Далее >", callback_data: `search_page:${page + 1}` });
    if (navRow.length > 0) rows.push(navRow);
    rows.push([{ text: "Отмена", callback_data: "cancel" }]);

    await editMessageText(chatId, messageId,
      `Найдено ${state.searchResults.length} треков:\n\nНажмите ▶ для прослушивания, или + для добавления в плейлист.`,
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
}

/* ================================================================== */
/*  Auth: generate and send verification code                         */
/* ================================================================== */

async function handleAuthCode(chatId: string, from: Record<string, any>) {
  try {
    const crypto = await import("crypto");
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Delete old unused codes first (sequential to avoid unique constraint race)
    await deleteExpiredTelegramAuthCodes(chatId).catch(() => {});

    // Telegram user ID — BigInt in Prisma, regular number in Turso.
    // BigInt() can throw on invalid input; fall back to Number.
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
    console.error("[TG Bot] handleAuthCode error:", errMsg);
    // Provide more specific error message based on error type
    let userMsg = "Ошибка при генерации кода. Попробуйте ещё раз.";
    if (errMsg.includes("no such table") || errMsg.includes("does not exist")) {
      // Schema missing — this should auto-fix via tursoQuery, but if it still fails:
      userMsg = "База данных инициализируется. Попробуйте через 10 секунд.";
    } else if (errMsg.includes("UNIQUE") || errMsg.includes("constraint")) {
      // Duplicate code — just retry
      userMsg = "Попробуйте ещё раз — произошёл конфликт кодов.";
    } else if (errMsg.includes("prisma") || errMsg.includes("database") || errMsg.includes("connect")) {
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

  // Auto-create playlist if user has none
  const result = await getUserPlaylistsOrCreate(chatId);
  if (!result) return;

  // Set state to collecting_audios with the first item
  await setChatState(chatId, "collecting_audios", pendingData, undefined, [batchItem]);

  const playlists = result.playlists;
  const wasAutoCreated = playlists.length === 1 && playlists[0].name === "Избранное";

  const collectingKeyboard = {
    inline_keyboard: [
      [{ text: `Добавить 1 трек в плейлист`, callback_data: "batch_add" }],
      [{ text: "Отмена", callback_data: "cancel" }],
    ],
  };

  const sentMsg = await sendTelegramMessage(chatId,
    `Аудио получено: <b>${importTitle}</b> (${formatDuration(duration)})\n\n` +
    `Отправьте ещё аудио или нажмите кнопку, чтобы добавить.\n` +
    (wasAutoCreated ? `Плейлист <b>Избранное</b> создан автоматически.\n\n` : ""),
    { parseMode: "HTML", replyMarkup: collectingKeyboard }
  );

  // Store the message ID for later editing
  const sentMsgId = sentMsg?.result?.message_id || sentMsg?.message_id;
  if (sentMsgId) {
    await setChatState(chatId, "collecting_audios", pendingData, undefined, [batchItem], sentMsgId);
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

  // Update state with new batch
  await setChatState(chatId, "collecting_audios", existingState.data, undefined, batch, existingState.collectingMessageId);

  // Update the collecting message
  const collectingKeyboard = {
    inline_keyboard: [
      [{ text: `Добавить ${count} ${getTrackWord(count)} в плейлист`, callback_data: "batch_add" }],
      [{ text: "Отмена", callback_data: "cancel" }],
    ],
  };

  if (existingState.collectingMessageId) {
    const trackList = batch.slice(-5).map((t, i) => `${batch.length - 4 + i > 0 ? (i === 0 && batch.length > 5 ? "...\\n" : "") : ""}${count - Math.min(batch.length - 1, 4) + i}. ${t.originalFilename} (${formatDuration(t.fileDuration)})`).join("\\n");
    const lastTracks = batch.slice(-3).map((t) => `  - ${t.originalFilename}`).join("\n");

    await editMessageText(chatId, existingState.collectingMessageId,
      `Получено <b>${count}</b> ${getTrackWord(count)}.\n\n` +
      `Последние:\n${lastTracks}\n\n` +
      `Отправьте ещё или нажмите кнопку, чтобы добавить.`,
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

  const result = await getUserPlaylistsOrCreate(chatId);
  if (!result) {
    await clearChatState(chatId);
    return;
  }

  const count = batch.length;
  const totalDuration = batch.reduce((s, t) => s + t.fileDuration, 0);

  // Transition to awaiting_import_playlist with batch data
  await setChatState(
    chatId,
    "awaiting_import_playlist",
    chatState.data,
    undefined,
    batch,
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
  await sendTelegramMessage(chatId, `Ищу: <i>${query}</i>...`, { parseMode: "HTML" });

  const results = await searchSCTracks(query, 15);
  if (results.length === 0) {
    await sendTelegramMessage(chatId, "Ничего не найдено. Попробуйте другой запрос.");
    return;
  }

  // Store search results in DB state
  await setChatState(chatId, "idle", { fileUrl: null, fileDuration: 0, originalFilename: "" }, results);

  // Build keyboard with preview + add buttons per track
  const perPage = 5;
  const items = results.slice(0, perPage);
  const rows: Array<Array<{ text: string; callback_data: string }>> = items.map((t: any, i: number) => [
    { text: `▶ ${t.title} — ${t.artist}`, callback_data: `preview:${i}` },
    { text: `+ Добавить`, callback_data: `add_search:${i}` },
  ]);
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (results.length > perPage) navRow.push({ text: "Далее >", callback_data: "search_page:1" });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "Отмена", callback_data: "cancel" }]);

  await sendTelegramMessage(chatId,
    `Найдено ${results.length} треков по запросу "${query}":\n\nНажмите ▶ для прослушивания, или + для добавления в плейлист.`,
    { parseMode: "HTML", replyMarkup: { inline_keyboard: rows } }
  );
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

  await sendTelegramMessage(chatId,
    `Трек добавлен в <b>${playlist.name}</b>:\n${scTrack.title} — ${scTrack.artist}\n\nВсего треков: ${tracks.length}\nТрек доступен для воспроизведения на сайте.`,
    { parseMode: "HTML" }
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

  const deleteButtons = playlists.slice(0, 6).map((pl) => ({
    text: `🗑 ${pl.name}`,
    callback_data: `delete_playlist:${pl.id}`,
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < deleteButtons.length; i += 2) rows.push(deleteButtons.slice(i, i + 2));
  rows.push([{ text: "Создать новый", callback_data: "cmd_newplaylist" }]);

  const text = `♫ <b>Ваши плейлисты</b> (${playlists.length}):\n\n${lines.join("\n")}\n\nЭти плейлисты также доступны на сайте в вашем аккаунте.`;
  const markup = playlists.length <= 6 ? { inline_keyboard: rows } : undefined;

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
