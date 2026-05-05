import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Upload validation endpoint.
 * On Vercel serverless, /tmp is ephemeral — files saved by one invocation
 * are unavailable in the next. Instead of storing on disk, we validate the
 * file server-side and return a track object. The client keeps the original
 * File reference and creates a blob URL for playback.
 */
async function handler(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }

    const originalName = file.name || "uploaded.mp3";

    // Allowed audio MIME types
    const ALLOWED_MIME_TYPES = new Set([
      "audio/mpeg",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/ogg",
      "audio/vorbis",
      "audio/flac",
      "audio/aac",
      "audio/mp4",
      "audio/x-m4a",
      "audio/webm",
      "audio/opus",
      "audio/x-ms-wma",
      "audio/aiff",
      "audio/x-aiff",
    ]);

    // Validate extension
    const hasAudioExt = !!originalName.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm|opus|wma|aiff|alac)$/i);
    if (!hasAudioExt) {
      return NextResponse.json({ error: "Неверный тип файла. Только аудиофайлы." }, { status: 400 });
    }

    // Validate MIME type
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Неверный MIME тип: ${file.type}. Только аудиофайлы.` },
        { status: 400 }
      );
    }

    // Validate file size (200MB max)
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл слишком большой. Максимальный размер — 200 МБ." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Пустой файл." }, { status: 400 });
    }

    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    console.log(`[upload] Validated: ${originalName} (${(file.size / 1024 / 1024).toFixed(1)}MB) → ${uniqueId}`);

    // Return track object — client will use its own blob URL for audioUrl
    // The placeholder tells the client: "use your stored blob URL for this id"
    return NextResponse.json({
      id: `local_${uniqueId}`,
      title,
      artist: "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0444\u0430\u0439\u043b",
      album: "",
      cover: "",
      genre: "",
      duration: 0,
      source: "local",
      audioUrl: "blob://client-side",
      scTrackId: null,
      scIsFull: true,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
export const POST = withRateLimit(RATE_LIMITS.upload, handler);
