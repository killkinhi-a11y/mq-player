import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveWaveUser, recordWaveEvent } from "@/lib/wave/server";
import { WAVE_CONFIG } from "@/lib/wave/config";
import type { WaveEvent } from "@/lib/wave";

/**
 * POST /api/wave/feedback — normalized listening events (§4, §29).
 *
 * Body: { anonId?, sessionId?, trackId, event, position?, duration?,
 *         title?, artist?, genre?, scTrackId? }
 *
 * Security (§30): user identity resolves server-side (session cookie →
 * anonId). Events only ever touch the CALLER's own aggregate. Payload is
 * validated + rate-limited; no PII is stored beyond track metadata needed
 * for taste aggregation.
 */

const VALID_EVENTS = new Set<string>([
  "play_started", "play_progress", "play_completed", "track_replayed",
  "track_skipped", "track_liked", "track_unliked", "track_added_to_playlist",
  "track_added_to_queue", "wave_started", "wave_seed_changed",
  "more_like_this", "less_like_this", "not_interested",
]);

function parseEvent(body: Record<string, unknown>): WaveEvent | null {
  const type = body.event;
  const trackId = body.trackId;
  if (typeof type !== "string" || !VALID_EVENTS.has(type)) return null;
  if (typeof trackId !== "string" || trackId.length === 0 || trackId.length > 128) return null;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;
  return {
    type: type as WaveEvent["type"],
    trackId,
    scTrackId: num(body.scTrackId),
    title: str(body.title, 200),
    artist: str(body.artist, 200),
    genre: str(body.genre, 100),
    position: num(body.position),
    duration: num(body.duration),
    at: typeof body.at === "number" && body.at > 0 ? body.at : Date.now(),
  };
}

async function postHandler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const anonId = typeof body.anonId === "string" ? body.anonId : undefined;
    const user = await resolveWaveUser(request, anonId);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const event = parseEvent(body);
    if (!event) {
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    }
    recordWaveEvent(user.userId, event);
    return NextResponse.json({ ok: true, userId: user.userId.slice(0, 12) + "…", profileVersion: Date.now() });
  } catch (err) {
    console.error("[wave] feedback error:", err);
    return NextResponse.json({ error: "feedback_failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.write, postHandler);
