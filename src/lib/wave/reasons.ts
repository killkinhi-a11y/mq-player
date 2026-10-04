/**
 * Wave reason → user-facing text (§15, ru — matches the app language).
 * The text only ever references data that actually exists (seedRef is the
 * real attribution target produced by the engine).
 */

import type { WaveReason } from "./types";

export function waveReasonText(reason: WaveReason, seedRef?: string): string {
  switch (reason) {
    case "similar_track":
      return seedRef ? `Похоже на «${seedRef}»` : "Похожий трек";
    case "similar_artist":
      return seedRef ? `В стиле ${seedRef}` : "Похожий артист";
    case "favorite_artist":
      return "Любимый артист";
    case "favorite_genre":
      return "Любимый жанр";
    case "recent_listening":
      return "Продолжение вашего потока";
    case "taste_profile":
      return "По вашему вкусу";
    case "exploration":
      return "Новое для вас";
    default:
      return "Волна";
  }
}

/** Short label for the seed chip in the Wave UI. */
export function waveSeedLabel(kind: string, label: string): string {
  switch (kind) {
    case "track":
      return `Волна от «${label}»`;
    case "artist":
      return `Волна по артисту ${label}`;
    case "album":
      return `Волна по альбому «${label}»`;
    case "playlist":
      return `Волна по плейлисту «${label}»`;
    case "genre":
      return `Волна по жанру ${label}`;
    default:
      return "Волна по вашему вкусу";
  }
}
