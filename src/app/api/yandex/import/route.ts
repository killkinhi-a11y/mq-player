/**
 * POST /api/yandex/import — create an import job.
 *
 * Body: { playlists: [{ kind, uid, title, conflictMode: "copy"|"merge" }] }
 *
 * The job is processed chunk-by-chunk by POST /api/yandex/import/[id]/advance
 * (serverless-safe — no background workers). Job creation validates and caps
 * the request, then stores everything needed to resume.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getTokenForUser, createJob } from "@/lib/yandex/store";
import {
  MAX_PLAYLISTS_PER_JOB,
  type ImportJobData,
  type PlaylistConflictMode,
} from "@/lib/yandex/importEngine";
import { newReport } from "@/lib/yandex/importEngine";
import { YandexError } from "@/lib/yandex/types";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

interface RequestedPlaylist {
  kind: number;
  uid?: number | null;
  title?: string;
  conflictMode?: PlaylistConflictMode;
}

async function postHandler(
  req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }
    const token = await getTokenForUser(ctx.userId);
    if (!token) {
      throw new YandexError("no_yandex_account", "Аккаунт Яндекс.Музыки не подключён.", 401);
    }

    const body = (await req.json()) as { playlists?: RequestedPlaylist[] };
    const requested = Array.isArray(body?.playlists) ? body.playlists : [];
    if (requested.length === 0) {
      throw new YandexError("bad_request", "Не выбран ни один плейлист.", 400);
    }
    if (requested.length > MAX_PLAYLISTS_PER_JOB) {
      throw new YandexError("bad_request", `Максимум ${MAX_PLAYLISTS_PER_JOB} плейлистов за раз.`, 400);
    }

    const seenKinds = new Set<number>();
    const data: ImportJobData = {
      phase: "fetching",
      playlists: [],
      report: newReport(),
    };
    for (const p of requested) {
      const kind = Number(p?.kind);
      if (!Number.isFinite(kind) || kind <= 0) continue;
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      const conflictMode: PlaylistConflictMode = p.conflictMode === "merge" ? "merge" : "copy";
      data.playlists.push({
        kind,
        uid: p.uid ?? null,
        title: String(p.title ?? `Плейлист ${kind}`).slice(0, 200),
        description: "",
        coverUrl: "",
        trackCount: 0,
        ownerLogin: "",
        conflictMode,
        fetched: false,
        matchCursor: 0,
        imported: false,
      });
    }
    if (data.playlists.length === 0) {
      throw new YandexError("bad_request", "Некорректный список плейлистов.", 400);
    }

    const jobId = await createJob(ctx.userId, data);
    return NextResponse.json({ jobId });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.heavy, withAuth(postHandler));
