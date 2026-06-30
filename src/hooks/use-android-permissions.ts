"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * useAndroidPermissions — requests Android runtime permissions on first launch.
 *
 * On Android 13+ (API 33+), POST_NOTIFICATIONS must be requested at runtime.
 * This hook requests it once when the user is authenticated and a track
 * starts playing for the first time.
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
        // Request notification permission (covers media notification on Android 13+)
        const localNotif = await import("@capacitor/local-notifications");
        await localNotif.LocalNotifications.requestPermissions();
      } catch (e) {
        // Plugin not available or permission already granted
      }
    };

    // Request when first track starts playing
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.currentTrack && !prev.currentTrack) {
        requestPermissions();
      }
    });

    return () => unsub();
  }, []);
}

