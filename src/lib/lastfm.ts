/**
 * Last.fm scrobbling support (M5.2).
 *
 * Scrobbles tracks to Last.fm when the user has connected their account.
 * A scrobble is sent when:
 *   - The track has been played for at least 50% of its duration, OR
 *   - The track has been played for at least 4 minutes (whichever comes first)
 *
 * To enable:
 *   1. Set LASTFM_API_KEY and LASTFM_SHARED_SECRET in env
 *   2. User connects via /api/lastfm/auth → gets a session key
 *   3. Session key stored in UserSync table as key "lastfm_session"
 *   4. On track play >50%, /api/lastfm/scrobble is called
 *
 * This module provides the client-side logic for tracking play duration
 * and triggering scrobbles.
 */

import type { Track } from "@/lib/musicApi";

const SCROBBLE_MIN_DURATION_RATIO = 0.5; // 50% of track duration
const SCROBBLE_MIN_ABSOLUTE_MS = 4 * 60 * 1000; // 4 minutes
const SCROBBLE_MIN_TRACK_DURATION_MS = 30 * 1000; // track must be >30s to scrobble

export interface ScrobbleData {
  track: string;
  artist: string;
  album?: string;
  timestamp: number;
  duration?: number;
}

/**
 * Check if a track play should be scrobbled based on play duration.
 * Last.fm rules: track played for at least half its duration, OR at least
 * 4 minutes, whichever occurs first. Track must be at least 30 seconds long.
 */
export function shouldScrobble(
  playedDurationMs: number,
  trackDurationMs: number,
): boolean {
  if (trackDurationMs < SCROBBLE_MIN_TRACK_DURATION_MS) return false;
  const halfDuration = trackDurationMs * SCROBBLE_MIN_DURATION_RATIO;
  return playedDurationMs >= halfDuration || playedDurationMs >= SCROBBLE_MIN_ABSOLUTE_MS;
}

/**
 * Send a "now playing" update to Last.fm (called when a track starts playing).
 * This is optional — scrobble is the main event.
 */
export async function sendNowPlaying(
  track: Track,
  sessionKey: string,
): Promise<void> {
  if (!sessionKey) return;
  try {
    await fetch("/api/lastfm/now-playing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track: track.title,
        artist: track.artist,
        album: track.album || "",
        sessionKey,
      }),
    });
  } catch (e) {
    console.warn("[Last.fm] Now playing failed:", e);
  }
}

/**
 * Scrobble a track to Last.fm.
 */
export async function scrobbleTrack(
  track: Track,
  sessionKey: string,
  playedAt: number = Date.now(),
): Promise<{ success: boolean; error?: string }> {
  if (!sessionKey) return { success: false, error: "No session key" };

  try {
    const res = await fetch("/api/lastfm/scrobble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track: track.title,
        artist: track.artist,
        album: track.album || "",
        timestamp: Math.floor(playedAt / 1000),
        duration: track.duration || 0,
        sessionKey,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Last.fm auth URL — redirect user here to authorize.
 * Returns to /api/lastfm/callback after authorization.
 */
export function getLastFMAuthUrl(apiKey: string): string {
  const callback = `${window.location.origin}/api/lastfm/callback`;
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(callback)}`;
}
