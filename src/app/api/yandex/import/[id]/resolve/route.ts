/**
 * POST /api/yandex/import/[id]/resolve — manual resolution of an AMBIGUOUS
 * track on the result screen. Appends the user's chosen MQ track to the
 * created playlist (order: after the imported block) and updates the report.
 *
 * Body: { kind: number, position: number, track: Track }
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, validateContentType } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveAmbiguousTrack } from "@/lib/yandex/importEngine";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";
import type { Track } from "@/lib/musicApi";

async function postHandler(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; userId: string }
): Promise<NextResponse> {
  try {
    if (!validateContentType(req)) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 415 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as { kind?: number; position?: number; track?: Track };
    const kind = Number(body?.kind);
    const position = Number(body?.position);
    if (!Number.isFinite(kind) || !Number.isFinite(position) || !body?.track) {
      return NextResponse.json(
        { error: "bad_request", message: "Нужны kind, position и track." },
        { status: 400 }
      );
    }
    await resolveAmbiguousTrack(ctx.userId, id, kind, position, body.track);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, withAuth(postHandler));
