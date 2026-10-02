/**
 * POST /api/yandex/public-playlist — PUBLIC playlist preview by URL.
 *
 * Body: { "url": "https://music.yandex.ru/users/{login}/playlists/{kind}" }
 *
 * NO SESSION — this is the tokenless public flow (no OAuth, no Yandex login,
 * no tokens, no cookies). The URL is parsed strictly (host allow-list, path
 * shape) and NEVER fetched: only (ownerLogin, kind) are extracted and passed
 * to the signed server-side Python adapter, which calls the tokenless
 * yandex-music users_playlists(kind, user_id=...) method. SSRF-safe by
 * construction — there is no user-controlled fetch target.
 *
 * Response (200):
 *   { playlist: {title, ownerLogin, coverUrl, description, kind, uid},
 *     trackCount, totalTrackCount, tracks: [...], sourceUrl }
 *
 * Errors (machine code + human Russian message):
 *   400 bad_request        — invalid URL / not a Yandex Music playlist URL
 *   404 yandex_not_found   — playlist missing or private
 *   404 yandex_empty_playlist — playlist exists but has zero tracks
 *   503 yandex_geo_blocked — Yandex geo-fences content by server region
 *   504 yandex_timeout     — Yandex did not answer in time
 *   5xx — mapped upstream failures
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { adapterPublicPlaylistTracks } from "@/lib/yandex/adapter";
import { parseYandexPlaylistUrl } from "@/lib/yandex/public-url";
import { PUBLIC_MAX_TRACKS } from "@/lib/yandex/public-import";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

export const maxDuration = 60;

const MAX_URL_LENGTH = 512;

async function postHandler(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { url?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Некорректное тело запроса." },
        { status: 400 }
      );
    }

    const rawUrl = typeof body.url === "string" ? body.url : "";
    if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "Вставьте ссылку на плейлист Яндекс.Музыки — например, https://music.yandex.ru/users/.../playlists/...",
        },
        { status: 400 }
      );
    }

    const parsed = parseYandexPlaylistUrl(rawUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "bad_request",
          message:
            "Неподдерживаемая ссылка. Ожидается публичная ссылка Яндекс.Музыки вида https://music.yandex.ru/users/имя/playlists/номер",
        },
        { status: 400 }
      );
    }

    const fetched = await adapterPublicPlaylistTracks(parsed.ownerLogin, parsed.kind, req);

    if (!fetched.tracks || fetched.tracks.length === 0) {
      return NextResponse.json(
        { error: "yandex_empty_playlist", message: "В этом плейлисте нет треков." },
        { status: 404 }
      );
    }

    const capped = fetched.tracks.slice(0, PUBLIC_MAX_TRACKS);
    return NextResponse.json({
      playlist: {
        title: fetched.title || `Плейлист ${parsed.kind}`,
        ownerLogin: fetched.ownerLogin || parsed.ownerLogin,
        coverUrl: fetched.coverUrl || "",
        description: (fetched.description || "").slice(0, 300),
        kind: fetched.kind ?? parsed.kind,
        uid: fetched.uid ?? null,
      },
      trackCount: capped.length,
      totalTrackCount: fetched.trackCount || capped.length,
      tracks: capped,
      sourceUrl: parsed.normalizedUrl,
    });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.yandexPublic, postHandler);
