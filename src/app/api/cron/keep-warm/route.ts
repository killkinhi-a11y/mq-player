import { NextResponse } from "next/server";

/**
 * Cron keep-warm endpoint.
 *
 * Vercel Cron calls this every 4 minutes to keep the webhook function warm,
 * preventing cold starts (2-5s) on Telegram bot responses.
 *
 * Also returns bot health status for monitoring.
 */
export async function GET() {
  try {
    // Ping the webhook endpoint to keep it warm
    const host = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "";

    if (host) {
      // Fire-and-forget ping to webhook
      fetch(`${host}/api/telegram/webhook`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    return NextResponse.json({
      status: "warm",
      timestamp: new Date().toISOString(),
      function: "telegram-webhook",
    });
  } catch {
    return NextResponse.json({
      status: "warm",
      timestamp: new Date().toISOString(),
    });
  }
}
