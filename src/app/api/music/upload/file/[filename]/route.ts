import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// Allow sufficient time for serving large audio files
export const maxDuration = 60;

async function handler(
  request: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    const { filename } = await ctx!.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    
    const filePath = join(process.env.UPLOADS_DIR || "/tmp/uploads", filename);
    
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    
    const fileBuffer = await readFile(filePath);
    const fileStat = await stat(filePath);
    
    // Determine content type
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const contentTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'aac': 'audio/aac',
      'm4a': 'audio/mp4',
      'webm': 'audio/webm',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'public, max-age=31536000',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error("Serve upload error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 500 });
  }
}
export const GET = withRateLimit(RATE_LIMITS.read, handler);
