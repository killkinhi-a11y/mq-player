/**
 * Wave server-side plumbing (shared by /api/wave* routes).
 *
 * • resolveWaveUser — server-side user identity (§30): authenticated
 *   session cookie wins; anonymous clients fall back to a validated
 *   anonId (the app's existing anonymous-first model). The CLIENT can
 *   never choose another user's identity.
 * • Wave user store — per-user feedback aggregation + wave session
 *   memory (in-memory, TTL — same trade-off as the existing
 *   /api/music/recommendations/feedback store on the Edge runtime).
 * • Candidate generation channels (§5) — SoundCloud fetchers feeding the
 *   pure engine.
 * • User-scoped response cache (§22) — never shared across users.
 */

import type { NextRequest } from "next/server";
import { getSession } from "@/lib/get-session";
import { searchSCTracks, type SCTrack } from "@/lib/soundcloud";
import { fetchSCTrackRelated } from "@/lib/music-utils";
import type {
  CandidateChannel,
  WaveCandidate,
  WaveEvent,
  WaveSignals,
  WaveTrackMinimal,
} from "./types";
import { WAVE_CONFIG } from "./config";
import { createRng } from "./rng";
import { normArtist, normGenre } from "./profile";

/* ────────────────────────────────────────────────────────────────────────
 * User identity (§30)
 * ──────────────────────────────────────────────────────────────────────── */

export interface WaveUser {
  userId: string;
  authenticated: boolean;
}

const ANON_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Resolve the wave user. Precedence:
 *   1. Valid session cookie → real userId (authenticated).
 *   2. Valid `anonId` (param/header/body fallback) → anonymous identity
 *      (the app's existing anonymous-first model).
 *   3. Rejected otherwise → null (route returns 401).
 */
export async function resolveWaveUser(
  req: NextRequest,
  bodyAnonId?: string,
): Promise<WaveUser | null> {
  try {
    const session = await getSession();
    if (session?.userId) {
      return { userId: `u:${session.userId}`, authenticated: true };
    }
  } catch {
    // Session verification unavailable (e.g. DB down) — fall through to anon.
  }
  const anon = (
    req.nextUrl.searchParams.get("anonId") ||
    req.headers.get("x-mq-anon-id") ||
    bodyAnonId ||
    ""
  ).trim();
  if (ANON_ID_RE.test(anon)) {
    return { userId: `a:${anon}`, authenticated: false };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-user wave store (feedback aggregation + sessions) — Edge-safe memory
 * ──────────────────────────────────────────────────────────────────────── */

interface WaveUserState {
  events: WaveEvent[];
  lastSeen: number;
  /** Aggregate session-scoped taste deltas (artist/genre → −1..1). */
  sessionArtists: Record<string, number>;
  sessionGenres: Record<string, number>;
  boostArtists: string[];
  suppressArtists: string[];
}

interface WaveServerSession {
  id: string;
  userId: string;
  seed: WaveSignals["seed"];
  createdAt: number;
  batches: number;
  tracksServed: number;
  lastActivityAt: number;
}

const userStore = new Map<string, WaveUserState>();
const sessionStore = new Map<string, WaveServerSession>();
const USER_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_EVENTS_PER_USER = 400;

function pruneStores(now: number): void {
  for (const [key, st] of userStore) {
    if (now - st.lastSeen > USER_TTL) userStore.delete(key);
  }
  for (const [key, s] of sessionStore) {
    if (now - s.lastActivityAt > SESSION_TTL) sessionStore.delete(key);
  }
}

function getUserState(userId: string): WaveUserState {
  let st = userStore.get(userId);
  if (!st) {
    st = { events: [], lastSeen: 0, sessionArtists: {}, sessionGenres: {}, boostArtists: [], suppressArtists: [] };
    userStore.set(userId, st);
  }
  return st;
}

/**
 * Record a feedback event server-side (§4). Aggregates taste deltas per
 * user — the client profile remains the primary source; this store adds
 * cross-session persistence for anonymous users.
 */
export function recordWaveEvent(userId: string, event: WaveEvent): void {
  const now = Date.now();
  if (Math.random() < 0.05) pruneStores(now);
  const st = getUserState(userId);
  st.lastSeen = now;
  st.events.push(event);
  if (st.events.length > MAX_EVENTS_PER_USER) {
    st.events = st.events.slice(-MAX_EVENTS_PER_USER);
  }
  const artist = normArtist(event.artist);
  const genre = normGenre(event.genre);
  if (event.type === "track_liked" || event.type === "play_completed" || event.type === "track_replayed") {
    if (artist) st.sessionArtists[artist] = Math.min(1, (st.sessionArtists[artist] || 0) + 0.2);
    if (genre) st.sessionGenres[genre] = Math.min(1, (st.sessionGenres[genre] || 0) + 0.15);
  }
  if (event.type === "track_skipped") {
    const early = typeof event.position === "number" && typeof event.duration === "number" &&
      event.duration > 0 && event.position / event.duration < 0.3;
    if (artist) st.sessionArtists[artist] = Math.max(-1, (st.sessionArtists[artist] || 0) - (early ? 0.4 : 0.2));
    if (genre) st.sessionGenres[genre] = Math.max(-1, (st.sessionGenres[genre] || 0) - (early ? 0.3 : 0.15));
  }
  if (event.type === "more_like_this" && artist && !st.boostArtists.includes(artist)) {
    st.boostArtists.push(artist);
  }
  if ((event.type === "less_like_this" || event.type === "not_interested") && artist) {
    st.boostArtists = st.boostArtists.filter((a) => a !== artist);
    if (!st.suppressArtists.includes(artist)) st.suppressArtists.push(artist);
  }
}

/** Server-side aggregate for a user (feed into engine profile session layer). */
export function getServerTaste(userId: string): {
  artists: Record<string, number>;
  genres: Record<string, number>;
  boostArtists: string[];
  suppressArtists: string[];
} {
  const st = userStore.get(userId);
  if (!st) return { artists: {}, genres: {}, boostArtists: [], suppressArtists: [] };
  return {
    artists: { ...st.sessionArtists },
    genres: { ...st.sessionGenres },
    boostArtists: [...st.boostArtists],
    suppressArtists: [...st.suppressArtists],
  };
}

export function createWaveServerSession(userId: string, seed: WaveSignals["seed"]): WaveServerSession {
  const now = Date.now();
  const session: WaveServerSession = {
    id: `ws_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    userId,
    seed,
    createdAt: now,
    batches: 0,
    tracksServed: 0,
    lastActivityAt: now,
  };
  sessionStore.set(session.id, session);
  return session;
}

export function touchWaveServerSession(sessionId: string, tracksServed: number): void {
  const s = sessionStore.get(sessionId);
  if (!s || sessionId.startsWith("local_")) return;
  s.batches += 1;
  s.tracksServed += tracksServed;
  s.lastActivityAt = Date.now();
}

export function getWaveServerSession(sessionId: string): WaveServerSession | null {
  return sessionStore.get(sessionId) || null;
}

/* ────────────────────────────────────────────────────────────────────────
 * User-scoped response cache (§22)
 * ──────────────────────────────────────────────────────────────────────── */

const responseCache = new Map<string, { data: unknown; expiry: number }>();

export function waveCacheGet<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiry) {
    responseCache.delete(key);
    return null;
  }
  return hit.data as T;
}

export function waveCacheSet(key: string, data: unknown, ttlMs: number = WAVE_CONFIG.cache.ttlMs): void {
  if (responseCache.size > WAVE_CONFIG.cache.maxEntries) {
    // Drop the oldest third — cheap approximate LRU.
    const keys = [...responseCache.keys()].slice(0, Math.floor(WAVE_CONFIG.cache.maxEntries / 3));
    for (const k of keys) responseCache.delete(k);
  }
  responseCache.set(key, { data, expiry: Date.now() + ttlMs });
}

/** User-scoped cache key (§22): wave:{userId}:{seed}:{profileVersion}:{context}. */
export function waveCacheKey(userId: string, seedKey: string, profileVersion: string, contextHash: string): string {
  return `wave:${userId}:${seedKey}:${profileVersion}:${contextHash}`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Candidate generation channels (§5 A–G)
 * ──────────────────────────────────────────────────────────────────────── */

export interface ChannelFetchInput {
  signals: WaveSignals;
  now?: number;
}

function limitOf(ch: keyof typeof WAVE_CONFIG.channels): number {
  const c = WAVE_CONFIG.channels[ch] as { enabled: boolean; limit: number };
  return c.enabled ? c.limit : 0;
}

/** Content-quality gate shared by every channel (§36 — no garbage). */
function isAcceptable(t: SCTrack): boolean {
  const title = (t.title || "").trim();
  const artist = (t.artist || "").trim();
  if (title.length < 3 || artist.length < 2) return false;
  if (/(.)\1{5,}/.test(title)) return false;
  if (t.duration && (t.duration < 30 || t.duration > 1500)) return false;
  const spam = ["free download", "type beat", "subscribe", "follow me", "link in bio",
    "made by ai", "ai generated", "suno", "udio", "untitled", "ringtone", "tutorial"];
  const combined = `${title} ${artist}`.toLowerCase();
  if (spam.some((kw) => combined.includes(kw))) return false;
  return true;
}

/**
 * Fetch candidates from ALL channels in parallel (§5). Each channel is
 * best-effort — a failing channel shrinks the pool, never the request.
 */
export async function fetchWaveCandidates(input: ChannelFetchInput): Promise<{
  candidates: WaveCandidate<SCTrack>[];
  channelStats: Record<CandidateChannel | string, number>;
}> {
  const { signals } = input;
  const channelsCfg = WAVE_CONFIG.channels;
  const jobs: Array<Promise<void>> = [];
  const collected: WaveCandidate<SCTrack>[] = [];
  const channelStats: Record<string, number> = {};
  const seenGlobal = new Set<string>();

  const push = (channel: CandidateChannel, tracks: SCTrack[], seedRef?: string) => {
    let n = 0;
    for (const t of tracks) {
      if (!isAcceptable(t)) continue;
      if (seenGlobal.has(t.id)) continue;
      seenGlobal.add(t.id);
      collected.push({ track: t, channel, seedRef });
      n++;
    }
    channelStats[channel] = (channelStats[channel] || 0) + n;
  };

  /* A. Similar tracks — seed track /related (strongest, honest seedRef). */
  const seedScId = signals.seed?.scTrackId;
  if (seedScId && limitOf("similarTrack") > 0) {
    const seedTitle = signals.seed?.label || undefined;
    jobs.push(
      fetchSCTrackRelated(seedScId)
        .then((ts) => push("similar_track", ts.slice(0, channelsCfg.similarTrack.limit), seedTitle))
        .catch(() => {}),
    );
  }

  /* B. Similar artists — search on the seed artist. */
  const seedArtist = normArtist(signals.seed?.artist);
  if (seedArtist && limitOf("similarArtist") > 0) {
    jobs.push(
      searchSCTracks(`"${signals.seed!.artist}"`, channelsCfg.similarArtist.limit)
        .then((ts) => push("similar_artist", ts, signals.seed!.artist))
        .catch(() => {}),
    );
  }

  /* C. Taste profile — user's top liked/taste artists (§5 C). */
  const tasteArtists = [
    ...(signals.tasteArtists || []),
    ...(signals.likedArtists || []),
  ]
    .map(normArtist)
    .filter(Boolean);
  const uniqueTasteArtists = [...new Set(tasteArtists)].slice(0, channelsCfg.taste.maxArtists);
  if (uniqueTasteArtists.length > 0 && limitOf("taste") > 0) {
    for (const artist of uniqueTasteArtists) {
      jobs.push(
        searchSCTracks(`"${artist}"`, Math.ceil(channelsCfg.taste.limit / uniqueTasteArtists.length) + 5)
          .then((ts) => push("taste", ts, artist))
          .catch(() => {}),
      );
    }
  }

  /* D. Recent favorites — related to recently LIKED tracks. */
  const likedScIds = (signals.likedScIds || []).slice(0, channelsCfg.recentFavorites.maxLikedSeeds);
  if (likedScIds.length > 0 && limitOf("recentFavorites") > 0) {
    for (const scId of likedScIds) {
      jobs.push(
        fetchSCTrackRelated(scId)
          .then((ts) => push("recent_favorites", ts.slice(0, channelsCfg.recentFavorites.limit), undefined))
          .catch(() => {}),
      );
    }
  }

  /* E. Recent listening — related to recent HISTORY tracks (context). */
  const historyScIds = (signals.historyScIds || []).slice(0, channelsCfg.recentListening.maxHistorySeeds);
  if (historyScIds.length > 0 && limitOf("recentListening") > 0) {
    for (const scId of historyScIds) {
      jobs.push(
        fetchSCTrackRelated(scId)
          .then((ts) => push("recent_listening", ts.slice(0, channelsCfg.recentListening.limit), undefined))
          .catch(() => {}),
      );
    }
  }

  /* F. Exploration — adjacent genres (bridge map), deterministic picks.
   * Never random vibe queries (§36): every query is anchored to a real
   * signal (user genre, seed genre, or curated fallback for cold start). */
  if (limitOf("exploration") > 0) {
    const anchorGenres = [
      ...(signals.tasteGenres || []),
      ...(signals.likedGenres || []),
    ]
      .map((g) => normGenre(g))
      .filter((g): g is string => !!g);
    const seedGenre = normGenre(signals.seed?.genre);
    if (seedGenre) anchorGenres.push(seedGenre);

    const bridges: string[] = [];
    for (const g of anchorGenres) {
      for (const b of WAVE_CONFIG.coldStart.bridgeGenres[g] || []) {
        if (!anchorGenres.includes(b) && !bridges.includes(b)) bridges.push(b);
      }
    }
    const fallback = anchorGenres.length === 0 ? WAVE_CONFIG.coldStart.fallbackGenres : [];
    const pool = [...bridges, ...fallback];
    if (pool.length > 0) {
      const rng = createRng((input.now ?? Date.now()) >>> 0);
      const queries = rng.shuffle(pool).slice(0, channelsCfg.exploration.maxGenreQueries);
      for (const genre of queries) {
        jobs.push(
          searchSCTracks(genre, channelsCfg.exploration.limit)
            .then((ts) => push("exploration", ts, genre))
            .catch(() => {}),
        );
      }
    }
  }

  await Promise.allSettled(jobs);
  return { candidates: collected, channelStats };
}

/** Map an engine-scored SCTrack to the client Track shape (+reason fields). */
export function scoredToTrackPayload<T extends SCTrack>(c: {
  track: T;
  reason: string;
  seedRef?: string;
  score: number;
}): Record<string, unknown> & WaveTrackMinimal {
  return {
    id: c.track.id,
    title: c.track.title,
    artist: c.track.artist,
    album: c.track.album,
    duration: c.track.duration,
    cover: c.track.cover,
    genre: c.track.genre,
    audioUrl: c.track.audioUrl,
    previewUrl: c.track.previewUrl,
    source: "soundcloud",
    scTrackId: c.track.scTrackId,
    scStreamPolicy: c.track.scStreamPolicy,
    scIsFull: c.track.scIsFull,
    playbackCount: c.track.playbackCount,
    createdAt: c.track.createdAt,
    _reason: c.reason,
    _seedArtist: c.seedRef,
  };
}
