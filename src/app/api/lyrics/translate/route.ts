import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withAuth, validateContentType } from "@/lib/withAuth";
import ZAI from "z-ai-web-dev-sdk";

/**
 * POST /api/lyrics/translate
 * Body: { lyrics, sourceLanguage }
 * Returns: { translated }
 *
 * Uses Z-AI LLM to translate non-Russian lyrics to Russian.
 * Preserves LRC time tags if present (translates only the text between tags).
 */
async function handler(
  req: NextRequest,
  _ctx: { params: Promise<Record<string, string>>; userId: string; userRole: string }
) {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }

    const { lyrics, sourceLanguage } = await req.json() as {
      lyrics: string;
      sourceLanguage: string;
    };

    if (!lyrics || lyrics.trim().length < 10) {
      return NextResponse.json({ error: "lyrics required" }, { status: 400 });
    }

    if (sourceLanguage === "russian") {
      return NextResponse.json({ translated: null, reason: "already Russian" });
    }

    // Check if LRC format (has time tags)
    const isLRC = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);

    const systemPrompt = `You are a professional lyrics translator. Translate the following song lyrics from ${sourceLanguage === "cjk" ? "Japanese/Korean/Chinese" : sourceLanguage} to Russian.

RULES:
- Preserve the meaning and emotional tone of the original
- Make the translation sound natural in Russian (not literal word-for-word)
- Keep line breaks exactly as in the original
${isLRC ? "- PRESERVE all [mm:ss.xx] time tags EXACTLY as they are — only translate the text AFTER each tag on the same line" : ""}
- Do NOT add any commentary, notes, or explanations
- If a line is already in Russian or is an instrumental marker, keep it as-is
- Return ONLY the translated lyrics, nothing else`;

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: lyrics },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const translated = completion.choices?.[0]?.message?.content || "";

    if (!translated.trim()) {
      return NextResponse.json({ error: "Translation empty" }, { status: 500 });
    }

    return NextResponse.json({ translated: translated.trim() });
  } catch (error) {
    console.error("[Lyrics Translate] Error:", error);
    return NextResponse.json({ error: "Ошибка перевода" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.medium, withAuth(handler));
