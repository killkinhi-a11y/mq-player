import { NextRequest, NextResponse } from "next/server";
import { searchSCTracks } from "@/lib/soundcloud";
import { searchAudiusTracks } from "@/lib/audius";
import { spotifyTrack } from "@/lib/spotify/catalog";
import {
  rankCandidates,
  getCachedMatch,
  setCachedMatch,
  AUTO_PLAY_THRESHOLD,
  type CatalogTrack,
  type PlaybackCandidate,
  type ScoredCandidate,
} from "@/lib/playback/resolver";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/resolve — PlaybackResolver endpoint.
 *
 *   Catalog Track (Spotify)
 *     → PlaybackResolver (candidate search + scoring)
 *     → Best Candidate + Alternatives (confidence)
 *     → PlaybackAdapter (client audio engine)
 *
 * Body:
 *   {
 *     catalogProvider: "spotify",
 *     spotifyId?: string,            // fetch catalog data server-side
 *     track?: {                      // …or trust the client DTO
 *       spotifyId, title, artist, album?, durationSec, isrc?
 *     },
 *     prefer?: "soundcloud" | "audius",   // user source preference
 *     force?: { provider, sourceId }      // manual source pick (no re-scoring)
 *   }
 *
 * Response:
 *   {
 *     best: { provider, sourceId, title, artist, confidence, … } | null,
 *     alternatives: [...],          // ranked, for "Choose source" UI
 *     confidence: number,
 *     lowConfidence: boolean,       // true → UI must NOT autoplay
 *     cached: boolean,
 *     catalog: { title, artist, … } // what was resolved
 *   }
 *
 * Honest states: best=null + lowConfidence=true when nothing clears the
 * threshold — the client shows "Не удалось точно сопоставить трек" with
 * manual source options instead of playing a wrong track.
 */

/* ── Candidate builders ────────────────────────────────────────────── */

function scCandidate(t: {
  scTrackId: number;
  title: string;
  artist: string;
  duration: number;
  cover: string;
  scStreamPolicy: string;
  playbackCount?: number;
}): PlaybackCandidate {
  return {
    provider: "soundcloud",
    sourceId: String(t.scTrackId),
    title: t.title,
    artist: t.artist,
    album: "",
    durationSec: t.duration,
    artwork: t.cover,
    isPreview: t.scStreamPolicy === "SNIP",
    popularity: t.playbackCount || 0,
  };
}

function audiusCandidate(t: {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover: string;
}): PlaybackCandidate {
  return {
    provider: "audius",
    sourceId: t.id.replace(/^audius_/, ""),
    title: t.title,
    artist: t.artist,
    album: "",
    durationSec: t.duration,
    artwork: t.cover,
    isPreview: false,
  };
}

/* ── Handler ───────────────────────────────────────────────────────── */

interface ResolveBody {
  catalogProvider?: string;
  spotifyId?: string;
  track?: {
    spotifyId?: string;
    title?: string;
    artist?: string;
    album?: string;
    durationSec?: number;
    isrc?: string;
  };
  prefer?: "soundcloud" | "audius";
  force?: { provider: "soundcloud" | "audius"; sourceId: string };
}

async function postHandler(request: NextRequest) {
  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  return resolveCore(body);
}

/** Core resolver — shared by POST (client) and GET (smoke tests). */
async function resolveCore(body: ResolveBody) {
  const catalogProvider = body.catalogProvider || "spotify";

  // ── Manual source pick (user explicitly chose a source) ──
  if (body.force?.provider && body.force.sourceId) {
    const { provider, sourceId } = body.force;
    if (provider !== "soundcloud" && provider !== "audius") {
      return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 400 });
    }
    return NextResponse.json({
      best: {
        provider,
        sourceId,
        title: "",
        artist: "",
        durationSec: 0,
        confidence: 1,
        userPicked: true,
      },
      alternatives: [],
      confidence: 1,
      lowConfidence: false,
      cached: false,
      userPicked: true,
      catalog: null,
    });
  }

  // ── Build the catalog track (server fetch by id, or client DTO) ──
  let catalog: CatalogTrack | null = null;

  if (body.spotifyId) {
    const data = await spotifyTrack(body.spotifyId.replace(/^sp_/, ""));
    if (data?.track) {
      catalog = {
        catalogId: data.track.spotifyId,
        title: data.track.title,
        artist: data.track.artist,
        album: data.track.album,
        durationSec: data.track.durationSec,
        isrc: data.track.isrc,
      };
    }
  }

  if (!catalog && body.track?.title && body.track.artist) {
    catalog = {
      catalogId: body.track.spotifyId || body.track.title,
      title: body.track.title,
      artist: body.track.artist,
      album: body.track.album,
      durationSec: body.track.durationSec || 0,
      isrc: body.track.isrc,
    };
  }

  if (!catalog) {
    return NextResponse.json(
      { error: "Нужен spotifyId или track { title, artist }" },
      { status: 400 },
    );
  }

  // ── Match cache ──
  const cached = getCachedMatch(catalogProvider, catalog.catalogId);
  if (cached) {
    // Honor a user preference even on a cache hit: re-rank alternatives by
    // preferred provider (cheap — no network).
    let best = cached.best;
    let alternatives = cached.result.alternatives;
    if (body.prefer && alternatives.length > 0) {
      const preferred = alternatives.find(
        (a) => a.provider === body.prefer && a.confidence >= AUTO_PLAY_THRESHOLD,
      );
      if (preferred) {
        best = preferred;
        alternatives = [preferred, ...alternatives.filter((a) => a !== preferred)];
      }
    }
    return NextResponse.json({
      best,
      alternatives,
      confidence: best?.confidence ?? cached.result.confidence,
      lowConfidence: !best,
      cached: true,
      resolvedAt: cached.resolvedAt,
      catalog,
    });
  }

  // ── Candidate search (both providers, parallel) ──
  const query = `${catalog.artist} ${catalog.title}`.trim();
  const [scResults, audiusResults] = await Promise.all([
    searchSCTracks(query, 12).catch(() => []),
    searchAudiusTracks(query, 6).catch(() => []),
  ]);

  const candidates: PlaybackCandidate[] = [
    ...scResults.map(scCandidate),
    ...audiusResults.map(audiusCandidate),
  ];

  // ── Score + rank ──
  const result = rankCandidates(catalog, candidates);

  // User preference: pick the preferred provider's best candidate when it
  // clears the threshold (resolver still verifies availability — preference
  // never forces a bad match).
  let best = result.best;
  let alternatives = result.alternatives;
  if (body.prefer && alternatives.length > 0) {
    const preferred = alternatives.find(
      (a) => a.provider === body.prefer && a.confidence >= AUTO_PLAY_THRESHOLD,
    );
    if (preferred && preferred !== best) {
      best = preferred;
      alternatives = [preferred, ...alternatives.filter((a) => a !== preferred)];
    }
  }

  // ── Cache (even low-confidence results — avoids re-searching dead ends) ──
  setCachedMatch(catalogProvider, catalog.catalogId, best, { ...result, best, alternatives }, "resolver");

  return NextResponse.json({
    best,
    alternatives,
    confidence: best?.confidence ?? result.confidence,
    lowConfidence: !best,
    cached: false,
    catalog,
  });
}

export const POST = withRateLimit(RATE_LIMITS.search, postHandler);

/** GET /api/resolve?spotifyId=…&prefer=… — convenience for smoke tests / curl QA. */
async function getHandler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const spotifyId = searchParams.get("spotifyId");
  const prefer = searchParams.get("prefer");
  if (!spotifyId) {
    return NextResponse.json({ error: "spotifyId обязателен" }, { status: 400 });
  }
  return resolveCore({
    catalogProvider: "spotify",
    spotifyId,
    prefer: prefer === "soundcloud" || prefer === "audius" ? prefer : undefined,
  });
}

export const GET = withRateLimit(RATE_LIMITS.search, getHandler);
