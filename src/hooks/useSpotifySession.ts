"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { spotifyAuth } from "@/lib/spotify/auth";
import { spotifyPlaybackAdapter, isSpotifyPlaybackBrowserSupported } from "@/lib/spotify/playbackAdapter";
import { toast } from "@/hooks/use-toast";

/**
 * useSpotifySession — mounts once (AppShell), keeps the store's Spotify
 * slice in sync with the real PKCE session and exposes connect/disconnect.
 *
 * The store fields are the SINGLE source of truth for UI; the auth manager
 * is the source of truth for tokens (localStorage) — this hook bridges them.
 */
export function useSpotifySession() {
  const [ready, setReady] = useState(false);
  const setSpotifySession = useAppStore((s) => s.setSpotifySession);

  const sync = useCallback(() => {
    setSpotifySession({
      connected: spotifyAuth.getStatus().connected,
      premium: spotifyAuth.getStatus().premium,
      displayName: spotifyAuth.getStatus().user?.displayName ?? null,
      playbackSupported: isSpotifyPlaybackBrowserSupported(),
    });
  }, [setSpotifySession]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Load the public Client ID (server env) — feature availability.
      await spotifyAuth.loadConfig();
      if (!alive) return;
      // 2) If a session exists, refresh /me so the premium flag is honest.
      if (spotifyAuth.getStatus().connected) {
        await spotifyAuth.fetchMe();
      }
      if (!alive) return;
      sync();
      setReady(true);
    })();

    const off = spotifyAuth.subscribe(() => sync());
    return () => {
      alive = false;
      off();
    };
  }, [sync]);

  const connect = useCallback(async () => {
    try {
      await spotifyAuth.beginLogin();
    } catch (e) {
      // Honest degradation: an unconfigured server (missing public Client
      // ID — e.g. a Preview deployment without the env var) must TELL the
      // user instead of leaving a dead connect button.
      if (e instanceof Error && e.message === "SPOTIFY_NOT_CONFIGURED") {
        toast({
          title: "Spotify не настроен",
          description: "Сервер не вернул публичный Client ID Spotify — проверьте переменные окружения проекта.",
        });
        return;
      }
      throw e;
    }
  }, []);

  const disconnect = useCallback(() => {
    spotifyPlaybackAdapter.resetSession();
    spotifyAuth.logout();
    useAppStore.getState().setSpotifyFallbackNotice(null);
    // If official playback was active, drop to the element engine state.
    if (useAppStore.getState().playbackMode === "spotify") {
      useAppStore.setState({ playbackMode: "idle", isPlaying: false, playbackState: "idle" });
    }
    sync();
  }, [sync]);

  return { ready, connect, disconnect, sync };
}
