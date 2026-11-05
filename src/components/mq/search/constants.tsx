"use client";

// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.
import { Disc, Flame, Heart, Mic, Music, Piano, Radio, Zap } from "lucide-react";

// ── Trending search terms ──
export const TRENDING_SEARCHES = [
  "Поп", "Рок", "Хип-хоп", "Электроника", "Инди", "R&B", "Джаз",
];

// ── Cold-start catalog rotation (V2 §1.3): which genre feeds the
//    "Популярная музыка" discovery block on a fresh profile. Real catalog
//    data only — the rotation just gives it a curated feel per day. ──
export const COLD_START_GENRES = ["Pop", "Rock", "Electronic", "Hip-Hop", "Jazz", "Classical", "R&B"];

// How many recent-search rows show before "Показать ещё" (§1.4)
export const RECENT_ROWS_VISIBLE = 6;

// ── Genre icons mapping ──
export const genreIcons: Record<string, React.ReactNode> = {
  "Pop": <Music className="w-3.5 h-3.5" />,
  "Rock": <Flame className="w-3.5 h-3.5" />,
  "Electronic": <Zap className="w-3.5 h-3.5" />,
  "Hip-Hop": <Mic className="w-3.5 h-3.5" />,
  "Jazz": <Disc className="w-3.5 h-3.5" />,
  "Classical": <Piano className="w-3.5 h-3.5" />,
  "R&B": <Heart className="w-3.5 h-3.5" />,
  "Indie": <Radio className="w-3.5 h-3.5" />,
};

// ── Genre accent text colors (DESIGN COMPLETION: muted neutral — genre
//    tags are metadata, not alerts; red stays reserved for rare accents) ──
export const genreAccentColors: Record<string, string> = {
  "Pop": "var(--mq-text-muted)",
  "Rock": "var(--mq-text-muted)",
  "Electronic": "var(--mq-text-muted)",
  "Hip-Hop": "var(--mq-text-muted)",
  "Jazz": "var(--mq-text-muted)",
  "Classical": "var(--mq-text-muted)",
  "R&B": "var(--mq-text-muted)",
  "Indie": "var(--mq-text-muted)",
};
