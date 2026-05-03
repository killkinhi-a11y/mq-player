/**
 * Telegram Bot API integration.
 *
 * Handles sending messages to users via the Telegram Bot API.
 * Used for the Telegram-based authentication flow.
 *
 * Setup:
 *   1. Create a bot via @BotFather on Telegram
 *   2. Get the bot token
 *   3. Set TELEGRAM_BOT_TOKEN env var
 *   4. Set webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_DOMAIN>/api/telegram/webhook
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_API_URL = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

/**
 * Check if Telegram bot is configured.
 */
export function isTelegramConfigured(): boolean {
  return !!TELEGRAM_API_URL;
}

/**
 * Get the bot username (for showing in UI instructions).
 */
export function getBotName(): string | null {
  return process.env.TELEGRAM_BOT_NAME || null;
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown";
    replyMarkup?: any;
  }
): Promise<{ ok: boolean; description?: string }> {
  if (!TELEGRAM_API_URL) {
    console.error("[TELEGRAM] Bot not configured — TELEGRAM_BOT_TOKEN not set");
    return { ok: false, description: "Bot not configured" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode || "HTML",
        reply_markup: options?.replyMarkup,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("[TELEGRAM] sendMessage failed:", data.description);
    }

    return data;
  } catch (error: any) {
    console.error("[TELEGRAM] sendMessage error:", error?.message || error);
    return { ok: false, description: error?.message || "Unknown error" };
  }
}

/**
 * Verify that a webhook request is actually from Telegram.
 * Compares the hash in the header with our computed HMAC-SHA256.
 */
export function verifyTelegramWebhook(
  body: string,
  signatureHeader: string | null
): boolean {
  if (!TELEGRAM_BOT_TOKEN) return false;
  if (!signatureHeader) return false;

  const crypto = require("crypto");
  const secretKey = crypto.createHash("sha256").update(TELEGRAM_BOT_TOKEN).digest();

  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(body)
    .digest("hex");

  return hmac === signatureHeader;
}

/**
 * Set the webhook URL for the bot.
 * Call this once during setup.
 */
/**
 * Send an audio message to a Telegram chat.
 */
export async function sendTelegramAudio(
  chatId: string | number,
  audioUrl: string,
  options?: {
    title?: string;
    performer?: string;
    caption?: string;
    duration?: number;
    replyMarkup?: any;
  }
): Promise<{ ok: boolean; description?: string }> {
  if (!TELEGRAM_API_URL) {
    return { ok: false, description: "Bot not configured" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/sendAudio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        audio: audioUrl,
        title: options?.title,
        performer: options?.performer,
        caption: options?.caption || "",
        duration: options?.duration,
        reply_markup: options?.replyMarkup,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("[TELEGRAM] sendAudio failed:", data.description);
    }
    return data;
  } catch (error: any) {
    console.error("[TELEGRAM] sendAudio error:", error?.message || error);
    return { ok: false, description: error?.message || "Unknown error" };
  }
}

/**
 * Answer a callback query (remove loading state on button).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<{ ok: boolean }> {
  if (!TELEGRAM_API_URL) return { ok: false };

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || "",
        cache_time: 0,
      }),
    });
    const data = await res.json();
    return data;
  } catch {
    return { ok: false };
  }
}

/**
 * Edit an existing message text and/or reply markup.
 */
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown";
    replyMarkup?: any;
    disablePreview?: boolean;
  }
): Promise<{ ok: boolean }> {
  if (!TELEGRAM_API_URL) return { ok: false };

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options?.parseMode || "HTML",
        reply_markup: options?.replyMarkup,
        disable_web_page_preview: options?.disablePreview !== false,
      }),
    });
    const data = await res.json();
    return data;
  } catch {
    return { ok: false };
  }
}

/**
 * Delete a message from a chat.
 */
export async function deleteMessage(
  chatId: string | number,
  messageId: number
): Promise<{ ok: boolean }> {
  if (!TELEGRAM_API_URL) return { ok: false };

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const data = await res.json();
    return data;
  } catch {
    return { ok: false };
  }
}

/**
 * Get Telegram file URL (for downloading user-sent audio).
 */
export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!TELEGRAM_API_URL) return null;

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
  } catch {
    return null;
  }
}

export async function setWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_API_URL) return false;

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    const data = await res.json();
    return data.ok;
  } catch {
    return false;
  }
}

/**
 * Get bot info (useful for diagnostics).
 */
export async function getBotInfo(): Promise<any | null> {
  if (!TELEGRAM_API_URL) return null;

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/getMe`);
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch {
    return null;
  }
}

/**
 * Get current webhook info (useful for diagnostics).
 */
export async function getWebhookInfo(): Promise<any | null> {
  if (!TELEGRAM_API_URL) return null;

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/getWebhookInfo`);
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch {
    return null;
  }
}
