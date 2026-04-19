import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import ZAI from "z-ai-web-dev-sdk";

async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }
    const userId = session.userId;

    const body = await req.json();
    const { playlistId } = body;

    if (!playlistId || typeof playlistId !== "string") {
      return NextResponse.json({ error: "playlistId required" }, { status: 400 });
    }

    // Load playlist and verify ownership
    const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist || playlist.userId !== userId) {
      return NextResponse.json(
        { error: "Плейлист не найден или нет доступа" },
        { status: 403 }
      );
    }

    // Parse tracks to analyze genres and artists
    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    try {
      tracks = JSON.parse(playlist.tracksJson || "[]");
    } catch {
      tracks = [];
    }

    // Collect genres and artists
    const genreSet = new Set<string>();
    const artistSet = new Set<string>();
    for (const t of tracks.slice(0, 30)) {
      if (t.genre) genreSet.add(t.genre);
      if (t.artist) artistSet.add(t.artist);
    }
    const genres = [...genreSet].slice(0, 5).join(", ");
    const artists = [...artistSet].slice(0, 3).join(", ");
    const existingTags = playlist.tags ? playlist.tags.split(",").filter(Boolean).slice(0, 3).join(", ") : "";

    // Build a concise, artistic prompt for the cover image (under 200 chars)
    let prompt = `Abstract album cover art for music playlist "${playlist.name}"`;
    if (genres) prompt += `, genres: ${genres}`;
    if (artists) prompt += `, artists like ${artists}`;
    if (existingTags) prompt += `, vibe: ${existingTags}`;
    prompt += ". Modern minimalist design, vibrant colors, no text, no letters, no words, no typography";

    // Ensure prompt is under 200 characters (image gen works better with concise prompts)
    if (prompt.length > 200) {
      prompt = prompt.slice(0, 197) + "...";
    }

    // Generate image using z-ai-web-dev-sdk
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({
      prompt,
      size: "1024x1024",
    });

    const imageData = response.data?.[0];
    if (!imageData?.base64) {
      return NextResponse.json(
        { error: "Не удалось сгенерировать изображение" },
        { status: 500 }
      );
    }

    const imageBase64 = imageData.base64;
    const coverUrl = `data:image/png;base64,${imageBase64}`;

    // Update playlist cover in DB (store data URL or a relative path)
    // Since it's a base64 data URL, we store it as-is for local playlists
    // For server-side DB, we also update so public playlists show the cover
    await db.playlist.update({
      where: { id: playlistId },
      data: {
        cover: coverUrl,
      },
    });

    return NextResponse.json({
      cover: coverUrl,
    });
  } catch (error) {
    console.error("POST /api/playlists/generate-cover error:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации обложки. Попробуйте позже." },
      { status: 500 }
    );
  }
}

// 3 requests per minute (image generation is expensive)
const coverGenerateLimit = { limit: 3, window: 60 };
export const POST = withRateLimit(coverGenerateLimit, postHandler);
