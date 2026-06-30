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
        const localNotif = await import("@capacitor/local-notifications");
        await localNotif.LocalNotifications.requestPermissions();
      } catch (e) {
        // Plugin not available or permission already granted
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
