import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { createZAI } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId;

    const body = await req.json();
    const { playlistId, playlistName: inlineName, tracks: inlineTracks } = body;

    if (!playlistId || typeof playlistId !== "string") {
      return NextResponse.json({ error: "playlistId required" }, { status: 400 });
    }

    // Try to load from DB — but also support local playlists (not in DB)
    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    let playlistNameStr = inlineName || "Playlist";
    let playlistExistsInDb = false;
    let existingTags = "";

    const playlist = userId ? await db.playlist.findUnique({ where: { id: playlistId } }) : null;
    if (playlist) {
      playlistExistsInDb = true;
      if (playlist.userId !== userId) {
        return NextResponse.json(
          { error: "Плейлист не найден или нет доступа" },
          { status: 403 }
        );
      }
      try {
        tracks = JSON.parse(playlist.tracksJson || "[]");
      } catch {
        tracks = [];
      }
      if (playlist.name) playlistNameStr = playlist.name;
      existingTags = playlist.tags ? playlist.tags.split(",").filter(Boolean).slice(0, 3).join(", ") : "";
    }

    // Use inline tracks if DB had none (local playlist)
    if (tracks.length === 0 && Array.isArray(inlineTracks) && inlineTracks.length > 0) {
      tracks = inlineTracks;
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

    // Build a concise, artistic prompt for the cover image (under 200 chars)
    let prompt = `Abstract album cover art for music playlist "${playlistNameStr}"`;
    if (genres) prompt += `, genres: ${genres}`;
    if (artists) prompt += `, artists like ${artists}`;
    if (existingTags) prompt += `, vibe: ${existingTags}`;
    prompt += ". Modern minimalist design, vibrant colors, no text, no letters, no words, no typography";

    // Ensure prompt is under 200 characters (image gen works better with concise prompts)
    if (prompt.length > 200) {
      prompt = prompt.slice(0, 197) + "...";
    }

    // Generate image using z-ai-web-dev-sdk
    const zai = await createZAI();
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

    // Update playlist cover in DB only if it exists there (not for local-only playlists)
    if (playlistExistsInDb) {
      await db.playlist.update({
        where: { id: playlistId },
        data: {
          cover: coverUrl,
        },
      });
    }

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
