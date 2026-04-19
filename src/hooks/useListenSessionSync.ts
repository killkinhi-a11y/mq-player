"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";

/**
 * Hook that syncs a collaborative listening session via polling.
 *
 * - Guest: polls GET /api/listen-session every 3s; syncs track/progress/isPlaying from host.
 * - Host: polls GET /api/listen-session every 3s to detect session deletion;
 *         POSTs progress+isPlaying every 3s.
 */
export function useListenSessionSync() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Guest: poll and sync from host ──
  useEffect(() => {
    const poll = async () => {
      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || session.isHost) return;

      try {
        const res = await fetch("/api/listen-session");
        if (!res.ok) return;
        const data = await res.json();

        // Check if session was deleted (host left or guest left)
        const activeSession = data.joined || data.hosted;
        if (!activeSession) {
          useAppStore.getState().clearListenSession();
          return;
        }

        const s = useAppStore.getState();
        const store = s as any;

        // Track changed — play the new track
        if (activeSession.trackId && activeSession.trackId !== store.currentTrack?.id) {
          store.playTrack(
            {
              id: activeSession.trackId,
              title: activeSession.trackTitle || "",
              artist: activeSession.trackArtist || "",
              cover: activeSession.trackCover || "",
              audioUrl: activeSession.audioUrl || "",
              duration: 0,
              album: "",
              genre: "",
              source: (activeSession.source as any) || "soundcloud",
              scTrackId: activeSession.scTrackId,
            } as Track,
            []
          );
        }

        // Sync progress (seek if differs by > 3s)
        if (typeof activeSession.progress === "number" && store.currentTrack) {
          const currentProgress = store.progress || 0;
          if (Math.abs(currentProgress - activeSession.progress) > 3) {
            store.setProgress(activeSession.progress);
          }
        }

        // Sync play/pause
        if (typeof activeSession.isPlaying === "boolean" && store.isPlaying !== activeSession.isPlaying) {
          if (activeSession.isPlaying) {
            // If store says paused but host says playing, toggle
            if (!store.isPlaying) store.togglePlay();
          } else {
            // If store says playing but host says paused, toggle
            if (store.isPlaying) store.togglePlay();
          }
        }
      } catch {
        // silent — will retry on next interval
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Host: POST progress/isPlaying every 3s ──
  useEffect(() => {
    const hostInterval = setInterval(async () => {
      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || !session.isHost) return;
      if (!state.currentTrack) return;

      try {
        await fetch("/api/listen-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            progress: state.progress || 0,
            isPlaying: state.isPlaying,
            trackId: state.currentTrack.id,
            trackTitle: state.currentTrack.title,
            trackArtist: state.currentTrack.artist,
            trackCover: state.currentTrack.cover,
            scTrackId: state.currentTrack.scTrackId,
            audioUrl: state.currentTrack.audioUrl,
            source: state.currentTrack.source,
          }),
        });
      } catch {
        // silent
      }
    }, 3000);

    hostIntervalRef.current = hostInterval;
    return () => {
      if (hostIntervalRef.current) clearInterval(hostIntervalRef.current);
    };
  }, []);

  // ── Host: detect session deletion (guest left) ──
  useEffect(() => {
    const checkSession = async () => {
      const session = useAppStore.getState().listenSession;
      if (!session || !session.isHost) return;

      try {
        const res = await fetch("/api/listen-session");
        if (!res.ok) return;
        const data = await res.json();

        // If our hosted session is gone, the guest left
        if (!data.hosted) {
          useAppStore.getState().clearListenSession();
        }
      } catch {
        // silent
      }
    };

    // Check every 5s (less frequent than the POST)
    const interval = setInterval(checkSession, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Initialize: check for existing session on mount ──
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/listen-session");
        if (!res.ok) return;
        const data = await res.json();

        const active = data.hosted || data.joined;
        if (active) {
          useAppStore.getState().setListenSession(active);
        }
      } catch {
        // silent
      }
    };

    init();
  }, []);
}
