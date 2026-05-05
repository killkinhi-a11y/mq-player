"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dna, Music, Heart, Zap, Clock, Radio, GitBranch, X, Play,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import DNAHelixVisual from "./DNAHelixVisual";

// ── Types ─────────────────────────────────────────────────────
interface SongDNAProps {
  track: {
    id: string;
    title: string;
    artist: string;
    genre: string;
    duration: number;
    cover: string;
    source: string;
    scTrackId?: number;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

interface GenealogyNode {
  id: string;
  label: string;
  role: "center" | "influence" | "fans";
  track?: Track;
  x: number;
  y: number;
}

// ── Genre relationships map ───────────────────────────────────
const GENRE_RELATIVES: Record<string, string[]> = {
  pop: ["dance", "electronic", "synth-pop"],
  rock: ["alternative", "indie", "punk"],
  "hip-hop": ["r&b", "trap", "lo-fi"],
  rap: ["r&b", "trap", "lo-fi"],
  electronic: ["house", "techno", "ambient"],
  edm: ["house", "techno", "trance"],
  jazz: ["soul", "funk", "blues"],
  classical: ["ambient", "orchestral", "neoclassical"],
  indie: ["alternative", "folk", "dream-pop"],
  "lo-fi": ["chill", "ambient", "hip-hop"],
  "lo-fi hip hop": ["chill", "ambient", "hip-hop"],
  "lofi": ["chill", "ambient", "hip-hop"],
  house: ["techno", "deep house", "electronic"],
  techno: ["house", "industrial", "electronic"],
  ambient: ["drone", "electronic", "classical"],
  soul: ["r&b", "jazz", "funk"],
  funk: ["soul", "jazz", "disco"],
  blues: ["jazz", "rock", "soul"],
  rnb: ["soul", "hip-hop", "pop"],
  "r&b": ["soul", "hip-hop", "pop"],
  folk: ["indie", "acoustic", "country"],
  country: ["folk", "rock", "pop"],
  metal: ["rock", "alternative", "punk"],
  punk: ["rock", "alternative", "metal"],
  alternative: ["rock", "indie", "punk"],
  trance: ["edm", "electronic", "techno"],
  dubstep: ["edm", "electronic", "trap"],
  trap: ["hip-hop", "r&b", "edm"],
  reggae: ["dub", "ska", "soul"],
  latin: ["reggaeton", "pop", "dance"],
  reggaeton: ["latin", "dance", "pop"],
  kpop: ["pop", "dance", "electronic"],
  "k-pop": ["pop", "dance", "electronic"],
  disco: ["funk", "soul", "dance"],
  dream: ["shoegaze", "indie", "ambient"],
  "dream-pop": ["shoegaze", "indie", "ambient"],
  shoegaze: ["dream-pop", "alternative", "noise"],
  acoustic: ["folk", "indie", "pop"],
  synthwave: ["synth-pop", "electronic", "retrowave"],
  "synth-pop": ["pop", "electronic", "synthwave"],
  deep: ["house", "electronic", "techno"],
  "deep house": ["house", "electronic", "techno"],
  chill: ["lo-fi", "ambient", "indie"],
};

// ── Genre to mood mapping ─────────────────────────────────────
const GENRE_MOODS: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  pop: { label: "энергичный", icon: Zap, color: "#f472b6" },
  dance: { label: "ритмичный", icon: Music, color: "#c084fc" },
  rock: { label: "мощный", icon: Zap, color: "#ef4444" },
  "hip-hop": { label: "драйвовый", icon: Zap, color: "#f59e0b" },
  rap: { label: "драйвовый", icon: Zap, color: "#f59e0b" },
  electronic: { label: "пульсирующий", icon: Music, color: "#06b6d4" },
  edm: { label: "эйфорический", icon: Music, color: "#8b5cf6" },
  house: { label: "глубокий", icon: Music, color: "#0ea5e9" },
  techno: { label: "тёмный", icon: Zap, color: "#64748b" },
  jazz: { label: "расслабленный", icon: Music, color: "#d97706" },
  classical: { label: "возвышенный", icon: Music, color: "#a78bfa" },
  ambient: { label: "медитативный", icon: Music, color: "#2dd4bf" },
  lofi: { label: "уютный", icon: Heart, color: "#fb923c" },
  "lo-fi": { label: "уютный", icon: Heart, color: "#fb923c" },
  "lo-fi hip hop": { label: "уютный", icon: Heart, color: "#fb923c" },
  indie: { label: "мечтательный", icon: Heart, color: "#34d399" },
  soul: { label: "тёплый", icon: Heart, color: "#f97316" },
  funk: { label: "грувовый", icon: Music, color: "#eab308" },
  blues: { label: "меланхоличный", icon: Music, color: "#3b82f6" },
  rnb: { label: "чувственный", icon: Heart, color: "#ec4899" },
  "r&b": { label: "чувственный", icon: Heart, color: "#ec4899" },
  folk: { label: "искренний", icon: Heart, color: "#84cc16" },
  country: { label: "свободный", icon: Music, color: "#ca8a04" },
  metal: { label: "агрессивный", icon: Zap, color: "#dc2626" },
  punk: { label: "бунтарский", icon: Zap, color: "#f43f5e" },
  alternative: { label: "неконформный", icon: GitBranch, color: "#a855f7" },
  chill: { label: "спокойный", icon: Heart, color: "#4ade80" },
  trance: { label: "трансовый", icon: Music, color: "#7c3aed" },
};

const DEFAULT_MOOD = { label: "нейтральный", icon: Music, color: "#94a3b8" };

// ── Genre display names (Russian) ─────────────────────────────
const GENRE_DISPLAY: Record<string, string> = {
  pop: "поп", rock: "рок", "hip-hop": "хип-хоп", rap: "рэп",
  electronic: "электроника", edm: "EDM", jazz: "джаз",
  classical: "классика", ambient: "эмбиент", indie: "инди",
  "lo-fi": "ло-фай", "lo-fi hip hop": "ло-фай хип-хоп", lofi: "ло-фай",
  house: "хаус", techno: "техно", soul: "соул", funk: "фанк",
  blues: "блюз", rnb: "R&B", "r&b": "R&B", folk: "фолк",
  country: "кантри", metal: "метал", punk: "панк",
  alternative: "альтернатива", chill: "чилл", dance: "дэнс",
  trance: "транс", dubstep: "дабстеп", trap: "трэп",
  reggae: "регги", latin: "латин", reggaeton: "реггетон",
  kpop: "K-pop", "k-pop": "K-pop", disco: "диско",
  dream: "дрим", "dream-pop": "дрим-поп", shoegaze: "шугейз",
  acoustic: "акустик", synthwave: "синтвейв", "synth-pop": "синт-поп",
  "deep house": "дип-хаус", deep: "дип",
};

function getGenreDisplay(genre: string): string {
  const g = genre.toLowerCase().trim();
  return GENRE_DISPLAY[g] || genre;
}

// ── BPM estimation by genre ───────────────────────────────────
const GENRE_BPM: Record<string, { min: number; max: number }> = {
  pop: { min: 100, max: 130 }, dance: { min: 118, max: 135 },
  rock: { min: 110, max: 140 }, "hip-hop": { min: 80, max: 115 },
  rap: { min: 80, max: 115 }, electronic: { min: 120, max: 150 },
  edm: { min: 126, max: 150 }, house: { min: 120, max: 132 },
  techno: { min: 125, max: 145 }, jazz: { min: 80, max: 160 },
  classical: { min: 60, max: 120 }, ambient: { min: 60, max: 90 },
  "lo-fi": { min: 70, max: 90 }, "lo-fi hip hop": { min: 70, max: 90 },
  lofi: { min: 70, max: 90 }, indie: { min: 100, max: 130 },
  soul: { min: 70, max: 110 }, funk: { min: 100, max: 130 },
  blues: { min: 60, max: 100 }, "r&b": { min: 60, max: 110 },
  rnb: { min: 60, max: 110 }, folk: { min: 80, max: 120 },
  country: { min: 90, max: 130 }, metal: { min: 120, max: 180 },
  punk: { min: 140, max: 200 }, alternative: { min: 100, max: 140 },
  chill: { min: 70, max: 100 }, trance: { min: 130, max: 150 },
};

function estimateBPM(genre: string): string {
  const g = genre.toLowerCase().trim();
  const range = GENRE_BPM[g];
  if (!range) return "~120";
  return `~${Math.round((range.min + range.max) / 2)}`;
}

// ── Source label mapping ──────────────────────────────────────
function getSourceLabel(source: string): { label: string; color: string } {
  const s = source.toLowerCase().trim();
  if (s === "soundcloud" || s === "sc") return { label: "SoundCloud", color: "#ff5500" };
  if (s === "telegram" || s === "tg") return { label: "Telegram", color: "#26a5e4" };
  if (s === "local") return { label: "Локальный", color: "#4ade80" };
  return { label: source, color: "#94a3b8" };
}

// ── Format duration mm:ss ─────────────────────────────────────
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Animation variants ────────────────────────────────────────
const panelVariants = {
  hidden: { y: "100%" as const },
  visible: { y: 0, transition: { type: "spring" as const, damping: 30, stiffness: 260 } },
  exit: { y: "100%" as const, transition: { type: "spring" as const, damping: 30, stiffness: 260 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

// ── Main Component ────────────────────────────────────────────
export default function SongDNA({ track, isOpen, onClose }: SongDNAProps) {
  const { playTrack, isPlaying } = useAppStore();
  const [similarTracks, setSimilarTracks] = useState<Track[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [dnaAnimated, setDnaAnimated] = useState(false);

  // Reset animation when opened
  useEffect(() => {
    if (isOpen) {
      setDnaAnimated(false);
      const t = setTimeout(() => setDnaAnimated(true), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Fetch similar tracks
  useEffect(() => {
    if (!track || !isOpen) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarTracks([]);

    const params = new URLSearchParams({
      title: track.title || "",
      artist: track.artist || "",
      genre: track.genre || "",
      duration: String(track.duration || 0),
      excludeId: track.id,
      limit: "6",
    });

    fetch(`/api/music/similar?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const tracks: Track[] = (data.tracks || []).filter(
          (t: Track) => t.id !== track.id
        );
        setSimilarTracks(tracks.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setSimilarTracks([]);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });

    return () => { cancelled = true; };
  }, [track?.id, isOpen]);

  // ── Derived data ──────────────────────────────────────────
  const genreKey = (track?.genre || "").toLowerCase().trim();
  const relatedGenres = useMemo(() => {
    if (!genreKey) return [];
    const relatives = GENRE_RELATIVES[genreKey];
    return relatives || [genreKey];
  }, [genreKey]);

  const mood = useMemo(() => {
    if (!genreKey) return DEFAULT_MOOD;
    return GENRE_MOODS[genreKey] || DEFAULT_MOOD;
  }, [genreKey]);

  const bpm = useMemo(() => estimateBPM(track?.genre || ""), [track?.genre]);
  const sourceInfo = useMemo(() => getSourceLabel(track?.source || ""), [track?.source]);

  // Genealogy tree nodes
  const genealogyNodes = useMemo((): GenealogyNode[] => {
    if (!track) return [];
    const nodes: GenealogyNode[] = [
      {
        id: track.id,
        label: track.title.length > 20 ? track.title.slice(0, 18) + "..." : track.title,
        role: "center",
        x: 152,
        y: 160,
      },
    ];

    // "Influenced by" - top nodes
    const influenceCount = Math.min(3, similarTracks.length);
    for (let i = 0; i < influenceCount; i++) {
      const t = similarTracks[i];
      nodes.push({
        id: t.id,
        label: t.artist.length > 16 ? t.artist.slice(0, 14) + "..." : t.artist,
        role: "influence",
        track: t,
        x: 20 + i * 125,
        y: 15,
      });
    }

    // "Fans also like" - bottom nodes
    const fansStart = influenceCount;
    const fansCount = Math.min(3, similarTracks.length - fansStart);
    for (let i = 0; i < fansCount; i++) {
      const t = similarTracks[fansStart + i];
      nodes.push({
        id: t.id,
        label: t.title.length > 16 ? t.title.slice(0, 14) + "..." : t.title,
        role: "fans",
        track: t,
        x: 20 + i * 125,
        y: 325,
      });
    }

    return nodes;
  }, [track, similarTracks]);

  // SVG connection lines for genealogy
  const genealogyLines = useMemo(() => {
    const center = genealogyNodes.find((n) => n.role === "center");
    if (!center) return [];
    return genealogyNodes
      .filter((n) => n.role !== "center")
      .map((n) => ({
        x1: center.x + 52,
        y1: center.y + 22,
        x2: n.x + 52,
        y2: n.y + 22,
        role: n.role,
      }));
  }, [genealogyNodes]);

  if (!track) return null;

  const MoodIcon = mood.icon;

  const handleGenreClick = (genre: string) => {
    // Trigger a search for this genre in the app
    const searchEvent = new CustomEvent("mq-search", { detail: { query: genre } });
    window.dispatchEvent(searchEvent);
  };

  const handleTrackClick = (t: Track) => {
    playTrack(t, similarTracks);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="song-dna-panel"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
          style={{
            maxHeight: "70vh",
            backgroundColor: "var(--mq-card)",
            borderTop: "1px solid var(--mq-border)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-2">
            <h3
              className="text-sm font-bold flex items-center gap-1.5"
              style={{ color: "var(--mq-text)" }}
            >
              <Dna className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              ДНК трека
            </h3>
            <button onClick={onClose} style={{ color: "var(--mq-text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div
            className="overflow-y-auto px-4 pb-4 space-y-5"
            style={{ maxHeight: "64vh" }}
          >
            {/* ── Track DNA Card ─────────────────────────── */}
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="relative rounded-xl p-4 overflow-hidden"
              style={{
                background: dnaAnimated
                  ? `linear-gradient(135deg, var(--mq-input-bg) 0%, rgba(var(--mq-accent-rgb, 224,49,49), 0.08) 100%)`
                  : "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                transition: "background 0.8s ease",
              }}
            >
              {/* Animated accent bar */}
              <div
                className="absolute top-0 left-0 h-[2px]"
                style={{
                  width: dnaAnimated ? "100%" : "0%",
                  background: `linear-gradient(90deg, transparent, var(--mq-accent), transparent)`,
                  transition: "width 1.5s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />

              {/* Two-column layout: track info on left, DNA helix on right */}
              <div className="flex gap-3">
                {/* Left column — track info + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    {track.cover && (
                      <img
                        src={track.cover}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover"
                        style={{ border: "1px solid var(--mq-border)" }}
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--mq-text)" }}
                      >
                        {track.title}
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  {/* DNA stats grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {/* Genre */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        Жанр
                      </p>
                      <p
                        className="text-xs font-medium"
                        style={{ color: mood.color }}
                      >
                        {getGenreDisplay(track.genre)}
                      </p>
                      <div
                        className="mt-1 h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--mq-border)" }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: dnaAnimated ? "72%" : "0%",
                          }}
                          transition={{ delay: 0.2, duration: 1.0, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: mood.color, opacity: 0.7 }}
                        />
                      </div>
                    </div>

                    {/* Mood */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        Настроение
                      </p>
                      <div className="flex items-center gap-1">
                        <MoodIcon
                          className="w-3 h-3"
                          style={{ color: mood.color }}
                        />
                        <p
                          className="text-xs font-medium capitalize"
                          style={{ color: mood.color }}
                        >
                          {mood.label}
                        </p>
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        Длительность
                      </p>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                        <p className="text-xs font-medium" style={{ color: "var(--mq-text)" }}>
                          {formatTime(track.duration)}
                        </p>
                      </div>
                    </div>

                    {/* Source */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        Источник
                      </p>
                      <div className="flex items-center gap-1">
                        <Radio className="w-3 h-3" style={{ color: sourceInfo.color }} />
                        <p className="text-xs font-medium" style={{ color: sourceInfo.color }}>
                          {sourceInfo.label}
                        </p>
                      </div>
                    </div>

                    {/* BPM */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        BPM (оценка)
                      </p>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                        <p className="text-xs font-mono font-medium" style={{ color: "var(--mq-text)" }}>
                          {bpm}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column — DNA Helix Visual */}
                <div className="w-[120px] flex-shrink-0 rounded-lg overflow-hidden relative">
                  <DNAHelixVisual isPlaying={isPlaying} genre={track.genre} compact />
                </div>
              </div>
            </motion.div>

            {/* ── Related Genres ─────────────────────────── */}
            <motion.div
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <p
                className="text-xs font-semibold mb-2.5 flex items-center gap-1.5"
                style={{ color: "var(--mq-text)" }}
              >
                <GitBranch className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                Родственные жанры
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Primary genre (large) */}
                {track.genre && (
                  <button
                    onClick={() => handleGenreClick(track.genre)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105 cursor-pointer"
                    style={{
                      backgroundColor: `rgba(${hexToRgb(mood.color)}, 0.15)`,
                      color: mood.color,
                      border: `1px solid rgba(${hexToRgb(mood.color)}, 0.3)`,
                    }}
                  >
                    {getGenreDisplay(track.genre)}
                  </button>
                )}
                {/* Related genres (smaller) */}
                {relatedGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGenreClick(g)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                    style={{
                      backgroundColor: "var(--mq-input-bg)",
                      color: "var(--mq-text-muted)",
                      border: "1px solid var(--mq-border)",
                    }}
                  >
                    {getGenreDisplay(g)}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* ── Similar Tracks ─────────────────────────── */}
            <motion.div
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <p
                className="text-xs font-semibold mb-2.5 flex items-center gap-1.5"
                style={{ color: "var(--mq-text)" }}
              >
                <Music className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                Похожие треки
              </p>

              {similarLoading ? (
                <div className="flex gap-2 overflow-hidden">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-[140px] h-[48px] rounded-xl animate-pulse"
                      style={{ backgroundColor: "var(--mq-input-bg)" }}
                    />
                  ))}
                </div>
              ) : similarTracks.length > 0 ? (
                <div
                  className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                  }}
                >
                  {similarTracks.map((t, i) => (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTrackClick(t)}
                      className="flex-shrink-0 w-[140px] flex items-center gap-2 p-2 rounded-xl transition-all duration-200 cursor-pointer group"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        border: "1px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--mq-border)";
                        e.currentTarget.style.backgroundColor = "var(--mq-card)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "transparent";
                        e.currentTarget.style.backgroundColor = "var(--mq-input-bg)";
                      }}
                    >
                      <img
                        src={t.cover}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                        style={{ border: "1px solid var(--mq-border)" }}
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p
                          className="text-[11px] font-medium truncate leading-tight"
                          style={{ color: "var(--mq-text)" }}
                        >
                          {t.title}
                        </p>
                        <p
                          className="text-[9px] truncate leading-tight mt-0.5"
                          style={{ color: "var(--mq-text-muted)" }}
                        >
                          {t.artist}
                        </p>
                      </div>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        style={{
                          backgroundColor: "var(--mq-accent)",
                        }}
                      >
                        <Play className="w-2.5 h-2.5 ml-0.5" style={{ color: "#fff" }} />
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <p
                  className="text-xs text-center py-3"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Нет данных о похожих треках
                </p>
              )}
            </motion.div>

            {/* ── Music Genealogy Tree ───────────────────── */}
            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <p
                className="text-xs font-semibold mb-2.5 flex items-center gap-1.5"
                style={{ color: "var(--mq-text)" }}
              >
                <Dna className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                Генеалогическое древо
              </p>

              {similarTracks.length > 0 ? (
                <div
                  className="rounded-xl p-3 overflow-x-auto"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                  }}
                >
                  {/* Labels */}
                  <div className="flex justify-between mb-2 px-1">
                    <p
                      className="text-[9px] uppercase tracking-widest"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Влияние
                    </p>
                    <p
                      className="text-[9px] uppercase tracking-widest"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      Похожим нравится
                    </p>
                  </div>

                  <svg
                    width="100%"
                    viewBox="0 0 400 380"
                    className="w-full"
                    style={{ maxHeight: "360px" }}
                  >
                    {/* Connection lines */}
                    {genealogyLines.map((line, i) => (
                      <motion.line
                        key={i}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: 1,
                          opacity: line.role === "influence" ? 0.3 : 0.2,
                        }}
                        transition={{ delay: 0.6 + i * 0.1, duration: 0.5 }}
                        stroke={
                          line.role === "influence"
                            ? "var(--mq-accent)"
                            : "var(--mq-text-muted)"
                        }
                        strokeWidth={1}
                        strokeDasharray={
                          line.role === "influence" ? "none" : "4 3"
                        }
                      />
                    ))}

                    {/* Nodes */}
                    {genealogyNodes.map((node, i) => (
                      <motion.g
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + i * 0.08, duration: 0.3 }}
                        style={{
                          cursor: node.track ? "pointer" : "default",
                          transformOrigin: `${node.x + 52}px ${node.y + 22}px`,
                        }}
                        onClick={() => {
                          if (node.track) handleTrackClick(node.track);
                        }}
                      >
                        {/* Node background */}
                        <rect
                          x={node.x}
                          y={node.y}
                          width={104}
                          height={44}
                          rx={12}
                          ry={12}
                          fill={
                            node.role === "center"
                              ? "var(--mq-accent)"
                              : node.role === "influence"
                                ? "var(--mq-card)"
                                : "var(--mq-card)"
                          }
                          stroke={
                            node.role === "center"
                              ? "var(--mq-accent)"
                              : "var(--mq-border)"
                          }
                          strokeWidth={1}
                        />
                        {/* Node text */}
                        <text
                          x={node.x + 52}
                          y={node.y + 25}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={
                            node.role === "center"
                              ? "var(--mq-text)"
                              : "var(--mq-text-muted)"
                          }
                          fontSize={node.role === "center" ? 11 : 9}
                          fontWeight={node.role === "center" ? 600 : 400}
                        >
                          {node.label}
                        </text>
                      </motion.g>
                    ))}
                  </svg>
                </div>
              ) : (
                <div
                  className="rounded-xl p-6 text-center"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                  }}
                >
                  <Dna
                    className="w-8 h-8 mx-auto mb-2"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
                  />
                  <p
                    className="text-xs"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Древо будет доступно после загрузки похожих треков
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Helper: hex to "r,g,b" string for rgba ──────────────────
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return `${parseInt(h[0] + h[0], 16)},${parseInt(h[1] + h[1], 16)},${parseInt(h[2] + h[2], 16)}`;
  }
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}
