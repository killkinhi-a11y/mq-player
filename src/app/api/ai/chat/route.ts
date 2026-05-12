import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchSCTracks } from "@/lib/soundcloud";
import ZAI from "z-ai-web-dev-sdk";

/**
 * AI Chat API — conversational music assistant.
 *
 * POST body:
 *   messages: { role: "user" | "assistant", content: string }[]
 *   tasteProfile: { genres, artists, moods, language }
 *
 * Returns:
 *   { reply: string, tracks?: Track[], queries?: string[] }
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TasteContext {
  genres: string[];
  artists: string[];
  moods: string[];
  language: string;
  recentTracks: string[];
}

const conversationHistory = new Map<string, ChatMessage[]>();
const MAX_HISTORY = 20;
const HISTORY_TTL = 30 * 60 * 1000; // 30 minutes

function cleanHistory() {
  const now = Date.now();
  for (const [key, messages] of conversationHistory) {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // Simple TTL cleanup
      if (now - Date.now() > HISTORY_TTL) {
        conversationHistory.delete(key);
      }
    }
  }
}

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages = [], tasteProfile = {}, sessionId } = body as {
      messages: ChatMessage[];
      tasteProfile: TasteContext;
      sessionId?: string;
    };

    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "No user message provided" }, { status: 400 });
    }

    // Manage conversation history
    const sid = sessionId || "default";
    if (!conversationHistory.has(sid)) {
      conversationHistory.set(sid, []);
    }
    const history = conversationHistory.get(sid)!;
    history.push(...messages.slice(-2)); // Keep last 2 messages
    if (history.length > MAX_HISTORY) {
      conversationHistory.set(sid, history.slice(-MAX_HISTORY));
    }
    cleanHistory();

    const taste = tasteProfile as TasteContext;
    const userMessage = messages[messages.length - 1].content;

    const systemPrompt = `You are MQ — a friendly, knowledgeable music AI assistant inside a music player app. You help users discover new music and answer questions about music.

YOUR PERSONALITY:
- Speak in Russian (unless the user writes in English)
- Be concise but helpful — 2-4 sentences max
- Use casual, friendly tone
- You're passionate about music and love discovering new artists
- Use music emojis sparingly: 🎵 🎧 🎶 🎹 🎸

CONTEXT ABOUT THE USER:
- Their favorite genres: ${taste.genres.join(", ") || "неизвестны"}
- Their favorite artists: ${taste.artists.join(", ") || "неизвестны"}
- Their preferred moods: ${taste.moods.join(", ") || "неизвестны"}
- Language preference: ${taste.language}

CAPABILITIES:
1. Recommend music based on descriptions, moods, activities
2. Suggest artists similar to ones they like
3. Create playlists for specific occasions
4. Explain genres and musical styles

WHEN RECOMMENDING MUSIC:
- Generate 2-3 SoundCloud search queries that would find great matches
- Each query should be 2-5 words in English (SoundCloud search works best in English)
- Explain briefly WHY you chose these queries

IMPORTANT: When you want to recommend tracks, include your search queries in this format:
[SEARCH:query1,query2,query3]

Example: "Для такой атмосферы отлично подойдёт что-то атмосферное [SEARCH:ambient piano calm,downtempo chill evening,lofi night relax]"

If the user just wants to chat without recommendations, don't include [SEARCH:...] tags.`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-10).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 400,
    });

    const reply = completion.choices?.[0]?.message?.content || "Извини, не удалось сгенерировать ответ. Попробуй ещё раз!";

    // Extract search queries from reply
    const searchMatch = reply.match(/\[SEARCH:([^\]]+)\]/);
    let tracks: any[] = [];
    let queries: string[] = [];

    if (searchMatch) {
      queries = searchMatch[1].split(",").map(q => q.trim()).filter(Boolean);
      const uniqueQueries = [...new Set(queries)].slice(0, 3);

      // Execute searches in parallel
      const searchPromises = uniqueQueries.map(async (q) => {
        try {
          return await searchSCTracks(q, 8);
        } catch {
          return [];
        }
      });

      const searchResults = await Promise.allSettled(searchPromises);
      const seen = new Set<number>();

      for (const result of searchResults) {
        if (result.status === "fulfilled") {
          for (const t of result.value) {
            if (!t.scTrackId || seen.has(t.scTrackId)) continue;
            seen.add(t.scTrackId);
            tracks.push({
              id: t.id,
              title: t.title,
              artist: t.artist,
              album: t.album || "",
              duration: t.duration,
              cover: t.cover,
              genre: t.genre,
              audioUrl: t.audioUrl,
              previewUrl: t.previewUrl,
              source: t.source,
              scTrackId: t.scTrackId,
              scStreamPolicy: t.scStreamPolicy,
              scIsFull: t.scIsFull,
            });
          }
        }
      }
    }

    // Store assistant reply in history
    history.push({ role: "assistant", content: reply });

    return NextResponse.json({
      reply,
      tracks: tracks.slice(0, 15),
      queries,
    });
  } catch (error) {
    console.error("[AI Chat] Error:", error);
    return NextResponse.json({ error: "Failed to process AI chat" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.medium, handler);

// GET handler: clear session history
async function clearHandler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sessionId") || "default";
  conversationHistory.delete(sid);
  return NextResponse.json({ ok: true });
}

export { clearHandler as GET };
