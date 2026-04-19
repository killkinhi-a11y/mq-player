import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

    // Parse tracks
    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    try {
      tracks = JSON.parse(playlist.tracksJson || "[]");
    } catch {
      tracks = [];
    }

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "Плейлист пуст — добавьте треки для генерации тегов" },
        { status: 400 }
      );
    }

    // Build track list summary for LLM (limit to first 50 tracks to avoid token overflow)
    const trackSummary = tracks.slice(0, 50).map((t, i) => {
      const artist = t.artist || "Unknown Artist";
      const title = t.title || "Unknown Title";
      const genre = t.genre ? ` [${t.genre}]` : "";
      return `${i + 1}. ${artist} — ${title}${genre}`;
    }).join("\n");

    // Use AI to generate tags and description
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You are a music expert. Generate playlist tags and description in Russian. " +
            'Return ONLY valid JSON in this exact format: {"tags": ["tag1","tag2","tag3"],"description": "описание плейлиста"}. ' +
            "Tags should be 3-8 lowercase single words in Russian or English (genre, mood, era). " +
            "Description should be 1-3 sentences in Russian, creative and appealing. " +
            "Do NOT include any other text outside the JSON.",
        },
        {
          role: "user",
          content: `Generate tags and description for a playlist named "${playlist.name}" with these tracks:\n${trackSummary}`,
        },
      ],
      temperature: 0.7,
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices?.[0]?.message?.content || "";

    // Extract JSON from response (handle possible markdown code blocks)
    let jsonStr = raw;
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find JSON object directly
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    let result: { tags: string[]; description: string };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Не удалось обработать ответ ИИ. Попробуйте снова." },
        { status: 500 }
      );
    }

    // Validate result structure
    if (!Array.isArray(result.tags) || typeof result.description !== "string") {
      return NextResponse.json(
        { error: "Некорректный формат ответа ИИ. Попробуйте снова." },
        { status: 500 }
      );
    }

    // Clean tags: lowercase, trim, filter empty, max 10
    const cleanedTags = result.tags
      .map((t: string) => t.toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 10);

    // Clean description
    const cleanedDescription = result.description.trim().slice(0, 500);

    // Update playlist in DB
    await db.playlist.update({
      where: { id: playlistId },
      data: {
        tags: cleanedTags.join(","),
        description: cleanedDescription || playlist.description,
      },
    });

    return NextResponse.json({
      tags: cleanedTags,
      description: cleanedDescription,
    });
  } catch (error) {
    console.error("POST /api/playlists/auto-generate error:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации тегов. Попробуйте позже." },
      { status: 500 }
    );
  }
}

// 5 requests per minute
const autoGenerateLimit = { limit: 5, window: 60 };
export const POST = withRateLimit(autoGenerateLimit, postHandler);
