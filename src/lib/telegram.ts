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
export async function setWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_API_URL) return false;

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
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
