import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";
import { getZaiBaseUrl } from "@/lib/ai-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Map genres to visual themes (no text, no artist names)
const GENRE_VISUAL: Record<string, string> = {
  "hip-hop": "dark urban graffiti aesthetics, street culture, bold geometric shapes, neon accents on black",
  "hip hop": "dark urban graffiti aesthetics, street culture, bold geometric shapes, neon accents on black",
  "rap": "dark urban graffiti aesthetics, street culture, bold geometric shapes, neon accents on black",
  "pop": "vibrant pastel gradients, soft pink purple blue, bubbly abstract shapes, dreamy light",
  "rock": "rough textured surfaces, fire red and black, cracked marble, electric energy, sharp angles",
  "electronic": "digital circuit patterns, glowing neon lines on dark background, futuristic grid, synthwave",
  "edm": "digital circuit patterns, glowing neon lines on dark background, futuristic grid, synthwave",
  "techno": "minimal dark geometric patterns, deep blue and black, repetitive angular shapes, industrial",
  "house": "warm sunset gradients, orange and purple, smooth flowing curves, disco ball reflections",
  "jazz": "warm amber and brown tones, saxophone curves abstracted, smoke wisps, vintage vinyl texture",
  "classical": "elegant gold swirls on cream background, ornate baroque patterns, soft marble texture",
  "r&b": "smooth velvety textures, deep purple and rose gold, sensual flowing curves, warm glow",
  "rnb": "smooth velvety textures, deep purple and rose gold, sensual flowing curves, warm glow",
  "indie": "vintage film grain aesthetic, muted earth tones, retro sunsets, polaroid color palette",
  "metal": "dark metallic textures, silver and crimson, jagged shards, thunder and lightning motifs",
  "punk": "ripped paper collage aesthetic, black and red, chaotic splashes, distressed textures",
  "lo-fi": "cozy rainy window aesthetic, soft blue and grey, watercolor blur, warm lamplight glow",
  "lofi": "cozy rainy window aesthetic, soft blue and grey, watercolor blur, warm lamplight glow",
  "chill": "calm ocean waves, soft teal and lavender, gentle gradients, floating bokeh lights",
  "ambient": "ethereal cosmic nebula, deep space colors, aurora borealis, floating particles",
  "soul": "golden hour warmth, rich amber and brown, flowing silk textures, vintage soul vibe",
  "reggae": "tropical green yellow red gradients, palm leaf patterns, warm sunshine, island vibes",
  "folk": "earthy green and brown watercolor, forest landscape abstracted, natural organic shapes",
  "country": "golden wheat fields at sunset, warm brown and orange, rustic wood texture, wide open sky",
  "blues": "deep midnight blue and gold, rain on window abstracted, melancholic flowing lines",
  "funk": "retro disco ball, rainbow prismatic reflections, 70s groove aesthetic, bold color blocks",
  "drill": "dark moody atmosphere, deep purple and black, sharp crystalline shapes, underground",
  "trap": "dark purple and teal neon, metallic textures, sharp geometric patterns, bass-heavy energy",
  "phonk": "vintage VHS aesthetic, purple and red, retro car silhouettes abstracted, grainy texture",
  "alternative": "surreal dreamlike landscape, unexpected color combinations, flowing organic forms",
  "anime": "cherry blossom pink and sky blue, soft anime sky gradients, sparkles, ethereal light",
};

function getVisualTheme(genres: string[], artists: string[]): string {
  const parts: string[] = [];
  const matched = new Set<string>();

  for (const genre of genres) {
    const g = genre.toLowerCase().trim();
    for (const [key, visual] of Object.entries(GENRE_VISUAL)) {
      if (g.includes(key) && !matched.has(key)) {
        parts.push(visual);
        matched.add(key);
      }
    }
  }

  // Default if no genres matched
  if (parts.length === 0) {
    parts.push("abstract geometric art, vibrant color gradients, modern album art style");
  }

  return parts.slice(0, 3).join(", ");
}

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
    const genres = [...genreSet].slice(0, 5);
    const artists = [...artistSet].slice(0, 3);

    const visualTheme = getVisualTheme(genres, artists);

    // Build prompt with ONLY visual descriptions — no text, no words, no names
    let prompt = visualTheme;
    prompt += ". Abstract album cover artwork";
    prompt += ". Absolutely no text, no letters, no numbers, no words, no typography, no writing, no symbols, no logos";
    prompt += ". Pure visual art with shapes, colors, gradients, textures, light and shadow only";
    prompt += ". High quality, professional album art, square format";

    const ZAI_BASE = getZaiBaseUrl();

    console.log("[generate-cover] prompt:", prompt);

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
