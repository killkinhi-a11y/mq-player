import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchSCTracks } from "@/lib/soundcloud";
import ZAI from "z-ai-web-dev-sdk";

/**
 * AI Chat API v2 — conversational music assistant.
 *
 * v2: Enhanced with listening history context, better error handling,
 *     and fallback recommendations when LLM is unavailable.
 *
 * POST body:
 *   messages: { role: "user" | "assistant", content: string }[]
 *   tasteProfile: { genres, artists, moods, language, recentTracks, topHistoryGenres, topHistoryArtists, sessionMinutes }
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
  topHistoryGenres: string[];
  topHistoryArtists: string[];
  skippedGenres: string[];
  completedGenres: string[];
  sessionMinutes: number;
  likedCount: number;
  historyCount: number;
}

const conversationHistory = new Map<string, ChatMessage[]>();
const MAX_HISTORY = 20;
const HISTORY_TTL = 30 * 60 * 1000; // 30 minutes

function cleanHistory() {
  const now = Date.now();
  for (const [key, messages] of conversationHistory) {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (now - Date.now() > HISTORY_TTL) {
        conversationHistory.delete(key);
      }
    }
  }
}

// ── Fallback: rule-based recommendations when LLM is unavailable ──
function buildFallbackReply(userMessage: string, taste: TasteContext): { reply: string; queries: string[] } {
  const lower = userMessage.toLowerCase();
  let queries: string[] = [];
  let reply = "";

  // Detect mood/activity keywords in user message
  const moodMap: Record<string, string[]> = {
    "утр": ["morning vibes upbeat", "happy acoustic morning", "feel good pop"],
    "вечер": ["chill evening relax", "downtempo sunset calm", "smooth jazz evening"],
    "трениров": ["workout energy mix", "gym bass motivation", "high energy electronic"],
    "работ": ["focus study beats", "lofi concentration work", "ambient deep focus"],
    "груст": ["melancholic indie sad", "emotional piano sad", "dark ambient moody"],
    "вечерин": ["party dance mix", "club bangers 2025", "upbeat electronic party"],
    "дорог": ["road trip indie", "driving rock energy", "feel good road mix"],
    "сон": ["sleep ambient calm", "deep sleep piano", "meditation relax night"],
    "природ": ["acoustic nature folk", "peaceful guitar outdoor", "organic ambient calm"],
    "учёб": ["study lofi beats", "concentration classical", "focus ambient study"],
    "любов": ["romantic love songs", "tender love ballad", "sweet rnb love"],
    "бодр": ["energetic upbeat pop", "happy morning vibes", "feel good indie pop"],
    "расслаб": ["chill relax lounge", "downtempo calm evening", "soft ambient spa"],
    "энерги": ["high energy electronic", "bass boost workout", "upbeat dance party"],
    "фанк": ["groovy funk disco", "retro funk soul", "boogie funk bass"],
    "рок": ["indie rock new 2025", "alternative rock hits", "garage rock energy"],
    "электрон": ["indie electronic chill", "melodic house deep", "ambient electronic new"],
    "хип-хоп": ["hip hop new 2025", "underground hip hop beats", "lofi hip hop chill"],
    "джаз": ["modern jazz chill", "lofi jazz cafe", "jazz fusion smooth"],
  };

  // Find matching mood
  for (const [keyword, moodQueries] of Object.entries(moodMap)) {
    if (lower.includes(keyword)) {
      queries = moodQueries;
      break;
    }
  }

  // If no mood match, use user's history
  if (queries.length === 0) {
    const allGenres = [...new Set([...taste.genres, ...taste.topHistoryGenres])];
    if (allGenres.length > 0) {
      const topGenre = allGenres[0];
      queries = [
        `${topGenre} best new`,
        `${topGenre} 2025 fresh`,
        `indie ${topGenre} mix`,
      ];
    } else {
      queries = ["indie chill vibes", "alternative new music 2025", "dream pop atmospheric"];
    }
  }

  // Build reply
  const tasteHint = taste.topHistoryGenres.length > 0
    ? ` Судя по твоей истории, тебе нравится ${taste.topHistoryGenres.slice(0, 3).join(", ")}.`
    : "";

  reply = `Подобрал для тебя музыку!${tasteHint} Послушай, может что-то понравится 🎵`;

  return { reply, queries };
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

    // ── Build rich context from listening history ──
    const historyGenresStr = taste.topHistoryGenres?.join(", ") || "пока нет данных";
    const historyArtistsStr = taste.topHistoryArtists?.join(", ") || "пока нет данных";
    const recentTracksStr = taste.recentTracks?.slice(0, 8).join("; ") || "пока ничего не слушал";
    const skippedStr = taste.skippedGenres?.join(", ") || "нет";
    const completedStr = taste.completedGenres?.join(", ") || "пока нет";
    const sessionInfo = taste.sessionMinutes > 0 ? `Слушает уже ${taste.sessionMinutes} мин.` : "Новая сессия";

    const systemPrompt = `You are MQ — a friendly, knowledgeable music AI assistant inside a music player app. You help users discover new music based on their ACTUAL listening history and preferences.

YOUR PERSONALITY:
- Speak in Russian (unless the user writes in English)
- Be concise but helpful — 2-4 sentences max
- Use casual, friendly tone
- You're passionate about music and love discovering new artists
- Use music emojis sparingly: 🎵 🎧 🎶 🎹 🎸

USER'S ACTUAL LISTENING HISTORY (use this to personalize!):
- Recently played tracks: ${recentTracksStr}
- Top genres from history: ${historyGenresStr}
- Top artists from history: ${historyArtistsStr}
- Explicitly liked genres: ${taste.genres.join(", ") || "не указаны"}
- Explicitly liked artists: ${taste.artists.join(", ") || "не указаны"}
- Preferred moods: ${taste.moods.join(", ") || "не указаны"}
- Language preference: ${taste.language}
- Genres they SKIP (don't like): ${skippedStr}
- Genres they COMPLETE (love): ${completedStr}
- Stats: ${taste.likedCount} лайков, ${taste.historyCount} прослушиваний
- ${sessionInfo}

IMPORTANT RULES:
1. ALWAYS consider the user's listening history when recommending
2. If user has history, prioritize genres/artists SIMILAR to their favorites
3. NEVER recommend genres they SKIP
4. If user's history shows a clear language preference, respect it
5. For new users without history, suggest popular/mixed genres

CAPABILITIES:
1. Recommend music based on descriptions, moods, activities
2. Suggest artists similar to ones they like (based on history!)
3. Create playlists for specific occasions
4. Explain genres and musical styles
5. Analyze their listening taste and suggest new directions

WHEN RECOMMENDING MUSIC:
- Generate 2-3 SoundCloud search queries that would find great matches
- Each query should be 2-5 words in English (SoundCloud search works best in English)
- Consider user's history — if they listen to indie rock, suggest indie rock adjacent
- If user has recent tracks, find music similar to those
- Explain briefly WHY you chose these (reference their history)

IMPORTANT: When you want to recommend tracks, include your search queries in this format:
[SEARCH:query1,query2,query3]

Example: "Вижу, ты часто слушаешь инди и чилл 🎵 Вот что подошло бы: [SEARCH:indie folk atmospheric,chill electronic dreamy,downtempo evening relax]"

If the user just wants to chat without recommendations, don't include [SEARCH:...] tags.`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-10).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    let reply = "";
    let queries: string[] = [];
    let usedFallback = false;

    // ── Try LLM first ──
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 500,
      });

      reply = completion.choices?.[0]?.message?.content || "";

      // Extract search queries from reply
      const searchMatch = reply.match(/\[SEARCH:([^\]]+)\]/);
      if (searchMatch) {
        queries = searchMatch[1].split(",").map(q => q.trim()).filter(Boolean);
      }
    } catch (llmError) {
      console.error("[AI Chat] LLM error, using fallback:", llmError);
      usedFallback = true;
    }

    // ── Fallback: if LLM failed or didn't generate search queries ──
    if (!reply || (!usedFallback && queries.length === 0 && needsRecommendation(userMessage))) {
      const fallback = buildFallbackReply(userMessage, taste);
      if (!reply) {
        reply = fallback.reply;
        usedFallback = true;
      }
      if (queries.length === 0) {
        queries = fallback.queries;
      }
    }

    // ── Execute SoundCloud searches ──
    let tracks: any[] = [];
    if (queries.length > 0) {
      const uniqueQueries = [...new Set(queries)].slice(0, 3);

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
      _fallback: usedFallback,
    });
  } catch (error) {
    console.error("[AI Chat] Error:", error);
    return NextResponse.json({ error: "Failed to process AI chat" }, { status: 500 });
  }
}

/** Check if the user message is requesting music recommendations */
function needsRecommendation(message: string): boolean {
  const lower = message.toLowerCase();
  const recKeywords = [
    "подбери", "рекоменд", "посоветуй", "найди", "покажи", "включи",
    "музык", "трек", "песн", "жанр", "настро", "вайб", "mood", "music",
    "подобн", "похож", "слушать", "поиграть", "play",
    "утр", "вечер", "трениров", "работ", "дорог", "вечерин", "учёб",
    "груст", "весёл", "бодр", "расслаб", "сон", "фанк", "рок",
    "электрон", "хип-хоп", "джаз", "поп", "chill", "workout",
    "сюрприз", "новинк", "свеж",
  ];
  return recKeywords.some(kw => lower.includes(kw));
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
