/**
 * Telegram Bot command handler & state machine.
 *
 * Features:
 *   - Auth: /start, /code
 *   - Import: Send audio to bot → choose playlist → track added
 *   - Search: /search <query> → find on SoundCloud → add to playlist
 *   - Playlists: /playlists — list, /newplaylist <name>
 *   - Now Playing: /nowplaying — current track info
 *   - Help: /help, /menu
 *
 * Uses callback_query for inline keyboard interactions.
 */

import { db } from "@/lib/db";
import {
  sendTelegramMessage,
  sendTelegramAudio,
  answerCallbackQuery,
  editMessageText,
  deleteMessage,
  getTelegramFileUrl,
} from "@/lib/telegram";
import { searchSCTracks } from "@/lib/soundcloud";

/* ------------------------------------------------------------------ */
/*  Site origin (set once from webhook request)                       */
/* ------------------------------------------------------------------ */

let _siteOrigin = "";

export function setSiteOrigin(origin: string) {
  if (!_siteOrigin) _siteOrigin = origin.replace(/\/$/, "");
}

function getSiteOrigin(): string {
  return _siteOrigin || "https://mq-player.vercel.app";
}

/* ------------------------------------------------------------------ */
/*  Bot conversation states (per chatId)                              */
/* ------------------------------------------------------------------ */

type BotState =
  | null // idle
  | "awaiting_import_playlist" // user sent audio, choosing playlist
  | "awaiting_import_title"    // user sent audio, typing track title
  | "awaiting_search_query"    // user triggered /search, waiting for query
  | "awaiting_new_playlist"    // user triggered /newplaylist, waiting for name
  | "awaiting_add_to_playlist" // user searching, choosing playlist to add result to;

interface PendingImport {
  fileId?: string;              // Telegram file_id for audio
  fileUrl: string | null;      // Telegram file URL (temporary) or null
  fileDuration: number;        // seconds
  originalFilename: string;
  scTrackId?: number;          // if from SoundCloud search
  scData?: Record<string, unknown>; // SoundCloud track data
}

const chatStates = new Map<string, { state: BotState; data: PendingImport; searchResults?: any[] }>();
const STATE_TTL = 15 * 60 * 1000; // 15 minutes

function setChatState(chatId: string, state: BotState, data: PendingImport = { fileUrl: null, fileDuration: 0, originalFilename: "" }, searchResults?: any[]) {
  chatStates.set(chatId, { state, data, searchResults });
  // Auto-expire
  setTimeout(() => chatStates.delete(chatId), STATE_TTL);
}

function getChatState(chatId: string) {
  return chatStates.get(chatId) || null;
}

function clearChatState(chatId: string) {
  chatStates.delete(chatId);
}

/* ------------------------------------------------------------------ */
/*  Helper: find user by telegramChatId                               */
/* ------------------------------------------------------------------ */

async function findUserByChatId(chatId: string) {
  return db.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, username: true, telegramChatId: true },
  });
}

/* ------------------------------------------------------------------ */
/*  Helper: get user's playlists                                      */
/* ------------------------------------------------------------------ */

interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
}

async function getUserPlaylists(userId: string): Promise<PlaylistSummary[]> {
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
  try {
    return JSON.parse(tracksJson || "[]").length;
  } catch {
    return 0;
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
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
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
  // Pagination
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "< Назад", callback_data: `search_page:${page - 1}` });
  if (end < tracks.length) navRow.push({ text: "Далее >", callback_data: `search_page:${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);
  rows.push([{ text: "Отмена", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

/* ------------------------------------------------------------------ */
/*  Menu / Help                                                       */
/* ------------------------------------------------------------------ */

const HELP_TEXT = `🎵 <b>mq — музыкальный бот</b>

<b>Команды:</b>
/menu — главное меню
/search — поиск треков на SoundCloud
/playlists — мои плейлисты
/newplaylist — создать плейлист
/nowplaying — текущий трек
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

/* ------------------------------------------------------------------ */
/*  Handle incoming Telegram message                                   */
/* ------------------------------------------------------------------ */

export async function handleTelegramMessage(body: Record<string, any>) {
  const message = body.message;
  if (!message) return;

  const chatId = String(message.chat?.id);
  const from = message.from;
  const text = (message.text || "").trim();

  if (!chatId || !from) return;

  // ---- /start ----
  if (text === "/start") {
    await sendTelegramMessage(chatId,
      `🎵 <b>Добро пожаловать в mq!</b>\n\n` +
      `Я бот для управления музыкой. Введите <b>любое сообщение</b> (или /code), чтобы получить код входа.\n\n` +
      `После авторизации используйте /menu для доступа к функциям плеера.`,
      { parseMode: "HTML" }
    );
    return;
  }

  // ---- /code (auth) ----
  if (text === "/code" || (!text.startsWith("/") && getChatState(chatId) === null && !message.audio && !message.voice)) {
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

  // ---- /search ----
  if (text === "/search") {
    const user = await findUserByChatId(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
      return;
    }
    setChatState(chatId, "awaiting_search_query");
    await sendTelegramMessage(chatId, "Введите название трека или исполнителя для поиска:");
    return;
  }

  // ---- /search <query> ----
  if (text.startsWith("/search ")) {
    const user = await findUserByChatId(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
      return;
    }
    const query = text.slice(8).trim();
    if (!query) {
      await sendTelegramMessage(chatId, "Введите название трека или исполнителя для поиска:");
      return;
    }
    await handleSearch(chatId, query);
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
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
      return;
    }
    setChatState(chatId, "awaiting_new_playlist");
    await sendTelegramMessage(chatId, "Введите название нового плейлиста:");
    return;
  }

  // ---- /nowplaying ----
  if (text === "/nowplaying") {
    await sendTelegramMessage(chatId,
      "Управление воспроизведением доступно на сайте mq.\n\n" +
      "Треки, которые вы слушаете, отображаются в интерфейсе плеера.",
      { parseMode: "HTML" }
    );
    return;
  }

  // ---- Handle states (conversations) ----
  const chatState = getChatState(chatId);

  // User is typing a search query
  if (chatState?.state === "awaiting_search_query") {
    clearChatState(chatId);
    if (text) {
      await handleSearch(chatId, text);
    }
    return;
  }

  // User is typing new playlist name
  if (chatState?.state === "awaiting_new_playlist") {
    clearChatState(chatId);
    if (text) {
      await handleNewPlaylist(chatId, text);
    }
    return;
  }

  // User is typing track title for import
  if (chatState?.state === "awaiting_import_title") {
    clearChatState(chatId);
    if (text) {
      await handleImportWithTitle(chatId, text, chatState.data);
    }
    return;
  }

  // ---- Audio message received ----
  if (message.audio || message.voice) {
    const user = await findUserByChatId(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code для получения кода входа.");
      return;
    }
    await handleAudioMessage(chatId, message);
    return;
  }
}

/* ------------------------------------------------------------------ */
/*  Handle callback query (inline keyboard presses)                   */
/* ------------------------------------------------------------------ */

export async function handleCallbackQuery(body: Record<string, any>) {
  const callbackQuery = body.callback_query;
  if (!callbackQuery) return;

  const chatId = String(callbackQuery.message?.chat?.id);
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data || "";
  const fromId = callbackQuery.from?.id;

  if (!chatId || !messageId) return;

  await answerCallbackQuery(callbackQuery.id);

  // Cancel
  if (data === "cancel") {
    clearChatState(chatId);
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
      "Поддерживаются форматы: MP3, OGG, M4A, WAV и другие.",
      { parseMode: "HTML" }
    );
    return;
  }
  if (data === "cmd_search") {
    const user = await findUserByChatId(chatId);
    if (!user) {
      await editMessageText(chatId, messageId, "Сначала авторизуйтесь — отправьте /code");
      return;
    }
    setChatState(chatId, "awaiting_search_query");
    await editMessageText(chatId, messageId, "Введите название трека или исполнителя для поиска:");
    return;
  }
  if (data === "cmd_playlists") {
    await handlePlaylists(chatId);
    return;
  }
  if (data === "cmd_newplaylist") {
    const user = await findUserByChatId(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
      return;
    }
    setChatState(chatId, "awaiting_new_playlist");
    await editMessageText(chatId, messageId, "Введите название нового плейлиста:");
    return;
  }

  // Import: user chose a playlist
  if (data.startsWith("import_playlist:")) {
    const playlistId = data.slice("import_playlist:".length);
    const state = getChatState(chatId);
    if (state?.state !== "awaiting_import_playlist") return;
    clearChatState(chatId);
    await handleImportToPlaylist(chatId, playlistId, state.data);
    return;
  }

  // Import: user wants to type title
  if (data === "import_custom_title") {
    const state = getChatState(chatId);
    if (state?.state !== "awaiting_import_playlist") return;
    setChatState(chatId, "awaiting_import_title", state.data);
    await editMessageText(chatId, messageId, "Введите название трека и исполнителя (например: <i>Название — Исполнитель</i>):", {
      parseMode: "HTML",
    });
    return;
  }

  // Search: user chose a track to add
  if (data.startsWith("add_search:")) {
    const index = parseInt(data.slice("add_search:".length), 10);
    const state = getChatState(chatId);
    if (!state?.searchResults) return;

    const track = state.searchResults[index];
    if (!track) return;

    // Now ask for playlist
    const user = await findUserByChatId(chatId);
    if (!user) {
      await editMessageText(chatId, messageId, "Ошибка авторизации.");
      return;
    }
    const playlists = await getUserPlaylists(user.id);
    if (playlists.length === 0) {
      await editMessageText(chatId, messageId, "У вас нет плейлистов. Создайте первый через /newplaylist");
      return;
    }
    setChatState(chatId, "awaiting_add_to_playlist", { ...state.data, scTrackId: track.scTrackId, scData: track }, state.searchResults);
    await editMessageText(chatId, messageId,
      `Выбран трек: <b>${track.title}</b> — ${track.artist}\n\nВ какой плейлист добавить?`,
      {
        parseMode: "HTML",
        replyMarkup: buildPlaylistKeyboard(playlists, "add_search_pl"),
      }
    );
    return;
  }

  // Search: user chose playlist for search result
  if (data.startsWith("add_search_pl:")) {
    const playlistId = data.slice("add_search_pl:".length);
    const state = getChatState(chatId);
    if (state?.state !== "awaiting_add_to_playlist") return;
    clearChatState(chatId);
    await handleAddSearchTrackToPlaylist(chatId, playlistId, state.data);
    return;
  }

  // Search pagination
  if (data.startsWith("search_page:")) {
    const page = parseInt(data.slice("search_page:".length), 10);
    const state = getChatState(chatId);
    if (!state?.searchResults) return;
    await editMessageText(chatId, messageId,
      `Найдено ${state.searchResults.length} треков:`,
      {
        parseMode: "HTML",
        replyMarkup: buildSearchResultsKeyboard(state.searchResults, page),
      }
    );
    return;
  }

  // Delete playlist
  if (data.startsWith("delete_playlist:")) {
    const playlistId = data.slice("delete_playlist:".length);
    const user = await findUserByChatId(chatId);
    if (!user) return;
    const existing = await db.playlist.findUnique({ where: { id: playlistId } });
    if (!existing || existing.userId !== user.id) {
      await editMessageText(chatId, messageId, "Плейлист не найден.");
      return;
    }
    await db.playlist.delete({ where: { id: playlistId } });
    await editMessageText(chatId, messageId, `Плейлист "${existing.name}" удалён.`);
    return;
  }
}

/* ------------------------------------------------------------------ */
/*  Auth: generate and send verification code                         */
/* ------------------------------------------------------------------ */

async function handleAuthCode(chatId: string, from: Record<string, any>) {
  const crypto = await import("crypto");
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.telegramAuthCode.deleteMany({
    where: { chatId, used: false, expiresAt: { gt: new Date() } },
  });

  await db.telegramAuthCode.create({
    data: {
      chatId,
      telegramUserId: BigInt(from.id),
      telegramUsername: from.username || null,
      code,
      expiresAt,
    },
  });

  await sendTelegramMessage(chatId,
    `🔐 <b>Код подтверждения mq:</b>\n\n` +
    `<code>${code}</code>\n\n` +
    `Код действителен 10 минут.`,
    { parseMode: "HTML" }
  );
}

/* ------------------------------------------------------------------ */
/*  Audio message handler                                             */
/* ------------------------------------------------------------------ */

async function handleAudioMessage(chatId: string, message: Record<string, any>) {
  const audio = message.audio || message.voice;
  const fileId = audio.file_id;
  const duration = audio.duration || 0; // seconds
  const title = audio.title || "";
  const performer = audio.performer || "";
  const fileName = audio.file_name || (message.voice ? "Голосовое сообщение" : "audio");

  if (duration > 600) {
    await sendTelegramMessage(chatId, "Аудио слишком длинное (максимум 10 минут).");
    return;
  }

  // Store fileId for later proxy resolution (fileUrl is temporary and expires!)
  const importTitle = (title && performer) ? `${title} — ${performer}` : title || fileName;

  const pendingData: PendingImport = {
    fileId,
    fileUrl: null, // will be resolved later via proxy using fileId
    fileDuration: duration,
    originalFilename: importTitle,
  };

  setChatState(chatId, "awaiting_import_playlist", pendingData);

  const user = await findUserByChatId(chatId);
  if (!user) return;
  const playlists = await getUserPlaylists(user.id);

  let messageText = `Аудио получено: <b>${importTitle}</b> (${formatDuration(duration)})\n\n`;
  if (playlists.length === 0) {
    messageText += "У вас нет плейлистов. Сначала создайте один через /newplaylist";
    await sendTelegramMessage(chatId, messageText, { parseMode: "HTML" });
    clearChatState(chatId);
    return;
  }
  messageText += "В какой плейлист добавить?";

  await sendTelegramMessage(chatId, messageText, {
    parseMode: "HTML",
    replyMarkup: buildPlaylistKeyboard(playlists, "import_playlist"),
  });
}

/* ------------------------------------------------------------------ */
/*  Import with custom title                                          */
/* ------------------------------------------------------------------ */

async function handleImportWithTitle(chatId: string, customTitle: string, data: PendingImport) {
  const user = await findUserByChatId(chatId);
  if (!user) return;
  const playlists = await getUserPlaylists(user.id);

  if (playlists.length === 0) {
    await sendTelegramMessage(chatId, "У вас нет плейлистов. Создайте один через /newplaylist");
    return;
  }

  const newData = { ...data, originalFilename: customTitle };
  setChatState(chatId, "awaiting_import_playlist", newData);

  await sendTelegramMessage(chatId,
    `Название: <b>${customTitle}</b>\n\nВ какой плейлист добавить?`,
    {
      parseMode: "HTML",
      replyMarkup: buildPlaylistKeyboard(playlists, "import_playlist"),
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Import to playlist (save track)                                   */
/* ------------------------------------------------------------------ */

async function handleImportToPlaylist(chatId: string, playlistId: string, data: PendingImport) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist || playlist.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  // Parse existing tracks
  let tracks: any[] = [];
  try {
    tracks = JSON.parse(playlist.tracksJson || "[]");
  } catch {
    tracks = [];
  }

  // Parse artist/title from filename
  const parts = data.originalFilename.includes(" — ")
    ? data.originalFilename.split(" — ")
    : [data.originalFilename];
  const trackTitle = (parts[0] || "").trim();
  const trackArtist = (parts[1] || "").trim() || "Неизвестный";

  // Use our proxy URL with fileId — this works even after the original URL expires
  // The proxy resolves fileId → Telegram file URL on each request
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

  // Dedup by title+artist
  const exists = tracks.some((t: any) =>
    t.title === trackTitle && t.artist === trackArtist
  );
  if (exists) {
    await sendTelegramMessage(chatId,
      `Трек "${trackTitle} — ${trackArtist}" уже есть в плейлисте "${playlist.name}".`
    );
    return;
  }

  tracks.push(newTrack);

  await db.playlist.update({
    where: { id: playlistId },
    data: { tracksJson: JSON.stringify(tracks) },
  });

  await sendTelegramMessage(chatId,
    `Трек добавлен в <b>${playlist.name}</b>:\n` +
    `${trackTitle} — ${trackArtist} (${formatDuration(data.fileDuration)})\n\n` +
    `Всего треков: ${tracks.length}`,
    { parseMode: "HTML" }
  );
}

/* ------------------------------------------------------------------ */
/*  SoundCloud search                                                 */
/* ------------------------------------------------------------------ */

async function handleSearch(chatId: string, query: string) {
  await sendTelegramMessage(chatId, `Ищу: <i>${query}</i>...`, { parseMode: "HTML" });

  const results = await searchSCTracks(query, 15);
  if (results.length === 0) {
    await sendTelegramMessage(chatId, "Ничего не найдено. Попробуйте другой запрос.");
    return;
  }

  setChatState(chatId, null, { fileUrl: null, fileDuration: 0, originalFilename: "" }, results);

  await sendTelegramMessage(chatId,
    `Найдено ${results.length} треков по запросу "${query}":\n\n` +
    `Нажмите на трек, чтобы добавить его в плейлист.`,
    {
      parseMode: "HTML",
      replyMarkup: buildSearchResultsKeyboard(results, 0),
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Add SoundCloud search result to playlist                          */
/* ------------------------------------------------------------------ */

async function handleAddSearchTrackToPlaylist(chatId: string, playlistId: string, data: PendingImport) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist || playlist.userId !== user.id) {
    await sendTelegramMessage(chatId, "Плейлист не найден.");
    return;
  }

  let tracks: any[] = [];
  try {
    tracks = JSON.parse(playlist.tracksJson || "[]");
  } catch {
    tracks = [];
  }

  const scTrack = data.scData;
  if (!scTrack) {
    await sendTelegramMessage(chatId, "Ошибка: трек не найден.");
    return;
  }

  // Dedup
  const exists = tracks.some((t: any) => t.scTrackId === scTrack.scTrackId);
  if (exists) {
    await sendTelegramMessage(chatId,
      `Трек "${scTrack.title}" уже есть в плейлисте "${playlist.name}".`
    );
    return;
  }

  tracks.push(scTrack);
  await db.playlist.update({
    where: { id: playlistId },
    data: { tracksJson: JSON.stringify(tracks) },
  });

  await sendTelegramMessage(chatId,
    `Трек добавлен в <b>${playlist.name}</b>:\n` +
    `${scTrack.title} — ${scTrack.artist}\n\n` +
    `Всего треков: ${tracks.length}`,
    { parseMode: "HTML" }
  );
}

/* ------------------------------------------------------------------ */
/*  List playlists                                                    */
/* ------------------------------------------------------------------ */

async function handlePlaylists(chatId: string) {
  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, "Сначала авторизуйтесь — отправьте /code");
    return;
  }

  const playlists = await db.playlist.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, tracksJson: true, createdAt: true },
  });

  if (playlists.length === 0) {
    await sendTelegramMessage(chatId,
      "У вас пока нет плейлистов.\n\nСоздайте первый через /newplaylist",
      { parseMode: "HTML" }
    );
    return;
  }

  const lines = playlists.map((pl, i) => {
    const count = trackCountFromJson(pl.tracksJson);
    return `<b>${i + 1}.</b> ${pl.name} — ${count} треков`;
  });

  const text = `音符 <b>Ваши плейлисты</b> (${playlists.length}):\n\n${lines.join("\n")}`;
  await sendTelegramMessage(chatId, text, { parseMode: "HTML" });
}

/* ------------------------------------------------------------------ */
/*  Create new playlist                                               */
/* ------------------------------------------------------------------ */

async function handleNewPlaylist(chatId: string, name: string) {
  const user = await findUserByChatId(chatId);
  if (!user) return;

  if (name.length > 200) {
    await sendTelegramMessage(chatId, "Название слишком длинное (максимум 200 символов).");
    return;
  }

  const existing = await db.playlist.findFirst({
    where: { userId: user.id, name: name.trim() },
  });
  if (existing) {
    await sendTelegramMessage(chatId, `Плейлист "${name.trim()}" уже существует.`);
    return;
  }

  await db.playlist.create({
    data: {
      userId: user.id,
      name: name.trim(),
      tracksJson: "[]",
    },
  });

  await sendTelegramMessage(chatId,
    `Плейлист <b>${name.trim()}</b> создан!\n\nТеперь вы можете:\n` +
    `• Отправить аудио боту для импорта\n` +
    `• Использовать /search для поиска треков`,
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
