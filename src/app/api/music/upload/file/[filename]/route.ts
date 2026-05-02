import { NextRequest, NextResponse } from "next/server";
import { stat, createReadStream } from "fs";
import { join } from "path";
import { existsSync } from "fs";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// Allow sufficient time for serving large audio files
export const maxDuration = 60;

async function handler(
  request: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) {
  try {
    // Auth check — only logged-in users can access uploaded files
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

    const { filename } = await ctx!.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    
    const filePath = join(process.env.UPLOADS_DIR || "/tmp/uploads", filename);
    
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    
    const fileStat = await new Promise<{ size: number }>((resolve, reject) => {
      stat(filePath, (err, stats) => {
        if (err) reject(err);
        else resolve({ size: stats.size });
      });
    });
    
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

    // Stream file instead of loading entire file into memory
    const stream = createReadStream(filePath);

    return new NextResponse(stream as any, {
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
