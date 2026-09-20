/**
 * androidRelease.ts — single source of truth for the ANDROID STABLE release
 * that the website advertises (download card, app-version API, update copy).
 *
 * Keep the copy HUMAN — plain language only, no engineering terms. A user
 * must understand what changed in 5–10 seconds. The regression test
 * (android-apk-url-regression.test.ts) enforces this on the strings below.
 * Update this file together with every stable GitHub release (android-vX.Y.Z).
 */

/** Latest STABLE Android version served by GitHub Releases `latest`. */
export const ANDROID_STABLE_VERSION = "2.3.5";

/** Human release date (shown as a hint, not critical). */
export const ANDROID_RELEASED_AT = "21 сентября 2026";

/** Permanent APK link — `latest` survives every future release. */
export const ANDROID_APK_URL =
  "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk";

/** Human-readable "Что нового" — short, plain-language bullets. */
export const ANDROID_WHATS_NEW: readonly string[] = [
  "Библиотека стала удобнее: один поиск вместо двух, честная история «Сегодня» и «Ранее», добавление треков в плейлисты сразу пачкой.",
  "Плеер лучше подстраивается под размер экрана — обложка и кнопки больше не обрезаются на узких телефонах.",
  "Меню трека стало понятнее: длинные названия плейлистов помещаются, а кнопка «Назад» больше не закрывает меню целиком.",
  "Настройки стали проще: переключатели нажимаются по всей строке, выбор темы больше не «прыгает».",
  "Поиск и клавиатура: кнопка очистки стала крупнее, клавиатура не перекрывает результаты.",
  "Обновили внешний вид экранов и анимации — всё плавнее и аккуратнее.",
  "Улучшили управление музыкой: повторы, очередь и переход между экранами работают стабильнее.",
] as const;
