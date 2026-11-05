// Extracted from MainView.tsx (Stage III decomposition) — moved verbatim.
import type { Track } from "@/lib/musicApi";

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getWaveGradient(): string {
  // Layered composition instead of a single flat diagonal:
  // 1. radial "light pool" top-left — the card reads as lit from a corner,
  // giving depth without any asset or extra request;
  // 2. softer diagonal base wash;
  // 3. deep vignette toward bottom-right so content stays high-contrast.
  // (VLM audit: the previous single linear gradient looked "flat/cheap".)
  return [
    `radial-gradient(120% 150% at 16% 6%, color-mix(in srgb, #3a4258 30%, var(--mq-bg)) 0%, color-mix(in srgb, #2c3346 16%, var(--mq-bg)) 36%, transparent 64%)`,
    `linear-gradient(135deg, color-mix(in srgb, #232a3c 26%, var(--mq-bg)) 0%, color-mix(in srgb, #1a1f2c 12%, var(--mq-bg)) 52%, var(--mq-bg) 100%)`,
  ].join(", ");
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export function currentDate(): string {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ══════════════════════════════════════════════════════════════════════════
// MOBILE NOW HERO (Task 3 — new mobile Home composition).
// The user's main state (current track + real progress + transport) becomes
// the visually dominant block on phones: full-width square artwork, big
// 64px play target, 48px skips. Nothing decorative — every element is a
// real control or real playback state. Desktop keeps its own layout below.
// ══════════════════════════════════════════════════════════════════════════
// Honest "why this track" context — computed ONLY from the real reason
// metadata the recommendation engine attached to the track (_reason /
// _seedArtist). No synthesized explanations: unknown → empty (the caller
// falls back to nothing — reason only, no status text).
export function waveReasonText(track: Track): string {
  switch (track._reason) {
    // ── Wave engine reasons (lib/wave — §15, V2 tone) ──
    case "similar_track":
      return track._seedArtist ? `Похоже на «${track._seedArtist}»` : "Похожий трек";
    case "similar_artist":
      return track._seedArtist ? `В стиле ${track._seedArtist}` : "Похожее звучание";
    case "favorite_artist":
      return track._seedArtist ? `Потому что тебе нравится ${track._seedArtist}` : "Твой любимый артист";
    case "favorite_genre":
      return track._seedArtist ? `Тебе нравится ${track._seedArtist}` : "Твой любимый жанр";
    case "recent_listening":
      return "Продолжение твоего потока";
    case "taste_profile":
      return "По твоему вкусу";
    case "exploration":
      return track._seedArtist ? `Новое рядом с ${track._seedArtist}` : "Новое для тебя";
    // ── Legacy radio/recommendations reasons (fallback path) ──
    case "related_current":
      return track._seedArtist ? `Похоже на ${track._seedArtist}` : "Похожий трек";
    case "related_history":
      return "Из твоей истории";
    case "related_to_liked":
      return "По твоим лайкам";
    case "liked_artist":
      return track._seedArtist ? `Твой артист · ${track._seedArtist}` : "Твой артист";
    case "artist_match":
      return "Твой артист";
    case "discovery":
      return "Открытие для тебя";
    case "trending":
      return "Популярно сейчас";
    default:
      return "";
  }
}
