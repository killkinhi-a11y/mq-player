import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  normalizeGenre, estimateEnergy, detectLanguage,
  hasNoiseKeywords, titleHashtagGenreMismatch,
  fetchSCTrackRelated, getFromCache, setCache,
} from "@/lib/music-utils";

/**
 * "Моя волна" Radio API v3 — полная переработка с нуля.
 *
 * Старый v2 был 1180 строк с 11 источниками кандидатов включая random
 * vibe queries ("chill vibes new", "deep focus", "late night drive") —
 * это давало мусор не связанный с вкусом пользователя.
 *
 * v3 принципы (как Spotify Radio):
 * 1. SEED-BASED: current track + 2 history tracks → /related API
 * 2. LIKED ARTISTS: search by user's liked artists (top 3)
 * 3. NO RANDOM VIBE QUERIES — только то что связано с пользователем
 * 4. DIVERSITY: max 1 track per artist per batch
 * 5. QUALITY: hard filter spam/AI/low-effort content
 * 6. NO CACHE — radio должен возвращать разные треки каждый раз
 */

// ── Cache DISABLED — radio must return different tracks each call ──
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 0;

// ── Content quality (minimal, effective) ──
const SPAM_KEYWORDS = [
  "free download", "type beat", "subscribe", "follow me", "link in bio",
  "buy now", "purchase", "made by ai", "ai generated", "suno", "udio",
  "test", "untitled", "ringtone", "notification", "alarm",
  "dj set", "live mix", "podcast", "tutorial", "how to",
];

function isSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

function isLowQuality(track: SCTrack): boolean {
  const title = (track.title || "").trim();
  const artist = (track.artist || "").trim();
  if (title.length < 3) return true;
  if (artist.length < 2) return true;
  if (/(.)\1{5,}/.test(title)) return true;
  const combined = `${title} ${artist}`.toLowerCase();
  if (isSpam(combined)) return true;
  if (!track.cover) return true;
  if (track.duration && track.duration < 30) return true;
  if (track.duration && track.duration > 1200) return true;
  return false;
}

interface RadioTrack {
  id: string; title: string; artist: string; album: string;
  duration: number; cover: string; genre: string;
  audioUrl: string; previewUrl: string; source: string;
  scTrackId: number; scStreamPolicy: string; scIsFull: boolean;
  /** Honest recommendation context (Wave UI). */
  _reason?: string;
  _seedArtist?: string;
}

function mapToRadioTrack(t: SCTrack, reason?: string, seedArtist?: string): RadioTrack {
  return {
    id: t.id, title: t.title, artist: t.artist, album: t.album,
    duration: t.duration, cover: t.cover, genre: t.genre,
    audioUrl: t.audioUrl, previewUrl: t.previewUrl, source: "soundcloud",
    scTrackId: t.scTrackId, scStreamPolicy: t.scStreamPolicy, scIsFull: t.scIsFull,
    // Honest recommendation context (surfaced by the Wave UI):
    //   related_current / related_history / liked_artist
    _reason: reason,
    _seedArtist: seedArtist,
  };
}

// ── Artist-aware interleaving ──
function interleaveByArtist<T extends { artist: string }>(tracks: T[]): T[] {
  if (tracks.length <= 2) return tracks;
  const result: T[] = [];
  const remaining = [...tracks];
  let lastArtist: string | null = null;
  while (remaining.length > 0) {
    let pickedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const a = (remaining[i].artist || "").toLowerCase().trim();
      if (a !== lastArtist) { pickedIdx = i; break; }
    }
    if (pickedIdx === -1) pickedIdx = 0;
    const picked = remaining.splice(pickedIdx, 1)[0];
    lastArtist = (picked.artist || "").toLowerCase().trim();
    result.push(picked);
  }
  return result;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ── Parse parameters ──
  const scTrackIdParam = searchParams.get("scTrackId");
  const historyScIdsParam = searchParams.get("historyScIds") || "";
  const skippedArtistsParam = searchParams.get("skippedArtists") || "";
  const skippedGenresParam = searchParams.get("skippedGenres") || "";
  const likedArtistsParam = searchParams.get("likedArtists") || "";
  const likedGenresParam = searchParams.get("likedGenres") || "";
  const dislikedScIdsParam = searchParams.get("dislikedScIds") || "";
  const langParam = searchParams.get("lang") || "";
  // Heavy-rotation fatigue: artists played >=2 times recently (excluding
  // explicitly liked ones) get a SOFT score penalty — the wave stops echoing
  // the same 3 artists across batches without ever hiding favourites.
  const recentArtistsParam = searchParams.get("recentArtists") || "";
  // Honest seed context (from the client's CURRENT track — real data only).
  const seedArtistParam = searchParams.get("seedArtist") || "";
  const seedGenreParam = searchParams.get("seedGenre") || "";

  if (!scTrackIdParam) {
    return NextResponse.json({ error: "Missing scTrackId" }, { status: 400 });
  }

  const scTrackId = Number(scTrackIdParam);
  if (isNaN(scTrackId) || scTrackId <= 0) {
    return NextResponse.json({ error: "Invalid scTrackId" }, { status: 400 });
  }

  const historyScIds: number[] = historyScIdsParam.split(",").filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  const dislikedScIds: number[] = dislikedScIdsParam.split(",").filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);

  // Exclusion sets
  const excludedScIds = new Set<number>([scTrackId, ...historyScIds, ...dislikedScIds]);
  const skippedArtists = new Set(skippedArtistsParam.split(",").filter(Boolean).map(a => a.toLowerCase().trim()));
  const likedArtists = new Set(likedArtistsParam.split(",").filter(Boolean).map(a => a.toLowerCase().trim()));
  const likedGenres = new Set(likedGenresParam.split(",").filter(Boolean).map(g => normalizeGenre(g)));
  const langPref = (langParam === "russian" || langParam === "english") ? langParam : null;
  const fatigueArtists = new Set(
    recentArtistsParam.split(",").filter(Boolean).map(a => a.toLowerCase().trim())
  );

  // ── Cache check (disabled — TTL=0) ──
  const cacheKey = `radio-v4:${scTrackId}:${historyScIdsParam}:${skippedArtistsParam}:${likedArtistsParam}:${dislikedScIdsParam}:${langParam}:${recentArtistsParam}:${seedArtistParam}`;
  const cached = getFromCache(cacheKey, cache);
  if (cached) return NextResponse.json(cached);

  try {
    // ════════════════════════════════════════════════════════════════════
    // PHASE 1: SEED-BASED — /related for current + 2 history tracks
    // ════════════════════════════════════════════════════════════════════
    const seedIds = [scTrackId, ...historyScIds.slice(0, 2)];
    const relatedPromises = seedIds.map(id => fetchSCTrackRelated(id));
    const relatedResults = await Promise.allSettled(relatedPromises);

    // Track map: scTrackId → { track, source, seedArtist }
    // seedArtist = which seed produced this candidate (current track's artist
    // or the history seed's artist) — honest "why this track" context.
    type Source = "current_related" | "history_related" | "artist_search";
    const trackMap = new Map<number, { track: SCTrack; source: Source; seedArtist?: string }>();

    for (let i = 0; i < relatedResults.length; i++) {
      const result = relatedResults[i];
      if (result.status !== "fulfilled") continue;
      const source: Source = i === 0 ? "current_related" : "history_related";
      // seedArtist is only attributed where it is KNOWN to be true: the
      // current seed's artist comes from the client (seedArtist param).
      // History seeds: no per-seed attribution (the UI stays generic-but-honest).
      const seedArtist = source === "current_related" ? seedArtistParam : undefined;
      for (const track of result.value) {
        if (excludedScIds.has(track.scTrackId)) continue;
        if (isLowQuality(track)) continue;
        // Skip disliked artists
        const artistLower = (track.artist || "").toLowerCase().trim();
        if (artistLower && skippedArtists.has(artistLower)) continue;
        if (!trackMap.has(track.scTrackId)) {
          trackMap.set(track.scTrackId, { track, source, seedArtist });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // PHASE 2: LIKED ARTISTS SEARCH (only if not enough tracks)
    // ════════════════════════════════════════════════════════════════════
    if (trackMap.size < 20 && likedArtists.size > 0) {
      const topArtists = [...likedArtists].slice(0, 3);
      const artistPromises = topArtists.map(a => searchSCTracks(`"${a}"`, 10));
      const artistResults = await Promise.allSettled(artistPromises);
      for (let ai = 0; ai < artistResults.length; ai++) {
        const result = artistResults[ai];
        if (result.status !== "fulfilled") continue;
        for (const track of result.value) {
          if (excludedScIds.has(track.scTrackId)) continue;
          if (isLowQuality(track)) continue;
          const artistLower = (track.artist || "").toLowerCase().trim();
          if (artistLower && skippedArtists.has(artistLower)) continue;
          if (!trackMap.has(track.scTrackId)) {
            // Quoted search on the liked artist → attribution is exact.
            trackMap.set(track.scTrackId, { track, source: "artist_search", seedArtist: topArtists[ai] });
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // SCORING + SORTING
    // ════════════════════════════════════════════════════════════════════
    const scored: { track: SCTrack; score: number; source: Source; seedArtist?: string }[] = [];
    for (const { track, source, seedArtist } of trackMap.values()) {
      let score = 0;

      // Source priority
      if (source === "current_related") score += 80;
      else if (source === "history_related") score += 50;
      else score += 20;

      // Playable bonus
      if (track.scIsFull) score += 15;

      // Cover bonus
      if (track.cover) score += 10;

      // Liked artist bonus
      const artistLower = (track.artist || "").toLowerCase().trim();
      if (artistLower && likedArtists.has(artistLower)) score += 30;

      // Heavy-rotation fatigue (soft, never on liked artists): the wave stops
      // echoing the same few artists across consecutive batches.
      if (artistLower && fatigueArtists.has(artistLower) && !likedArtists.has(artistLower)) {
        score -= 18;
      }

      // Liked genre bonus
      const trackGenre = normalizeGenre(track.genre || "");
      if (trackGenre && likedGenres.has(trackGenre)) score += 20;

      // Language match
      if (langPref) {
        const trackLang = detectLanguage(`${track.title || ""} ${track.artist || ""}`);
        if (trackLang === langPref) score += 15;
      }

      // Duration sweet spot (2-6 min)
      if (track.duration >= 120 && track.duration <= 360) score += 10;
      else if (track.duration < 90) score -= 20;

      // Jitter ±15 for variety
      score += Math.floor(Math.random() * 30) - 15;

      scored.push({ track, score, source, seedArtist });
    }

    scored.sort((a, b) => b.score - a.score);

    // ════════════════════════════════════════════════════════════════════
    // DIVERSITY: max 1 track per artist + dedup by title
    // ════════════════════════════════════════════════════════════════════
    const seenArtists = new Set<string>();
    const seenTitles = new Set<string>();
    const selected: SCTrack[] = [];

    for (const { track } of scored) {
      if (selected.length >= 15) break;

      const artistLower = (track.artist || "").toLowerCase().trim();
      if (artistLower && seenArtists.has(artistLower)) continue; // max 1 per artist
      if (artistLower) seenArtists.add(artistLower);

      // Dedup by normalized title
      const normalizedTitle = (track.title || "")
        .toLowerCase()
        .replace(/[^a-zа-я0-9\s]/gi, "")
        .replace(/\s+(remix|cover|edit|mix|version|instrumental|vip|bootleg|flip|dub|original|extended|radio|club|acoustic|live|unplugged).*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (normalizedTitle && seenTitles.has(normalizedTitle)) continue;
      if (normalizedTitle) seenTitles.add(normalizedTitle);

      selected.push(track);
    }

    // Interleave for artist variety
    const interleaved = interleaveByArtist(selected);
    const tracks = interleaved.map(t => {
      const entry = scored.find(s => s.track.scTrackId === t.scTrackId);
      const src = entry?.source;
      const reason =
        src === "current_related" ? "related_current" :
        src === "history_related" ? "related_history" :
        src === "artist_search" ? "liked_artist" : undefined;
      return mapToRadioTrack(t, reason, entry?.seedArtist);
    });

    const responseData = {
      tracks,
      seedInfo: {
        // REAL seed context passed by the client (current track) — no fake
        // "Unknown"/"energy" placeholders.
        artist: seedArtistParam || null,
        genre: seedGenreParam || null,
      },
      _meta: {
        version: 4,
        candidates: trackMap.size,
        selected: tracks.length,
        sources: {
          current_related: scored.filter(s => s.source === "current_related").length,
          history_related: scored.filter(s => s.source === "history_related").length,
          artist_search: scored.filter(s => s.source === "artist_search").length,
        },
        fatigueApplied: fatigueArtists.size,
      },
    };

    setCache(cacheKey, responseData, cache, 100, CACHE_TTL);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error("[radio v4] error:", err);
    return NextResponse.json(
      { tracks: [], seedInfo: { artist: null, genre: null } },
      { status: 200 },
    );
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
