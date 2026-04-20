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
    const userId = session?.userId;

    const body = await req.json();
    const { playlistId, playlistName, tracks: inlineTracks } = body;

    // We need either tracks sent inline or a playlistId to look up from DB
    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    let playlistNameStr = playlistName || "Плейлист";
    let playlistExistsInDb = false;

    // Try to load from DB if playlistId provided
    if (playlistId && typeof playlistId === "string" && userId) {
      try {
        const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
        if (playlist) {
          playlistExistsInDb = true;
          // Verify ownership (only if playlist has a userId — published playlists)
          if (playlist.userId && playlist.userId !== userId) {
            return NextResponse.json(
              { error: "Нет доступа к этому плейлисту" },
              { status: 403 }
            );
          }
          try {
            tracks = JSON.parse(playlist.tracksJson || "[]");
          } catch {
            tracks = [];
          }
          if (playlist.name) playlistNameStr = playlist.name;
        }
      } catch {
        // Table might not exist yet (DB not synced) — fall through to inline tracks
      }
    }

    // Use inline tracks if DB had none
    if (tracks.length === 0 && Array.isArray(inlineTracks) && inlineTracks.length > 0) {
      tracks = inlineTracks;
    }

    if (tracks.length < 2) {
      return NextResponse.json(
        { error: "Нужно минимум 2 трека для генерации" },
        { status: 400 }
      );
    }

    // Build track list summary for LLM (limit to first 50 tracks)
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
          content: `Generate tags and description for a playlist named "${playlistNameStr}" with these tracks:\n${trackSummary}`,
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

    if (!Array.isArray(result.tags) || typeof result.description !== "string") {
      return NextResponse.json(
        { error: "Некорректный формат ответа ИИ. Попробуйте снова." },
        { status: 500 }
      );
    }

    // Clean tags
    const cleanedTags = result.tags
      .map((t: string) => t.toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 10);

    const cleanedDescription = result.description.trim().slice(0, 500);

    // Update playlist in DB if it exists there
    if (playlistExistsInDb && playlistId) {
      try {
        await db.playlist.update({
          where: { id: playlistId },
          data: {
            tags: cleanedTags.join(","),
            description: cleanedDescription,
          },
        });
      } catch {
        // Silently fail — client will update locally anyway
      }
    }

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
