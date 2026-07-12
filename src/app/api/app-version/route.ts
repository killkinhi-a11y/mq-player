import { NextResponse } from "next/server";

/**
 * App Version API — возвращает последнюю версию APK.
 *
 * Используется Capacitor-приложением через useAppUpdate hook
 * для проверки обновлений при запуске и возврате из фона.
 */
export async function GET() {
  return NextResponse.json({
    latestVersion: process.env.APP_VERSION || "1.0.50",
    downloadUrl: "https://github.com/killkinhi-a11y/mq-player/releases/latest",
    minVersion: "1.0.0",
    apkUrl: "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/mq-player.apk",
  }, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
