import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runWave, parseSignals } from "@/lib/wave/route-helpers";
import { createWaveServerSession, resolveWaveUser } from "@/lib/wave/server";
import type { WaveSignals } from "@/lib/wave";

/**
 * POST /api/wave — start a wave session (§29).
 *
 * Body: WaveSignals (anonId, seed, taste signals, exclusions).
 * Returns: { sessionId, seed, tracks[], reasons[], meta }
 *
 * Identity (§30): the session cookie wins; otherwise the validated anonId
 * from the body. The client can never pick another user's identity — the
 * session record is created AFTER server-side user resolution and owned
 * by that user.
 */
async function postHandler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const anonId = typeof body.anonId === "string" ? body.anonId : undefined;
    const signals = parseSignals(body);
    if (!signals.seed) {
      signals.seed = { kind: "taste", label: "Ваш вкус" };
    }
    const user = await resolveWaveUser(request, anonId);
    if (!user) {
      return NextResponse.json({ error: "Требуется анонимный идентификатор или вход" }, { status: 401 });
    }
    const session = createWaveServerSession(user.userId, signals.seed);
    return await runWave(request, { sessionId: session.id, signals, bodyAnonId: anonId });
  } catch (err) {
    console.error("[wave] start error:", err);
    return NextResponse.json(
      { sessionId: "local_error", seed: null, tracks: [], reasons: [], meta: { error: "wave_start_failed" } },
      { status: 200 },
    );
  }
}

/**
 * GET /api/wave — lightweight start via query params (health/simple seeds):
 *   /api/wave?anonId=...&seedKind=track&scTrackId=123&label=...
 */
async function getHandler(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const seedKind = p.get("seedKind") || "taste";
    const scTrackId = Number(p.get("scTrackId")) || undefined;
    const signals: WaveSignals = {
      seed: {
        kind: seedKind as "track" | "artist" | "album" | "playlist" | "genre" | "taste",
        scTrackId,
        artist: p.get("artist") || undefined,
        genre: p.get("genre") || undefined,
        label: p.get("label") || "Волна",
      },
      likedArtists: (p.get("likedArtists") || "").split(",").filter(Boolean).slice(0, 10),
      historyScIds: (p.get("historyScIds") || "").split(",").map(Number).filter((n) => n > 0).slice(0, 10),
    };
    const user = await resolveWaveUser(request);
    if (!user) {
      return NextResponse.json({ error: "Требуется анонимный идентификатор или вход" }, { status: 401 });
    }
    const session = createWaveServerSession(user.userId, signals.seed);
    return await runWave(request, { sessionId: session.id, signals });
  } catch (err) {
    console.error("[wave] get error:", err);
    return NextResponse.json(
      { sessionId: "local_error", seed: null, tracks: [], reasons: [], meta: { error: "wave_get_failed" } },
      { status: 200 },
    );
  }
}

export const POST = withRateLimit(RATE_LIMITS.medium, postHandler);
export const GET = withRateLimit(RATE_LIMITS.medium, getHandler);
