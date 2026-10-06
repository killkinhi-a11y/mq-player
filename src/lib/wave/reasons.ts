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
      /* FINAL CORRECTION §14: user-facing copy says WAVE, never «Волна» —
         the radio mode's brand name is WAVE in every surface. */
      return "WAVE";
  }
}

/** Short label for the seed chip in the Wave UI.
 *  FINAL CORRECTION §14: the mode name is WAVE everywhere user-facing. */
export function waveSeedLabel(kind: string, label: string): string {
  switch (kind) {
    case "track":
      return `WAVE от «${label}»`;
    case "artist":
      return `WAVE по артисту ${label}`;
    case "album":
      return `WAVE по альбому «${label}»`;
    case "playlist":
      return `WAVE по плейлисту «${label}»`;
    case "genre":
      return `WAVE по жанру ${label}`;
    default:
      return "WAVE по твоему вкусу";
  }
}
