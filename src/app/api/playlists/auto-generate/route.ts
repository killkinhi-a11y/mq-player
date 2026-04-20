import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ZAI_BASE = process.env.ZAI_BASE_URL || "http://172.25.136.193:8080/v1";
const ZAI_KEY = process.env.ZAI_API_KEY || "Z.ai";

async function postHandler(req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId;

    const body = await req.json();
    const { playlistId, playlistName, tracks: inlineTracks } = body;

    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    let playlistNameStr = playlistName || "Плейлист";
    let playlistExistsInDb = false;

    if (playlistId && typeof playlistId === "string" && userId) {
      try {
        const playlist = await db.playlist.findUnique({ where: { id: playlistId } });
        if (playlist) {
          playlistExistsInDb = true;
          if (playlist.userId && playlist.userId !== userId) {
            return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
          }
          try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }
          if (playlist.name) playlistNameStr = playlist.name;
        }
      } catch { /* fall through */ }
    }

    if (tracks.length === 0 && Array.isArray(inlineTracks) && inlineTracks.length > 0) {
      tracks = inlineTracks;
    }

    if (tracks.length < 2) {
      return NextResponse.json({ error: "Нужно минимум 2 трека" }, { status: 400 });
    }

    const trackSummary = tracks.slice(0, 50).map((t, i) => {
      const artist = t.artist || "Unknown Artist";
      const title = t.title || "Unknown Title";
      const genre = t.genre ? ` [${t.genre}]` : "";
      return `${i + 1}. ${artist} — ${title}${genre}`;
    }).join("\n");

    // Direct fetch to ZAI API (no SDK, no config file needed)
    const completion = await fetch(`${ZAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ZAI_KEY}`,
        "X-Z-AI-From": "Z",
      },
      body: JSON.stringify({
        model: "default",
        messages: [
          {
            role: "system",
            content:
              "You are a music expert. Generate playlist tags and description in Russian. " +
              'Return ONLY valid JSON: {"tags": ["tag1","tag2","tag3"],"description": "описание"}. ' +
              "Tags: 3-8 lowercase words (genre, mood, era). Description: 1-3 sentences in Russian.",
          },
          {
            role: "user",
            content: `Generate tags and description for playlist "${playlistNameStr}":\n${trackSummary}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!completion.ok) {
      const errText = await completion.text();
      console.error("[auto-generate] API error:", completion.status, errText);
      return NextResponse.json({ error: `AI API ошибка: ${completion.status}` }, { status: 502 });
    }

    const data = await completion.json();
    const raw = data.choices?.[0]?.message?.content || "";
    console.log("[auto-generate] raw response:", raw.slice(0, 300));

    let jsonStr = raw;
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];
    }

    let result: { tags: string[]; description: string };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Не удалось обработать ответ ИИ" }, { status: 500 });
    }

    if (!Array.isArray(result.tags) || typeof result.description !== "string") {
      return NextResponse.json({ error: "Некорректный формат ответа ИИ" }, { status: 500 });
    }

    const cleanedTags = result.tags.map((t: string) => t.toLowerCase().trim()).filter(Boolean).slice(0, 10);
    const cleanedDescription = result.description.trim().slice(0, 500);

    if (playlistExistsInDb && playlistId) {
      try {
        await db.playlist.update({
          where: { id: playlistId },
          data: { tags: cleanedTags.join(","), description: cleanedDescription },
        });
      } catch { /* silent */ }
    }

    return NextResponse.json({ tags: cleanedTags, description: cleanedDescription });
  } catch (error: any) {
    console.error("[auto-generate] error:", error?.message || error);
    return NextResponse.json(
      { error: "Ошибка при генерации тегов", debug: error?.message || String(error) },
      { status: 500 }
    );
  }
}

const autoGenerateLimit = { limit: 5, window: 60 };
export const POST = withRateLimit(autoGenerateLimit, postHandler);
