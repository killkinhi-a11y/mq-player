import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 5 minutes max (Vercel Hobby plan limit)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const uploadsDir = process.env.UPLOADS_DIR || "/tmp/uploads";
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Use the Web API formData() to parse multipart data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }

    const originalName = file.name || "uploaded.mp3";

    // Validate extension
    const hasAudioExt = !!originalName.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm|opus|wma|aiff|alac)$/i);
    if (!hasAudioExt) {
      return NextResponse.json({ error: "Invalid file type. Only audio files are accepted." }, { status: 400 });
    }

    // Validate file size (200MB max)
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 200MB." }, { status: 400 });
    }

    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = originalName.split(".").pop() || "mp3";
    const fileName = `${uniqueId}.${ext}`;
    const filePath = join(uploadsDir, fileName);

    // Read file as ArrayBuffer and write to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    const title = originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    console.log(`[upload] Success: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    return NextResponse.json({
      id: `local_${uniqueId}`,
      title,
      artist: "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0444\u0430\u0439\u043b",
      album: "",
      cover: "",
      duration: 0,
      source: "local",
      audioUrl: `/api/music/upload/file/${fileName}`,
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
