/**
 * POST /api/yandex/import/[id]/advance — process the next bounded chunk of work.
 *
 * This is the serverless "worker": each call advances the job by
 * one playlist fetch / one match chunk / one playlist import, persists, and
 * returns the fresh snapshot. No background processes exist on Vercel.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { advanceImportJob } from "@/lib/yandex/importEngine";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

export const maxDuration = 60;

async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string }
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const snapshot = await advanceImportJob(ctx.userId, id, req);
    return NextResponse.json(snapshot);
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.yandexImport, withAuth(postHandler));
