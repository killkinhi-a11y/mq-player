import { NextRequest, NextResponse } from "next/server";
import { getTelegramFileUrl } from "@/lib/telegram";

/**
 * Proxy for Telegram audio files.
 *
 * Telegram file URLs (api.telegram.org/file/bot...) don't have CORS headers,
 * so the browser can't play them directly. This endpoint proxies the audio
 * through our server with proper CORS headers.
 *
 * GET /api/telegram/audio-proxy?fileId=xxx
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  const fileUrl = searchParams.get("url");

  let targetUrl: string | null = null;

  // Resolve by file_id (preferred — more reliable)
  if (fileId) {
    targetUrl = await getTelegramFileUrl(fileId);
  } else if (fileUrl) {
    // Direct URL proxy
    targetUrl = fileUrl;
  }

  if (!targetUrl) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch audio" }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "audio/mpeg";
    const contentLength = res.headers.get("content-length");

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "*");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(res.body, { headers });
  } catch (error: any) {
    console.error("[TELEGRAM AUDIO PROXY] Error:", error?.message || error);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
