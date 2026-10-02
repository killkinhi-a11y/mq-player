/**
 * POST /api/yandex/import/[id]/cancel — cancel a running import job.
 * Terminal states are immutable; a non-terminal job becomes "cancelled".
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getJob, updateJob } from "@/lib/yandex/store";
import { YandexError } from "@/lib/yandex/types";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function postHandler(
  _req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string }
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const job = await getJob(ctx.userId, id);
    if (!job) {
      throw new YandexError("job_not_found", "Задача импорта не найдена.", 404);
    }
    const terminal = ["completed", "completed_with_errors", "failed", "cancelled"];
    if (!terminal.includes(job.status)) {
      await updateJob(ctx.userId, id, { status: "cancelled", completed: true });
      return NextResponse.json({ ok: true, status: "cancelled" });
    }
    return NextResponse.json({ ok: true, status: job.status });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
