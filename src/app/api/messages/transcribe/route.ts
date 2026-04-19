import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 10 requests per minute
  const { success, resetIn } = rateLimit({
    ip: getClientIp(req),
    limit: 10,
    window: 60,
    key: "messages-transcribe",
  });
  if (!success) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте позже.", retryAfter: resetIn },
      {
        status: 429,
        headers: { "Retry-After": String(resetIn) },
      }
    );
  }

  try {
    const body = await req.json();
    const { voiceUrl } = body;

    if (!voiceUrl || typeof voiceUrl !== "string") {
      return NextResponse.json(
        { error: "voiceUrl обязателен" },
        { status: 400 }
      );
    }

    // Extract base64 data and content type from data URL
    // Expected format: data:audio/webm;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAE...
    const match = voiceUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Неверный формат voiceUrl. Ожидается data URL с аудио." },
        { status: 400 }
      );
    }

    const mimeType = match[1]; // e.g. "audio/webm"
    const base64AudioData = match[2]; // raw base64 without prefix

    // Use z-ai-web-dev-sdk for ASR
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const result: any = await zai.audio.asr.create({
      file_base64: base64AudioData,
    });

    // The SDK may return the text directly or within a nested structure
    const transcriptionText =
      typeof result === "string"
        ? result
        : result?.text || result?.result || result?.transcription || "";

    if (!transcriptionText) {
      return NextResponse.json(
        { error: "Не удалось распознать речь" },
        { status: 500 }
      );
    }

    return NextResponse.json({ text: String(transcriptionText) });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Ошибка при транскрибации аудио" },
      { status: 500 }
    );
  }
}
