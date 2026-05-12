import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchSCTracks } from "@/lib/soundcloud";
import ZAI from "z-ai-web-dev-sdk";

/**
 * AI Recommendations API — generates personalized track recommendations
 * using an LLM to analyze the user's taste profile and create smart search queries.
 *
 * Flow:
 * 1. Receive user taste profile (genres, artists, moods, history, feedback)
 * 2. Send to LLM with a structured prompt
 * 3. LLM returns 5-8 targeted search queries + reasoning
 * 4. Execute queries via SoundCloud search
 * 5. Deduplicate, score, and return top tracks
 */

interface TasteProfile {
  topGenres: string[];
  topArtists: string[];
  moods: string[];
  recentTrackTitles: string[];
  skippedGenres: string[];
  completedGenres: string[];
  languagePreference: string;
  timeOfDay: string;
  sessionMinutes: number;
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

async function generateAIQueries(profile: TasteProfile): Promise<{
  queries: { query: string; reason: string }[];
  summary: string;
}> {
  const zai = await ZAI.create();

  const systemPrompt = `You are an expert music curator AI for a music player app. Given a user's listening taste profile, generate 6 highly targeted SoundCloud search queries that will discover amazing music they'll love.

RULES:
- Generate EXACTLY 6 search queries
- Each query should be 2-5 words, optimized for SoundCloud search
- Mix: 2 queries for known favorites (deeper cuts), 2 for genre exploration (adjacent genres), 2 for mood/vibe matches
- Queries should NOT just be genre names — use creative combinations like "deep house vocal chill" or "indie folk atmospheric"
- Consider the time of day for energy levels
- Consider language preference (russian/english)
- Avoid genres the user has been skipping
- Focus on genres the user completes/listens to fully
- Return queries in English (SoundCloud works best with English queries)
- Be creative and specific — "lofi hip hop study beats" is better than just "lofi"

RESPOND WITH VALID JSON ONLY:
{
  "queries": [
    { "query": "...", "reason": "..." },
    ...
  ],
  "summary": "One sentence summary of the recommendation strategy in Russian"
}`;

  const userMessage = `Here is the user's taste profile:

Top genres: ${profile.topGenres.join(", ") || "none yet"}
Top artists: ${profile.topArtists.join(", ") || "none yet"}
Preferred moods: ${profile.moods.join(", ") || "unknown"}
Recently played: ${profile.recentTrackTitles.slice(0, 10).join("; ") || "nothing yet"}
Genres they SKIP (dislike): ${profile.skippedGenres.join(", ") || "none"}
Genres they COMPLETE (love): ${profile.completedGenres.join(", ") || "none"}
Language preference: ${profile.languagePreference}
Current time: ${profile.timeOfDay}
Listening session duration: ${profile.sessionMinutes} minutes

Generate 6 search queries for this user.`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 600,
    });

    const content = completion.choices?.[0]?.message?.content || "";
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        queries: (parsed.queries || []).slice(0, 6),
        summary: parsed.summary || "Персональные рекомендации на основе ваших предпочтений",
      };
    }
  } catch (error) {
    console.error("[AI Recs] LLM error:", error);
  }

  // Fallback: generate basic queries from genres
  const fallbackQueries = profile.topGenres.slice(0, 6).map(g => ({
    query: `${g} 2025`,
    reason: `Популярные треки в жанре ${g}`,
  }));
  return {
    queries: fallbackQueries.length > 0 ? fallbackQueries : [
      { query: "indie electronic chill", reason: "Популярная смесь" },
    ],
    summary: "Персональные рекомендации на основе ваших предпочтений",
  };
}

// Cache AI recommendations for 15 minutes
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000;

function getCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiry <= now) cache.delete(k);
    }
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Build taste profile from query params
    const topGenres = (searchParams.get("genres") || "").split(",").filter(Boolean);
    const topArtists = (searchParams.get("artists") || "").split(",").filter(Boolean);
    const moods = (searchParams.get("moods") || "").split(",").filter(Boolean);
    const recentTitles = (searchParams.get("recentTitles") || "").split("|").filter(Boolean);
    const skippedGenres = (searchParams.get("skippedGenres") || "").split(",").filter(Boolean);
    const completedGenres = (searchParams.get("completedGenres") || "").split(",").filter(Boolean);
    const language = searchParams.get("lang") || "mixed";
    const sessionMinutes = parseInt(searchParams.get("sessionMinutes") || "0");
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20") || 20), 50);

    const profile: TasteProfile = {
      topGenres,
      topArtists,
      moods,
      recentTrackTitles: recentTitles,
      skippedGenres,
      completedGenres,
      languagePreference: language,
      timeOfDay: getTimeOfDay(),
      sessionMinutes,
    };

    // Check cache
    const cacheKey = `ai-recs:${JSON.stringify({ topGenres, topArtists, moods, language })}`;
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Step 1: Generate AI search queries
    const aiResult = await generateAIQueries(profile);

    // Step 2: Execute searches in parallel
    const searchPromises = aiResult.queries.map(async (q) => {
      try {
        const tracks = await searchSCTracks(q.query, 10);
        return tracks.map(t => ({
          ...t,
          _aiReason: q.reason,
          _aiQuery: q.query,
        }));
      } catch {
        return [];
      }
    });

    const searchResults = await Promise.allSettled(searchPromises);
    const allTracks: any[] = [];
    for (const result of searchResults) {
      if (result.status === "fulfilled") {
        allTracks.push(...result.value);
      }
    }

    // Step 3: Deduplicate by scTrackId
    const seen = new Set<number>();
    const unique = allTracks.filter(t => {
      if (!t.scTrackId || seen.has(t.scTrackId)) return false;
      seen.add(t.scTrackId);
      return true;
    });

    // Step 4: Score and sort
    const scored = unique.map(t => {
      let score = Math.random() * 5; // Base randomness

      // Prefer full tracks
      if (t.scIsFull) score += 20;

      // Prefer tracks with cover art
      if (t.cover) score += 10;

      // Genre match bonus
      const genre = (t.genre || "").toLowerCase();
      for (const g of topGenres) {
        if (genre.includes(g.toLowerCase()) || g.toLowerCase().includes(genre)) {
          score += 15;
          break;
        }
      }

      // Artist match bonus
      const artist = (t.artist || "").toLowerCase();
      for (const a of topArtists) {
        if (artist.includes(a.toLowerCase()) || a.toLowerCase().includes(artist)) {
          score += 10;
          break;
        }
      }

      // Language preference
      const text = `${t.title || ""} ${t.artist || ""}`;
      const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      const total = cyrillic + latin;
      if (total > 0) {
        if (language === "russian" && cyrillic / total > 0.4) score += 8;
        if (language === "english" && latin / total > 0.6) score += 8;
      }

      // Duration quality
      if (t.duration > 120 && t.duration < 420) score += 5;

      return { ...t, _score: score };
    }).sort((a, b) => b._score - a._score);

    const tracks = scored.slice(0, limit).map(t => ({
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
      _aiReason: t._aiReason,
      _aiQuery: t._aiQuery,
    }));

    // Build category rows
    const categories: { id: string; title: string; icon: string; tracks: typeof tracks }[] = [];

    // Group tracks by their AI query reason
    const queryGroups = new Map<string, typeof tracks>();
    for (const t of tracks) {
      const key = t._aiReason || "Для вас";
      if (!queryGroups.has(key)) queryGroups.set(key, []);
      queryGroups.get(key)!.push(t);
    }

    const icons = ["Sparkles", "Waves", "Compass", "Mic2", "Music", "Activity"];
    let iconIdx = 0;
    for (const [reason, groupTracks] of queryGroups) {
      if (groupTracks.length >= 2) {
        categories.push({
          id: `ai-${iconIdx}`,
          title: reason,
          icon: icons[iconIdx % icons.length],
          tracks: groupTracks,
        });
        iconIdx++;
      }
    }

    const responseData = {
      tracks,
      categories,
      _meta: {
        queriesUsed: aiResult.queries.map(q => q.query),
        aiSummary: aiResult.summary,
        totalFound: allTracks.length,
        uniqueCount: unique.length,
      },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[AI Recs] Error:", error);
    return NextResponse.json({ error: "Failed to generate AI recommendations" }, { status: 500 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
