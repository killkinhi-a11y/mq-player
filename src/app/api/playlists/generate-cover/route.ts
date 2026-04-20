import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { getZaiBaseUrl } from "@/lib/ai-proxy";

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

    let tracks: { title?: string; artist?: string; genre?: string }[] = [];
    let playlistNameStr = inlineName || "Playlist";
    let playlistExistsInDb = false;
    let existingTags = "";

    const playlist = userId ? await db.playlist.findUnique({ where: { id: playlistId } }) : null;
    if (playlist) {
      playlistExistsInDb = true;
      if (playlist.userId !== userId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      try { tracks = JSON.parse(playlist.tracksJson || "[]"); } catch { tracks = []; }
      if (playlist.name) playlistNameStr = playlist.name;
      existingTags = playlist.tags ? playlist.tags.split(",").filter(Boolean).slice(0, 3).join(", ") : "";
    }

    if (tracks.length === 0 && Array.isArray(inlineTracks) && inlineTracks.length > 0) {
      tracks = inlineTracks;
    }

    const genreSet = new Set<string>();
    const artistSet = new Set<string>();
    for (const t of tracks.slice(0, 30)) {
      if (t.genre) genreSet.add(t.genre);
      if (t.artist) artistSet.add(t.artist);
    }
    const genres = [...genreSet].slice(0, 5).join(", ");
    const artists = [...artistSet].slice(0, 3).join(", ");

    let prompt = `Abstract album cover art for music playlist "${playlistNameStr}"`;
    if (genres) prompt += `, genres: ${genres}`;
    if (artists) prompt += `, artists like ${artists}`;
    if (existingTags) prompt += `, vibe: ${existingTags}`;
    prompt += ". Pure abstract art, NO text, NO letters, NO words, NO numbers, NO typography, NO symbols, ONLY shapes colors gradients and textures";

    if (prompt.length > 250) prompt = prompt.slice(0, 247) + "...";

    const ZAI_BASE = await getZaiBaseUrl();

    const imgResponse = await fetch(`${ZAI_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size: "1024x1024" }),
    });

    if (!imgResponse.ok) {
      const errText = await imgResponse.text();
      console.error("[generate-cover] API error:", imgResponse.status, errText);
      return NextResponse.json({ error: `AI API ошибка: ${imgResponse.status}` }, { status: 502 });
    }

    const imgData = await imgResponse.json();
    const imageUrl = imgData.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: "Не удалось сгенерировать изображение" }, { status: 500 });
    }

    // Download image and convert to base64
    const imgBlob = await fetch(imageUrl);
    if (!imgBlob.ok) {
      return NextResponse.json({ error: "Не удалось загрузить изображение" }, { status: 500 });
    }
    const buffer = Buffer.from(await imgBlob.arrayBuffer());
    const base64 = buffer.toString("base64");
    const coverUrl = `data:image/png;base64,${base64}`;

    if (playlistExistsInDb) {
      await db.playlist.update({ where: { id: playlistId }, data: { cover: coverUrl } });
    }

    return NextResponse.json({ cover: coverUrl });
  } catch (error: any) {
    console.error("[generate-cover] error:", error?.message || error);
    return NextResponse.json(
      { error: "Ошибка при генерации обложки", debug: error?.message || String(error) },
      { status: 500 }
    );
  }
}

const coverGenerateLimit = { limit: 3, window: 60 };
export const POST = withRateLimit(coverGenerateLimit, postHandler);
