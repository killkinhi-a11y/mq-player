/**
 * POST /api/yandex/public-playlist/match — match ONE slice of Yandex tracks.
 *
 * Body: { "tracks": [YandexTrackMeta, ...] }  (≤ PUBLIC_MATCH_CHUNK entries)
 *
 * NO SESSION — stateless public matching. The client (which already holds the
 * previewed tracks from POST /api/yandex/public-playlist) posts slices here;
 * each call runs the SAME matching engine as the OAuth import (searchQueries +
 * matchTrack + SoundCloud search with the engine's concurrency/limits) and
 * returns per-track decisions: matched / ambiguous / unmatched. Ambiguous
 * tracks are NEVER auto-imported (the client surfaces candidates or skips
 * them honestly).
 *
 * Response (200): { matches: PublicMatchEntry[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  matchPublicChunk,
  isYandexTrackMeta,
  PUBLIC_MATCH_CHUNK,
} from "@/lib/yandex/public-import";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";
import { YandexError } from "@/lib/yandex/types";

export const maxDuration = 60;

async function postHandler(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { tracks?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new YandexError("bad_request", "Некорректное тело запроса.", 400);
    }

    if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
      throw new YandexError("bad_request", "Список треков пуст.", 400);
    }
    if (body.tracks.length > PUBLIC_MATCH_CHUNK) {
      throw new YandexError("bad_request", `Максимум ${PUBLIC_MATCH_CHUNK} треков за запрос.`, 400);
    }
    if (!body.tracks.every(isYandexTrackMeta)) {
      throw new YandexError("bad_request", "Некорректные метаданные трека.", 400);
    }

    const matches = await matchPublicChunk(body.tracks);
    return NextResponse.json({ matches });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.yandexPublicMatch, postHandler);
