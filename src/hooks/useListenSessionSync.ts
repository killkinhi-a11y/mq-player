"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";

/**
 * Hook that syncs a collaborative listening session via polling.
 *
 * - Guest: polls GET /api/listen-session every 5s; syncs track/progress/isPlaying from host.
 * - Host: POSTs progress+isPlaying every 5s; also checks session existence in same request.
 *
 * Performance improvements:
 * - Reduced from 3 concurrent intervals (3s/3s/5s) to 2 intervals (5s/5s)
 * - Stops polling when no active session
 * - Pauses when document is hidden (tab switch)
 */
export function useListenSessionSync() {
  const guestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAuthenticatedRef = useRef(false);

  // Track auth state
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      isAuthenticatedRef.current = state.isAuthenticated;
    });
    isAuthenticatedRef.current = useAppStore.getState().isAuthenticated;
    return unsub;
  }, []);

  // ── Guest: poll and sync from host ──
  useEffect(() => {
    const poll = async () => {
      // Don't poll when tab is hidden or not authenticated
      if (document.hidden || !isAuthenticatedRef.current) return;

      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || session.isHost) return;

      try {
        const res = await fetch("/api/listen-session");
        if (!res.ok) return;
        const data = await res.json();

        const activeSession = data.joined || data.hosted;
        if (!activeSession) {
          useAppStore.getState().clearListenSession();
          return;
        }

        const store = useAppStore.getState() as any;

        // Track changed
        if (activeSession.trackId && activeSession.trackId !== store.currentTrack?.id) {
          const newTrack = {
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
          } as Track;
          setTimeout(() => useAppStore.setState({
            currentTrack: newTrack,
            queue: [],
            queueIndex: 0,
            progress: 0,
            duration: 0,
            isPlaying: true,
          }), 0);
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

    // Only start interval when there's an active guest session
    const startInterval = () => {
      if (guestIntervalRef.current) return;
      const check = () => {
        const session = useAppStore.getState().listenSession;
        if (session && !session.isHost) {
          poll();
          guestIntervalRef.current = setInterval(poll, 5000);
        }
      };
      check();
      // Re-check every 5s whether we need to start/stop the guest interval
      const metaInterval = setInterval(check, 5000);
      return () => clearInterval(metaInterval);
    };

    const cleanup = startInterval();

    return () => {
      if (guestIntervalRef.current) { clearInterval(guestIntervalRef.current); guestIntervalRef.current = null; }
      if (cleanup) cleanup();
    };
  }, []);

  // ── Host: POST progress/isPlaying + check session existence every 5s ──
  useEffect(() => {
    const hostTick = async () => {
      // Don't poll when tab is hidden or not authenticated
      if (document.hidden || !isAuthenticatedRef.current) return;

      const state = useAppStore.getState();
      const session = state.listenSession;
      if (!session || !session.isHost) return;
      if (!state.currentTrack) return;

      try {
        // Combine POST update + GET check into single request pair
        const [postRes, getRes] = await Promise.all([
          fetch("/api/listen-session", {
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
          }),
          fetch("/api/listen-session"),
        ]);

        // If session was deleted (guest left), stop polling
        if (postRes.status === 404 || postRes.status === 410) {
          useAppStore.getState().clearListenSession();
          return;
        }

        // Check if our hosted session is gone
        if (getRes.ok) {
          const data = await getRes.json();
          if (!data.hosted) {
            useAppStore.getState().clearListenSession();
          }
        }
      } catch {
        // silent
      }
    };

    // Only start interval when there's an active host session
    const startInterval = () => {
      if (hostIntervalRef.current) return;
      const check = () => {
        const session = useAppStore.getState().listenSession;
        if (session && session.isHost) {
          hostTick();
          hostIntervalRef.current = setInterval(hostTick, 5000);
        }
      };
      check();
      // Re-check every 5s whether we need to start/stop the host interval
      const metaInterval = setInterval(check, 5000);
      return () => clearInterval(metaInterval);
    };

    const cleanup = startInterval();

    return () => {
      if (hostIntervalRef.current) { clearInterval(hostIntervalRef.current); hostIntervalRef.current = null; }
      if (cleanup) cleanup();
    };
  }, []);

  // ── Initialize: check for existing session on mount ──
  useEffect(() => {
    const init = async () => {
      if (!isAuthenticatedRef.current) return;

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
