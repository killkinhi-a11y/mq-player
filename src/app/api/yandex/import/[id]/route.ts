/**
 * GET /api/yandex/import/[id] — job status snapshot.
 *
 * ?detail=1 → full detail (per-track matches + candidates) for the result
 * screen. The compact snapshot is what the progress poller consumes.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getJob } from "@/lib/yandex/store";
import { buildSnapshot, getImportDetail, type ImportJobData } from "@/lib/yandex/importEngine";
import { YandexError } from "@/lib/yandex/types";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function getHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string }
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const job = await getJob(ctx.userId, id);
    if (!job) {
      throw new YandexError("job_not_found", "Задача импорта не найдена.", 404);
    }
    const detail = new URL(req.url).searchParams.get("detail") === "1";
    if (detail) {
      const full = await getImportDetail(ctx.userId, id);
      return NextResponse.json(full);
    }
    const data = JSON.parse(job.data) as ImportJobData;
    return NextResponse.json(buildSnapshot(id, job.status, data));
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
