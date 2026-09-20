import { NextResponse } from "next/server";
import { ANDROID_STABLE_VERSION, ANDROID_APK_URL } from "@/lib/androidRelease";

/**
 * App Version API — возвращает последнюю версию Android APK.
 *
 * Используется:
 *  - Capacitor-приложением (useAppUpdate) для проверки обновлений;
 *  - карточкой «Скачать приложение» в настройках (версия + что нового).
 *
 * latestVersion = актуальная STABLE версия GitHub Release (android-vX.Y.Z).
 */
export async function GET() {
  return NextResponse.json({
    latestVersion: process.env.APP_VERSION || ANDROID_STABLE_VERSION,
    downloadUrl: "https://github.com/killkinhi-a11y/mq-player/releases/latest",
    minVersion: "1.0.0",
    apkUrl: ANDROID_APK_URL,
  }, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
