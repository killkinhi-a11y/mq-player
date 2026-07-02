"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * useAndroidPermissions — requests Android runtime permissions.
 *
 * On Android 13+ (API 33+), POST_NOTIFICATIONS must be requested at runtime.
 * This hook requests it once when the user is authenticated (not waiting
 * for the first track to play — the notification must be allowed BEFORE
 * audio starts for the media notification to appear).
 *
 * Also initializes the MediaSession plugin so it's ready before first track.
 */
export function useAndroidPermissions() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    let requested = false;

    const requestPermissions = async () => {
      if (requested) return;
      requested = true;

      try {
        // 1. Request local notifications permission (covers POST_NOTIFICATIONS)
        const localNotif = await import("@capacitor/local-notifications");
        await localNotif.LocalNotifications.requestPermissions();
      } catch (e) {
        // Plugin not available or permission already granted
      }

      try {
        // 2. Initialize MediaSession plugin early — must be ready before
        // first track plays, otherwise Android won't show media notification
        const mediaSession = await import("@capgo/capacitor-media-session");
        const MediaSession = mediaSession.MediaSession;
        // Set initial placeholder state so Android knows we're a media app
        await MediaSession.setPlaybackState({ playbackState: "paused" });
      } catch (e) {
        // Plugin not available
      }
    };

    // Request as soon as the user is authenticated
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.isAuthenticated && !prev.isAuthenticated) {
        requestPermissions();
      }
      // Safety net: also request when first track starts
      if (state.currentTrack && !prev.currentTrack) {
        requestPermissions();
      }
    });

    // If already authenticated on mount (e.g., rehydrated), request immediately
    if (useAppStore.getState().isAuthenticated) {
      requestPermissions();
    }

    return () => unsub();
  }, []);
}

