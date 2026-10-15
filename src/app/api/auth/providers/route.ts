import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/oauth";
import { isTelegramConfigured, getBotName } from "@/lib/telegram";
import { isEmailConfigured } from "@/lib/email";

/**
 * GET /api/auth/providers — auth availability probe for the login screen.
 *
 * Tells the frontend which login methods are actually configured WITHOUT
 * exposing any secrets: only booleans + the public bot username (which the
 * official Telegram Login Widget requires client-side anyway) + the PUBLIC
 * Google OAuth web client id (required by Android Credential Manager's
 * GetGoogleIdOption; it is public by design — the client SECRET stays
 * server-side and is only used in the code exchange).
 */

/**
 * Hostnames where the official Telegram Login Widget is allowed to mount.
 *
 * The widget is a cross-origin iframe: when the CURRENT hostname is not
 * bound via BotFather /setdomain, Telegram renders «Bot domain invalid»
 * INSIDE the iframe — a raw red error we cannot suppress. The fix is to
 * not mount the widget at all on unbound hosts and let the client show an
 * honest neutral fallback instead.
 *
 * Source order (first non-empty wins):
 *  1. TELEGRAM_WIDGET_DOMAINS — explicit comma-separated allowlist
 *  2. NEXT_PUBLIC_BASE_URL host
 *  3. VERCEL_PROJECT_PRODUCTION_DOMAIN (Vercel sets this automatically)
 *  4. VERCEL_URL (preview/deployment host, protocol stripped)
 * Empty result → widget disabled everywhere (bot-code flow stays).
 */
function telegramWidgetDomains(): string[] {
  const collect = (raw: string | undefined): string[] =>
    (raw || "")
      .split(/[,\s]+/)
      .map((h) => h.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "").toLowerCase())
      .filter((h) => h.length > 0 && !h.includes("://"));

  const explicit = collect(process.env.TELEGRAM_WIDGET_DOMAINS);
  if (explicit.length > 0) return Array.from(new Set(explicit));

  const fromBase = collect(process.env.NEXT_PUBLIC_BASE_URL);
  if (fromBase.length > 0) return Array.from(new Set(fromBase));

  const fromProd = collect(process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN);
  if (fromProd.length > 0) return Array.from(new Set(fromProd));

  const fromVercelUrl = collect(process.env.VERCEL_URL);
  return Array.from(new Set(fromVercelUrl));
}

export async function GET() {
  try {
    const telegramBot = isTelegramConfigured();
    const botName = getBotName();
    const widgetDomains = telegramWidgetDomains();

    return NextResponse.json({
      google: isGoogleConfigured(),
      // Android native login (Credential Manager) needs the server client id;
      // web clients ignore this field.
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      // Widget needs BOTH the bot token (server-side hash verification)
      // and the bot username (rendered into the widget)
      telegramWidget: telegramBot && !!botName,
      telegramBot, // bot-code fallback flow
      telegramBotName: botName || null,
      // Hostnames where the widget may mount (see telegramWidgetDomains) —
      // empty array = widget never mounts, bot-code flow carries Telegram.
      telegramWidgetDomains: widgetDomains,
      email: true, // email+password login always available
      emailDelivery: isEmailConfigured(), // whether codes/emails actually send
      // Desktop client (Windows): Google login is handed off through the
      // system browser via /api/auth/google?desktop=1 → /desktop-auth →
      // mq://auth (webview OAuth is blocked by Google). Lets the desktop
      // app pick the right Google flow and stay honest when the server
      // predates this capability.
      desktopHandoff: true,
    });
  } catch {
    return NextResponse.json(
      {
        google: false,
        googleClientId: null,
        telegramWidget: false,
        telegramBot: false,
        telegramBotName: null,
        telegramWidgetDomains: [],
        email: true,
        emailDelivery: false,
      },
      { status: 200 }
    );
  }
}
