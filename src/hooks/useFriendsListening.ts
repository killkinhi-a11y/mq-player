"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";

/**
 * useFriendsListening — polls /api/social/now-listening every 30s.
 * Returns list of friends who are currently listening to something.
 *
 * Also provides `updateMyStatus(track, isPlaying, progress)` which the
 * audio engine should call every ~10s while playing.
 *
 * Phase 2C: polling is gated through the auth gate — demo/unauthenticated
 * sessions never poll, and a 401 suspends polling (controlled recovery)
 * instead of silently retrying forever.
 */

export interface FriendListening {
  userId: string;
  username: string;
  avatar: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
  scTrackId?: number | null;
}

export function useFriendsListening() {
  const [friends, setFriends] = useState<FriendListening[]>([]);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFriends = useCallback(async () => {
    // Gate: real authenticated sessions only (demo/unauth never poll).
    const st = useAppStore.getState();
    if (!canPollProtected(st.userId, st.isAuthenticated)) return;
    try {
      const res = await fetch("/api/social/now-listening");
      if (res.status === 401) {
        // Controlled recovery — stops repeated 401s until next login.
        controlled401Recovery("social/now-listening");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setFriends(data.friends || []);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Re-evaluate on every auth change; the interval itself only runs
    // while a real session is active.
    if (!isAuthenticated) {
      setFriends([]);
      setLoading(false);
      return;
    }
    if (!canPollProtected(useAppStore.getState().userId, isAuthenticated)) {
      setLoading(false);
      return;
    }
    fetchFriends();
    intervalRef.current = setInterval(() => {
      if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        return;
      }
      fetchFriends();
    }, 30000); // 30s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, fetchFriends]);

  // Pause polling when tab is hidden (saves API calls)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        const st = useAppStore.getState();
        if (!canPollProtected(st.userId, st.isAuthenticated)) return;
        fetchFriends();
        intervalRef.current = setInterval(fetchFriends, 30000); // 30s
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchFriends]);

  return { friends, loading, refresh: fetchFriends };
}

/**
 * Updates the current user's listening status on the server.
 * Called by the audio engine every ~10s while playing.
 *
 * Phase 2C: gated — demo/unauthenticated sessions skip the request entirely
 * (previously this POSTed every 10s in demo mode → endless 401s).
 */
export async function updateMyListeningStatus(
  track: Track,
  isPlaying: boolean,
  progress: number,
  duration: number
): Promise<void> {
  const st = useAppStore.getState();
  if (!canPollProtected(st.userId, st.isAuthenticated)) return;
  try {
    const res = await fetch("/api/social/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: track.id,
        trackTitle: track.title,
        trackArtist: track.artist,
        trackCover: track.cover || "",
        scTrackId: track.scTrackId || null,
        isPlaying,
        progress,
        duration,
        source: track.source || "soundcloud",
      }),
    });
    if (res.status === 401) {
      controlled401Recovery("social/update-status");
    }
  } catch {
    // Silent — best-effort update
  }
}
