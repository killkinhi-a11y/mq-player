"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";

/**
 * Hook that syncs a collaborative listening session via polling.
 *
 * - Guest: polls GET /api/listen-session every 3s; syncs track/progress/isPlaying from host.
 * - Host: polls GET /api/listen-session every 3s to detect session deletion;
 *         POSTs progress+isPlaying every 3s.
 *
 * Polling automatically stops when the session is cleared.
 */
export function useListenSessionSync() {
  const guestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostPostIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helper: clear all intervals ──
  const clearAllIntervals = useRef(() => {
    if (guestIntervalRef.current) { clearInterval(guestIntervalRef.current); guestIntervalRef.current = null; }
    if (hostPostIntervalRef.current) { clearInterval(hostPostIntervalRef.current); hostPostIntervalRef.current = null; }
    if (hostCheckIntervalRef.current) { clearInterval(hostCheckIntervalRef.current); hostCheckIntervalRef.current = null; }
  });

  // ── Guest: poll and sync from host ──
  useEffect(() => {
    const poll = async () => {
      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || session.isHost) {
        // No session or user is host — clear guest interval
        if (guestIntervalRef.current) { clearInterval(guestIntervalRef.current); guestIntervalRef.current = null; }
        return;
      }

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

        // Track changed — set directly without adding to history
        if (activeSession.trackId && activeSession.trackId !== store.currentTrack?.id) {
          useAppStore.setState({
            currentTrack: {
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
            queue: [],
            queueIndex: 0,
            progress: 0,
            duration: 0,
            isPlaying: true,
          });
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
            if (!store.isPlaying) store.togglePlay();
          } else {
            if (store.isPlaying) store.togglePlay();
          }
        }
      } catch {
        // silent — will retry on next interval
      }
    };

    poll();
    guestIntervalRef.current = setInterval(poll, 3000);

    return () => {
      if (guestIntervalRef.current) { clearInterval(guestIntervalRef.current); guestIntervalRef.current = null; }
    };
  }, []);

  // ── Host: POST progress/isPlaying every 3s ──
  useEffect(() => {
    const hostInterval = setInterval(async () => {
      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || !session.isHost) {
        // No session or user is guest — clear host interval
        if (hostPostIntervalRef.current) { clearInterval(hostPostIntervalRef.current); hostPostIntervalRef.current = null; }
        return;
      }
      if (!state.currentTrack) return;

      try {
        const res = await fetch("/api/listen-session", {
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

        // If session was deleted (guest left), stop polling
        if (res.status === 404 || res.status === 410) {
          useAppStore.getState().clearListenSession();
        }
      } catch {
        // silent
      }
    }, 3000);

    hostPostIntervalRef.current = hostInterval;

    return () => {
      if (hostPostIntervalRef.current) { clearInterval(hostPostIntervalRef.current); hostPostIntervalRef.current = null; }
    };
  }, []);

  // ── Host: detect session deletion (guest left) — check via GET every 5s ──
  useEffect(() => {
    const checkSession = async () => {
      const session = useAppStore.getState().listenSession;
      if (!session || !session.isHost) {
        if (hostCheckIntervalRef.current) { clearInterval(hostCheckIntervalRef.current); hostCheckIntervalRef.current = null; }
        return;
      }

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

    // Slight delay to avoid racing with the POST interval
    const interval = setInterval(checkSession, 5000);
    hostCheckIntervalRef.current = interval;

    return () => {
      if (hostCheckIntervalRef.current) { clearInterval(hostCheckIntervalRef.current); hostCheckIntervalRef.current = null; }
    };
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

          // If host with a session, immediately POST current track data to DB
          if (data.hosted) {
            const state = useAppStore.getState();
            if (state.currentTrack) {
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
            }
          }
        }
      } catch {
        // silent
      }
    };

    init();
  }, []);
}
