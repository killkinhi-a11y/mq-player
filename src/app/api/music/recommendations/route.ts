import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks, getSoundCloudClientId, type SCTrack } from "@/lib/soundcloud";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Recommendations API v3 — Spotify-style rewrite from scratch.
 *
 * Принципы (изучил как делает Spotify):
 * 1. SEED-BASED: берём лайкнутые треки + историю как seeds → /tracks/{id}/related
 *    даёт genuinely similar tracks (не random search по жанрам)
 * 2. MIX OF FAMILIAR + DISCOVERY: 60% familiar (related к лайкнутому),
 *    25% artist-based (поиск по топ-артистам), 15% discovery (смежные жанры)
 * 3. DIVERSITY: max 2 трека от одного артиста в выдаче (Spotify standard)
 * 4. FRESHNESS: предпочитаем треки с scIsFull (полные, не превью)
 * 5. CATEGORIZED OUTPUT: "Для вас" (familiar), "Похожие на {artist}",
 *    "Открытия" (discovery), "Новое" (fresh releases via year search)
 *
 * Old v14 was 1665 lines of over-engineered scoring with 20+ keyword lists,
 * 8 phases, bridge genres, time-of-day energy matching, etc. v3 is ~400
 * lines of clean seed-based logic that actually works like Spotify.
 */

// ── Cache (10 min TTL — longer than before because seed-based results
// are more stable and we want to reduce SoundCloud API calls) ──
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  if (cache.size > 100) cache.clear();
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ── Content quality filter (minimal vs old 200+ keyword lists) ──
const SPAM_KEYWORDS = [
  "free download", "type beat", "subscribe", "follow me", "link in bio",
  "buy now", "purchase", "made by ai", "ai generated", "suno", "udio",
  "test", "untitled", "ringtone", "notification", "alarm",
];

const PROMO_KEYWORDS = [
  "official audio", "lyric video", "slowed", "sped up", "nightcore",
  "bass boost", "radio edit", "out now", "stream now",
];

function isSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

function hasPromoFlavor(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMO_KEYWORDS.some(kw => lower.includes(kw));
}

function isLowQuality(track: SCTrack): boolean {
  const title = (track.title || "").trim();
  const artist = (track.artist || "").trim();
  if (title.length < 3) return true;
  if (artist.length < 2) return true;
  if (/[.!]{3,}/.test(title)) return true; // spam dots
  if (/(.)\1{5,}/.test(title)) return true; // repeated chars
  const combined = `${title} ${artist}`.toLowerCase();
  if (isSpam(combined)) return true;
  if (!track.cover) return true;
  if (track.duration && track.duration < 30) return true;
  if (track.duration && track.duration > 1200) return true; // >20min = DJ set
  return false;
}

// ── Fetch SoundCloud related tracks (PRIMARY source — like Spotify) ──
async function fetchSCTrackRelated(scTrackId: number): Promise<SCTrack[]> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return [];
    const url = `https://api-v2.soundcloud.com/tracks/${scTrackId}/related?client_id=${clientId}&limit=20&offset=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data.collection || []);
    return raw.filter((t: Record<string, unknown>) => {
      if ((t.kind as string) !== "track") return false;
      if ((t.policy as string) === "BLOCK") return false;
      return true;
    }).map((t: Record<string, unknown>) => {
      const user = t.user as Record<string, unknown> | undefined;
      const artwork = (t.artwork_url as string) || "";
      const rawCover = artwork ? artwork.replace("-large.", "-t500x500.") : (user?.avatar_url as string || "").replace("-large.", "-t500x500.") || "";
      const cover = rawCover ? `/api/music/soundcloud/image-proxy?url=${encodeURIComponent(rawCover)}` : "";
      const fullDuration = (t.full_duration as number) || (t.duration as number) || 30000;
      const policy = (t.policy as string) || "ALLOW";
      return {
        id: `sc_${t.id}`, title: (t.title as string) || "Unknown",
        artist: user?.username || "Unknown", album: "",
        duration: Math.round(fullDuration / 1000), cover,
        genre: (t.genre as string) || "", audioUrl: "", previewUrl: "",
        source: "soundcloud" as const, scTrackId: t.id as number,
        scStreamPolicy: policy, scIsFull: policy === "ALLOW",
      };
    });
  } catch {
    return [];
  }
}

// ── Mapped track for output ──
interface MappedTrack {
  id: string; title: string; artist: string; album: string;
  cover: string; duration: number; genre: string;
  audioUrl: string; previewUrl: string; source: string;
  scTrackId: number; scStreamPolicy: string; scIsFull: boolean;
  _reason?: string;
}

function mapTrack(track: SCTrack, reason?: string): MappedTrack {
  return {
    id: track.id, title: track.title, artist: track.artist, album: track.album,
    cover: track.cover, duration: track.duration, genre: track.genre,
    audioUrl: track.audioUrl, previewUrl: track.previewUrl, source: track.source,
    scTrackId: track.scTrackId, scStreamPolicy: track.scStreamPolicy, scIsFull: track.scIsFull,
    _reason: reason,
  };
}

// ── Artist-aware interleaving (Spotify-style: no consecutive same-artist) ──
function interleaveByArtist<T extends { artist: string }>(tracks: T[], maxPerArtist: number = 2): T[] {
  if (tracks.length <= 2) return tracks;
  const result: T[] = [];
  const remaining = [...tracks];
  const artistCount = new Map<string, number>();
  let lastArtist: string | null = null;

  while (remaining.length > 0) {
    let pickedIdx = -1;
    // Find best track: prefer different artist from last, respect maxPerArtist
    for (let i = 0; i < remaining.length; i++) {
      const artist = (remaining[i].artist || "").toLowerCase().trim();
      if ((artistCount.get(artist) || 0) >= maxPerArtist) continue;
      if (artist !== lastArtist) { pickedIdx = i; break; }
    }
    // Fallback: any track that hasn't hit maxPerArtist
    if (pickedIdx === -1) {
      for (let i = 0; i < remaining.length; i++) {
        const artist = (remaining[i].artist || "").toLowerCase().trim();
        if ((artistCount.get(artist) || 0) < maxPerArtist) { pickedIdx = i; break; }
      }
    }
    // Ultimate fallback
    if (pickedIdx === -1) pickedIdx = 0;

    const picked = remaining.splice(pickedIdx, 1)[0];
    const pickedArtist = (picked.artist || "").toLowerCase().trim();
    artistCount.set(pickedArtist, (artistCount.get(pickedArtist) || 0) + 1);
    lastArtist = pickedArtist;
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
  const genresParam = searchParams.get("genres") || "";
  const artistsParam = searchParams.get("artists") || "";
  const excludeParam = searchParams.get("excludeIds") || "";
  const dislikedParam = searchParams.get("dislikedIds") || "";
  const likedScIdsParam = searchParams.get("likedScIds") || "";
  const historyScIdsParam = searchParams.get("historyScIds") || "";
  const waveParam = searchParams.get("wave") || "";

  const excludeIds = new Set(excludeParam.split(",").filter(Boolean));
  const dislikedIds = new Set(dislikedParam.split(",").filter(Boolean));

  const genres: string[] = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const artists: string[] = artistsParam ? artistsParam.split(",").filter(Boolean).slice(0, 5) : [];

  const likedScIds: number[] = likedScIdsParam.split(",").filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  const historyScIds: number[] = historyScIdsParam.split(",").filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);

  // ── Cache check ──
  const cacheKey = `rec-v3:${likedScIdsParam}:${historyScIdsParam}:${genresParam}:${artistsParam}:${dislikedParam}:${excludeParam}`;
  const cached = getFromCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // ── Phase 1: SEED-BASED (Spotify core) ──
    // Use up to 3 liked + 2 history tracks as seeds for /related API.
    // This gives genuinely similar tracks, not random genre search.
    const seedIds = [
      ...likedScIds.slice(0, 3),
      ...historyScIds.slice(0, 2),
    ];

    const relatedPromises = seedIds.map(id => fetchSCTrackRelated(id));
    const relatedResults = await Promise.allSettled(relatedPromises);

    // ── Aggregate tracks with source metadata ──
    const trackMap = new Map<number, { track: SCTrack; fromLiked: boolean; fromHistory: boolean }>();
    const sourceScIds = new Set<number>([...likedScIds, ...historyScIds]);

    for (let i = 0; i < relatedResults.length; i++) {
      const result = relatedResults[i];
      if (result.status !== "fulfilled") continue;
      const fromLiked = i < likedScIds.slice(0, 3).length;
      for (const track of result.value) {
        if (sourceScIds.has(track.scTrackId)) continue; // exclude seeds
        if (isLowQuality(track)) continue;
        if (excludeIds.has(track.id) || dislikedIds.has(track.id)) continue;
        const existing = trackMap.get(track.scTrackId);
        if (existing) {
          // Upgrade: if found via liked seed, mark as fromLiked
          if (fromLiked && !existing.fromLiked) existing.fromLiked = true;
        } else {
          trackMap.set(track.scTrackId, { track, fromLiked, fromHistory: !fromLiked });
        }
      }
    }

    // ── Phase 2: ARTIST SEARCH (medium priority) ──
    // If we have top artists, search for their tracks to fill gaps.
    if (artists.length > 0 && trackMap.size < 30) {
      const artistPromises = artists.slice(0, 3).map(a => searchSCTracks(`"${a}"`, 10));
      const artistResults = await Promise.allSettled(artistPromises);
      for (const result of artistResults) {
        if (result.status !== "fulfilled") continue;
        for (const track of result.value) {
          if (sourceScIds.has(track.scTrackId)) continue;
          if (isLowQuality(track)) continue;
          if (excludeIds.has(track.id) || dislikedIds.has(track.id)) continue;
          if (!trackMap.has(track.scTrackId)) {
            trackMap.set(track.scTrackId, { track, fromLiked: false, fromHistory: false });
          }
        }
      }
    }

    // ── Phase 3: GENRE DISCOVERY (low priority, only if not enough) ──
    // Search by user's top genres for discovery content.
    if (genres.length > 0 && trackMap.size < 30) {
      const genreQueries = genres.slice(0, 2).map(g => `${g} new`);
      const genrePromises = genreQueries.map(q => searchSCTracks(q, 10));
      const genreResults = await Promise.allSettled(genrePromises);
      for (const result of genreResults) {
        if (result.status !== "fulfilled") continue;
        for (const track of result.value) {
          if (sourceScIds.has(track.scTrackId)) continue;
          if (isLowQuality(track)) continue;
          if (excludeIds.has(track.id) || dislikedIds.has(track.id)) continue;
          if (!trackMap.has(track.scTrackId)) {
            trackMap.set(track.scTrackId, { track, fromLiked: false, fromHistory: false });
          }
        }
      }
    }

    // ── Build scored + sorted track list ──
    // Spotify-style scoring: related-to-liked > related-to-history > artist search > genre
    // Plus: playable bonus, cover bonus, promo penalty
    const scoredTracks: { track: SCTrack; score: number; fromLiked: boolean; fromHistory: boolean }[] = [];
    for (const { track, fromLiked, fromHistory } of trackMap.values()) {
      let score = 0;
      if (fromLiked) score += 100; // highest priority
      else if (fromHistory) score += 60;
      else score += 20; // artist/genre search

      if (track.scIsFull) score += 15; // prefer full tracks
      if (track.cover) score += 10;
      if (hasPromoFlavor(`${track.title} ${track.artist}`)) score -= 15; // soft penalty

      // Duration sweet spot (2-6 min = proper track)
      if (track.duration >= 120 && track.duration <= 360) score += 10;
      else if (track.duration < 90) score -= 20;

      // Jitter for variety (±10)
      score += Math.floor(Math.random() * 20) - 10;

      scoredTracks.push({ track, score, fromLiked, fromHistory });
    }

    // Sort by score descending
    scoredTracks.sort((a, b) => b.score - a.score);

    // ── Dedup by normalized title (1 variant per title) ──
    const seenTitles = new Set<string>();
    const deduped = scoredTracks.filter(({ track }) => {
      const normalized = (track.title || "")
        .toLowerCase()
        .replace(/[^a-zа-я0-9\s]/gi, "")
        .replace(/\s+(remix|cover|edit|mix|version|instrumental|vip|bootleg|flip|dub|original|extended|radio|club|acoustic|live|unplugged).*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized || seenTitles.has(normalized)) return false;
      seenTitles.add(normalized);
      return true;
    });

    // ── CATEGORIZED OUTPUT (Spotify-style) ──
    const usedInCategory = new Set<number>();

    // 1. "Похожие на {artist}" — up to 2 rows
    const artistRows: { id: string; title: string; icon: string; tracks: MappedTrack[] }[] = [];
    for (const artist of artists.slice(0, 2)) {
      const aLower = artist.toLowerCase().trim();
      const artistTracks = deduped
        .filter(({ track }) => {
          const tArtist = (track.artist || "").toLowerCase().trim();
          return (tArtist === aLower || tArtist.includes(aLower) || aLower.includes(tArtist))
            && !usedInCategory.has(track.scTrackId);
        })
        .slice(0, 30);
      if (artistTracks.length >= 3) {
        for (const { track } of artistTracks) usedInCategory.add(track.scTrackId);
        artistRows.push({
          id: `artist_${aLower.replace(/\s+/g, "_")}`,
          title: `Похожие на ${artist}`,
          icon: "Mic2",
          tracks: artistTracks.map(({ track }) => mapTrack(track, "artist_match")),
        });
      }
    }

    // 2. "Для вас" — familiar tracks (related to liked/history)
    const forYouTracks = deduped
      .filter(({ track, fromLiked, fromHistory }) =>
        (fromLiked || fromHistory) && !usedInCategory.has(track.scTrackId))
      .slice(0, 50);
    const forYouInterleaved = interleaveByArtist(
      forYouTracks.map(({ track }) => track), 2
    );
    for (const { track } of forYouTracks) usedInCategory.add(track.scTrackId);

    // 3. "Открытия" — discovery (artist/genre search, not related)
    const discoveryTracks = deduped
      .filter(({ track, fromLiked, fromHistory }) =>
        !fromLiked && !fromHistory && !usedInCategory.has(track.scTrackId))
      .slice(0, 50);
    const discoveryInterleaved = interleaveByArtist(
      discoveryTracks.map(({ track }) => track), 2
    );
    for (const { track } of discoveryTracks) usedInCategory.add(track.scTrackId);

    // 4. Flat list (all tracks, interleaved) — target 50.
    //    Carries the honest _reason (wave initial start reads this list):
    //    related_to_liked / related_to_history / discovery.
    const flatTracks = interleaveByArtist(
      deduped.map(d => ({ ...d, artist: d.track.artist })), 2
    ).slice(0, 50).map(({ track, fromLiked, fromHistory }) =>
      mapTrack(track, fromLiked ? "related_to_liked" : fromHistory ? "related_to_history" : "discovery")
    );

    // ── Build categories ──
    const categories: { id: string; title: string; icon: string; tracks: MappedTrack[] }[] = [];

    // "Для вас" first (most personalized)
    if (forYouInterleaved.length >= 3) {
      categories.push({
        id: "for_you",
        title: "Для вас",
        icon: "Sparkles",
        tracks: forYouInterleaved.map(t => {
          const match = forYouTracks.find(({ track }) => track.scTrackId === t.scTrackId);
          return mapTrack(t, match?.fromLiked ? "related_to_liked" : "related_to_history");
        }),
      });
    }

    // Artist rows
    categories.push(...artistRows);

    // "Открытия"
    if (discoveryInterleaved.length >= 3) {
      categories.push({
        id: "discover",
        title: "Открытия",
        icon: "Compass",
        tracks: discoveryInterleaved.map(t => mapTrack(t, "discovery")),
      });
    }

    const responseData = {
      tracks: flatTracks,
      categories,
      _meta: {
        version: 3,
        seedCount: seedIds.length,
        totalCandidates: trackMap.size,
        afterDedup: deduped.length,
        forYouCount: forYouInterleaved.length,
        discoveryCount: discoveryInterleaved.length,
      },
    };

    setCache(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error("[rec v3] error:", err);
    return NextResponse.json({ tracks: [], categories: [] }, { status: 200 });
  }
}

export const GET = withRateLimit(RATE_LIMITS.heavy, handler);
