/**
 * GET /api/yandex/playlists — the authorized user's Yandex playlists.
 *
 * Each entry carries an `imported` flag (this user has already imported this
 * playlist in a completed job) so the UI can warn about re-imports.
 * Yandex tokens are decrypted server-side and passed only to the adapter.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { adapterPlaylistsList } from "@/lib/yandex/adapter";
import { getTokenForUser, getCompletedImportKinds } from "@/lib/yandex/store";
import { YandexError } from "@/lib/yandex/types";
import { yandexErrorResponse } from "@/lib/yandex/route-helpers";

async function getHandler(
  req: NextRequest,
  ctx: { userId: string }
): Promise<NextResponse> {
  try {
    const token = await getTokenForUser(ctx.userId);
    if (!token) {
      throw new YandexError("no_yandex_account", "Аккаунт Яндекс.Музыки не подключён.", 401);
    }
    const [playlists, importedKinds] = await Promise.all([
      adapterPlaylistsList(token, req),
      getCompletedImportKinds(ctx.userId),
    ]);
    return NextResponse.json({
      playlists: playlists.map((p) => ({
        ...p,
        imported: importedKinds.has(Number(p.kind)),
      })),
    });
  } catch (err) {
    return yandexErrorResponse(err);
  }
}

export const GET = withRateLimit(RATE_LIMITS.read, withAuth(getHandler));
