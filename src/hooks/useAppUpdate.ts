"use client";

import { useEffect, useState } from "react";
import { isCapacitor, APP_URL } from "@/lib/config";

/**
 * useAppUpdate — проверяет обновления APK в Capacitor контексте.
 *
 * Как работает:
 *  1. При запуске APP_URL/api/app-version возвращает последнюю версию APK
 *  2. Сравнивает с текущей версией из package.json (через capacitor App plugin)
 *  3. Если есть обновление — показывает toast с кнопкой "Скачать"
 *  4. Кнопка открывает GitHub Releases страницу
 *
 * В web-версии (не APK) — ничего не делает.
 */

interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
}

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!isCapacitor()) return;

    let cancelled = false;

    const checkForUpdates = async () => {
      try {
        // Get current app version from Capacitor App plugin
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        const currentVersion = info.version; // e.g. "1.0.50"

        // Fetch latest version from server
        const res = await fetch(`${APP_URL}/api/app-version`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const data = await res.json();
        const latestVersion = data.latestVersion;

        if (cancelled) return;

        // Compare versions (semantic: major.minor.patch)
        const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

        setUpdateInfo({
          hasUpdate,
          latestVersion,
          currentVersion,
          downloadUrl: data.downloadUrl || "https://github.com/killkinhi-a11y/mq-player/releases/latest",
        });
      } catch (err) {
        // Silent fail — update check is best-effort
        console.debug("[AppUpdate] check failed:", err);
      }
    };

    // Check on app launch
    checkForUpdates();

    // Check when app comes to foreground
    const setupListener = async () => {
      const { App } = await import("@capacitor/app");
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          checkForUpdates();
        }
      });
    };
    setupListener();

    return () => {
      cancelled = true;
    };
  }, []);

  return updateInfo;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
