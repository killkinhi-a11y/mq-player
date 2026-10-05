/**
 * Wave reason → user-facing text (§15, ru — matches the app language).
 * The text only ever references data that actually exists (seedRef is the
 * real attribution target produced by the engine).
 *
 * V2 tone (PART 2): reasons are SECONDARY — they explain, they don't shout.
 * Attribution reads like a sentence a friend would say
 * ("Потому что тебе нравится X"), not like a system label.
 */

import type { WaveReason } from "./types";

export function waveReasonText(reason: WaveReason, seedRef?: string): string {
  switch (reason) {
    case "similar_track":
      return seedRef ? `Похоже на «${seedRef}»` : "Похожий трек";
    case "similar_artist":
      return seedRef ? `В стиле ${seedRef}` : "Похожее звучание";
    case "favorite_artist":
      return seedRef ? `Потому что тебе нравится ${seedRef}` : "Твой любимый артист";
    case "favorite_genre":
      return seedRef ? `Тебе нравится ${seedRef}` : "Твой любимый жанр";
    case "recent_listening":
      return "Продолжение твоего потока";
    case "taste_profile":
      return "По твоему вкусу";
    case "exploration":
      return seedRef ? `Новое рядом с ${seedRef}` : "Новое для тебя";
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
      return "Волна по твоему вкусу";
  }
}
