"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";

/**
 * useFriendsListening — polls /api/social/now-listening every 15s.
 * Returns list of friends who are currently listening to something.
 *
 * Also provides `updateMyStatus(track, isPlaying, progress)` which the
 * audio engine should call every ~10s while playing.
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
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/social/now-listening");
      if (!res.ok) return;
      const data = await res.json();
      setFriends(data.friends || []);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFriends([]);
      setLoading(false);
      return;
    }
    fetchFriends();
    intervalRef.current = setInterval(fetchFriends, 30000); // 30s (was 15s — reduced for less load)
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
 */
export async function updateMyListeningStatus(
  track: Track,
  isPlaying: boolean,
  progress: number,
  duration: number
): Promise<void> {
  try {
    await fetch("/api/social/update-status", {
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
  } catch {
    // Silent — best-effort update
  }
}
