import { NextResponse } from "next/server";
import { isTelegramConfigured, getBotName } from "@/lib/telegram";

export async function GET() {
  try {
    const configured = isTelegramConfigured();
    const botName = getBotName();

    return NextResponse.json({
      configured,
      botName: botName || null,
    });
  } catch {
    return NextResponse.json(
      { configured: false, botName: null },
      { status: 500 }
    );
  }
}
