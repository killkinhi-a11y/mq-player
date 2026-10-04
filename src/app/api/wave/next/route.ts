import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runWave, parseSignals } from "@/lib/wave/route-helpers";
import { touchWaveServerSession } from "@/lib/wave/server";

/**
 * POST /api/wave/next — next batch for a running wave (§12 auto-refill).
 *
 * Body: WaveSignals + sessionId. The session's server record is touched
 * (batch counter) but identity ALWAYS re-resolves server-side — a client
 * cannot read another user's wave by guessing a sessionId (§30).
 */
async function postHandler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const anonId = typeof body.anonId === "string" ? body.anonId : undefined;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const signals = parseSignals(body);
    const response = await runWave(request, { sessionId, signals, bodyAnonId: anonId });

    // Observability only — never trusts the client for identity.
    try {
      const data = (await response.clone().json()) as { tracks?: unknown[] };
      if (sessionId && Array.isArray(data.tracks)) {
        touchWaveServerSession(sessionId, data.tracks.length);
      }
    } catch {
      // best-effort
    }
    return response;
  } catch (err) {
    console.error("[wave] next error:", err);
    return NextResponse.json(
      { tracks: [], reasons: [], meta: { error: "wave_next_failed" } },
      { status: 200 },
    );
  }
}

export const POST = withRateLimit(RATE_LIMITS.medium, postHandler);
