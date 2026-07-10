"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  Plus, Sparkles, Waves, User, Flame,
  SkipForward, ThumbsDown, TrendingUp, Compass, RotateCcw,
  MoreHorizontal, X, Shuffle,
} from "lucide-react";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { useFriendsListening } from "@/hooks/useFriendsListening";
import { useRecUpdates } from "@/hooks/useRecUpdates";
import { type Track } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import { useLongPress } from "@/hooks/useLongPress";

<<<<<<< HEAD
// ── AI Recommendations Bar (compact, auto-fetched, history-aware) ──
function AIRecommendationsBar({ playTrack, animationsEnabled, compactMode }: {
  playTrack: (track: Track, queue?: Track[]) => void;
  animationsEnabled: boolean;
  compactMode: boolean;
}) {
  const [aiTracks, setAiTracks] = useState<Track[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // P1-fix: subscribe to history length so the "AI анализирует..." text updates reactively
  const history = useAppStore((s) => s.history);

  useEffect(() => {
    let cancelled = false;
    const fetchAIRecs = async () => {
      // P2-#300: defer to avoid React error #300
      setTimeout(() => { if (!cancelled) setAiLoading(true); }, 0);
      try {
        const state = useAppStore.getState();

        // M3.4: use shared extractTasteProfile instead of 50+ lines of
        // copy-pasted genre/artist/language extraction logic.
        const tp = extractTasteProfile({
          history: state.history,
          likedTracksData: state.likedTracksData,
          tasteGenres: state.tasteGenres,
          tasteArtists: state.tasteArtists,
          tasteMoods: state.tasteMoods,
          dislikedTrackIds: state.dislikedTrackIds,
        });

        const disliked = state.dislikedTrackIds || [];
        const dislikedGenres = state.dislikedTracksData.map((t: Track) => t.genre).filter(Boolean).slice(0, 5);
        const completedGenres = state.feedbackBatch?.completedGenres || [];
        const recentTitles = tp.recentTitles.join("|");

        // ── Also works without taste profile — uses history only ──
        if (tp.allGenres.length === 0 && state.history.length < 3) {
          // P2-#300: defer to avoid React error #300
          setTimeout(() => { if (!cancelled) setAiLoading(false); }, 0);
          return;
        }

        const params = new URLSearchParams();
        if (tp.allGenres.length > 0) params.set("genres", tp.allGenres.join(","));
        if (tp.allArtists.length > 0) params.set("artists", tp.allArtists.join(","));
        if (tp.topMoods.length > 0) params.set("moods", tp.topMoods.join(","));
        if (recentTitles) params.set("recentTitles", recentTitles);
        if (dislikedGenres.length > 0) params.set("skippedGenres", dislikedGenres.join(","));
        if (completedGenres.length > 0) params.set("completedGenres", completedGenres.join(","));
        if (tp.language !== "mixed") params.set("lang", tp.language);
        params.set("limit", "50");

        const res = await fetch(`/api/ai/recommendations?${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();

        const dislikedSet = new Set(disliked);
        setAiTracks((data.tracks || []).filter((t: Track) => !dislikedSet.has(t.id)));
        setAiSummary(data._meta?.aiSummary || "");
      } catch {
        // Silently fail — AI recs are supplementary
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };
    fetchAIRecs();
    return () => { cancelled = true; };
  }, []);

  if (aiLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 rounded-xl" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
        <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)", opacity: 0.6 }} />
        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>AI подбирает рекомендации...</span>
        <div className="flex gap-1 ml-auto">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (aiTracks.length === 0 && !aiLoading) {
    return (
      <div className="rounded-2xl p-4 text-center"
        style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-xs)" }}>
        <Sparkles className="w-5 h-5 mx-auto mb-1.5" style={{ color: "var(--mq-accent)", opacity: 0.5 }} />
        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          {/* P1-fix: was useAppStore.getState() — didn't re-render on history change */}
          {history.length >= 3
            ? "AI анализирует вашу историю прослушиваний..."
            : "Слушайте больше музыки, чтобы AI подобрал рекомендации"}
        </p>
      </div>
    );
  }

  const aiScrollRef = useRef<HTMLDivElement>(null);
  const aiScrollRow = (dir: 'left' | 'right') => {
    if (!aiScrollRef.current) return;
    aiScrollRef.current.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' });
  };

  return (
    <div>
      {aiSummary && (
        <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
          {aiSummary}
        </p>
      )}
      <div className="relative group/airow">
        <div ref={aiScrollRef} className="mq-scroll-row"
          style={{ scrollSnapType: "x proximity", gap: "var(--mq-space-3)" }}>
        {aiTracks.map((track) => (
            <button
              key={track.id}
              onClick={() => playTrack(track, aiTracks)}
              className="mq-card-cinematic flex-shrink-0 w-[148px] text-left cursor-pointer group relative mq-rec-card"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <div className="aspect-square relative overflow-hidden mq-cover-shadow">
                {track.cover ? (
                  <img src={track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}>
                    <Music className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-200 group-hover:scale-100 scale-75"
                    style={{ background: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                  </div>
                </div>
                {/* AI badge */}
                <div className="absolute top-1 right-1">
                  <span className="text-[11px] px-1.5 py-[2px] rounded-full font-semibold tracking-wide uppercase"
                    style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)", letterSpacing: "0.05em" }}>
                    AI
                  </span>
                </div>
              </div>
              <div className="p-2.5 min-h-[52px]">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                  {track.title}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {track.artist}
                </p>
              </div>
            </button>
          ))}
        </div>
        {/* PC scroll buttons — hidden on mobile */}
        <button
          onClick={() => aiScrollRow('left')}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/airow:opacity-100 transition-opacity z-10"
          style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => aiScrollRow('right')}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/airow:opacity-100 transition-opacity z-10"
          style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {/* Scroll fade gradient on right edge */}
        <div className="absolute top-0 right-0 bottom-2 w-12 pointer-events-none z-10"
          style={{ background: "linear-gradient(to right, transparent, var(--mq-bg))" }} />
      </div>
    </div>
  );
}
=======
// ─── Types ────────────────────────────────────────────────────────────────
>>>>>>> 3877cbc6b90e1622a38f0be8a64b094f6e9734c6

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

<<<<<<< HEAD
// ── Horizontal recommendation row ──
const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  Mic2: <Mic2 className="w-4 h-4" />,
  Waves: <Waves className="w-4 h-4" />,
  Compass: <Compass className="w-4 h-4" />,
  Music: <Music className="w-4 h-4" />,
};

function RecCategoryRow({ category, index, playTrack, animationsEnabled, compactMode, onOpenAll }: {
  category: { id: string; title: string; icon: string; tracks: Track[] };
  index: number;
  playTrack: (track: Track, queue?: Track[]) => void;
  animationsEnabled: boolean;
  compactMode: boolean;
  onOpenAll: (category: { id: string; title: string; icon: string; tracks: Track[] }) => void;
}) {
  const Icon = ICON_MAP[category.icon] || <Sparkles className="w-4 h-4" />;
  const tracks = category.tracks;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRow = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 400;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="mb-8"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 18%, transparent)" }}>
          <span style={{ color: "var(--mq-accent)" }}>{Icon}</span>
        </div>
        <button onClick={() => onOpenAll(category)} className="cursor-pointer hover:opacity-80 transition-opacity min-w-0">
          <h2 className="truncate" style={{ color: "var(--mq-text)", fontSize: "var(--mq-text-xl)", fontWeight: "var(--mq-font-bold)", letterSpacing: "var(--mq-tracking-tight)" }}>
            {category.title}
          </h2>
        </button>
        <button onClick={() => onOpenAll(category)}
          className="text-xs px-3 py-1 rounded-full cursor-pointer transition-opacity hover:opacity-80"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
          Все
        </button>
        <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>
          {tracks.length} треков
        </span>
      </div>
      <div className="relative group/row">
        <div ref={scrollRef} className="mq-scroll-row"
          style={{ scrollSnapType: "x proximity", gap: "var(--mq-space-3)" }}>
          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => playTrack(track, tracks)}
              className="mq-card-cinematic flex-shrink-0 w-[148px] text-left cursor-pointer group relative mq-rec-card"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Cover */}
              <div className="aspect-square relative overflow-hidden mq-cover-shadow">
                {track.cover ? (
                  <img src={track.cover} alt="" className="w-full h-full object-cover mq-rec-card-img" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}>
                    <Music className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
                  </div>
                )}
                {/* Play overlay — CSS only */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-200 group-hover:scale-100 scale-75"
                    style={{ background: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
              {/* Info */}
              <div className="p-2.5 min-h-[52px]">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                  {track.title}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {track.artist}
                </p>
              </div>
            </button>
          ))}
        </div>
        {/* PC scroll buttons */}
        <button onClick={() => scrollRow('left')}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity z-10"
          style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => scrollRow('right')}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity z-10"
          style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}>
          <ChevronRight className="w-4 h-4" />
        </button>
        {/* Fade gradient */}
        <div className="absolute top-0 right-0 bottom-2 w-12 pointer-events-none z-10"
          style={{ background: "linear-gradient(to right, transparent, var(--mq-bg))" }} />
      </div>
    </motion.div>
  );
}

// ── 3D Tilt Card (mouse-following perspective + glare effect) ──
function TiltCard({ children, className, style, onClick }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(y, [0, 1], [8, -8]), { stiffness: 250, damping: 25 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-8, 8]), { stiffness: 250, damping: 25 });

  // Glare position based on mouse
  const glareX = useSpring(useTransform(x, [0, 1], [0, 100]), { stiffness: 300, damping: 30 });
  const glareY = useSpring(useTransform(y, [0, 1], [0, 100]), { stiffness: 300, damping: 30 });
  const glareOpacity = useSpring(0, { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
    glareOpacity.set(0.15);
  }, [x, y, glareOpacity]);

  const handleLeave = useCallback(() => {
    x.set(0.5);
    y.set(0.5);
    glareOpacity.set(0);
  }, [x, y, glareOpacity]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        ...style,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 600,
      }}
      className={className}
    >
      {children}
      {/* Glare overlay */}
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.25), transparent 60%)`,
          opacity: glareOpacity,
        }}
      />
    </motion.div>
  );
}

// ── Magnetic Button — icon/content slightly pulls toward cursor ──
function MagneticButton({ children, className, style, onClick, strength = 0.3 }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  strength?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const contentX = useSpring(0, { stiffness: 400, damping: 25 });
  const contentY = useSpring(0, { stiffness: 400, damping: 25 });

  const handleMouse = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * strength;
    const dy = (e.clientY - cy) * strength;
    contentX.set(dx);
    contentY.set(dy);
  }, [strength, contentX, contentY]);

  const handleLeave = useCallback(() => {
    contentX.set(0);
    contentY.set(0);
  }, [contentX, contentY]);

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      onClick={onClick}
      className={className}
      style={style}
    >
      <motion.span style={{ x: contentX, y: contentY, display: "inline-flex" }}>
        {children}
      </motion.span>
    </motion.button>
  );
}

// ── Mood/Genre Quick Tag ──
function MoodTag({ label, icon, onClick, active, gradient }: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  gradient?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-[opacity,transform] duration-200`}
      style={{
        background: active
          ? "var(--mq-accent)"
          : "color-mix(in srgb, var(--mq-accent) 8%, transparent)",
        color: active ? "var(--mq-text)" : "var(--mq-accent)",
        border: active
          ? "1px solid var(--mq-accent)"
          : "1px solid color-mix(in srgb, var(--mq-accent) 15%, transparent)",
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

// ── Animated Listening Stats Bar ──
function ListeningActivityBar({ history }: { history: any[] }) {
  const [bars, setBars] = useState<{ day: string; count: number; height: number; isToday: boolean }[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!history || history.length === 0) { setBars([]); return; }
    const now = Date.now();
    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayCounts: number[] = new Array(7).fill(0);

    for (const entry of history) {
      const age = now - entry.playedAt;
      if (age < 7 * 24 * 60 * 60 * 1000) {
        const dayIdx = new Date(entry.playedAt).getDay();
        const mappedIdx = dayIdx === 0 ? 6 : dayIdx - 1; // Mon=0 .. Sun=6
        dayCounts[mappedIdx]++;
      }
    }

    const maxCount = Math.max(...dayCounts, 1);
    const todayIdx = (new Date().getDay() + 6) % 7;

    setBars(dayNames.map((day, i) => ({
      day,
      count: dayCounts[i],
      height: Math.max(8, (dayCounts[i] / maxCount) * 100),
      isToday: i === todayIdx,
    })));
  }, [history]);

  if (bars.length === 0) return null;

  const maxCount = Math.max(...bars.map(b => b.count), 1);

  return (
    <div className="flex items-end gap-3.5 h-24">
      {bars.map((bar, i) => {
        const isHovered = hoveredIdx === i;
        const hasActivity = bar.count > 0;
        return (
          <motion.button
            key={i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            className="flex flex-col items-center gap-1.5 flex-1 cursor-default relative group"
          >
            {/* Tooltip on hover */}
            {isHovered && hasActivity && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-8 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap z-10"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text)",
                  boxShadow: "var(--mq-shadow-card)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {bar.count} {bar.count === 1 ? "трек" : bar.count < 5 ? "трека" : "треков"}
              </motion.div>
            )}
            {/* Bar */}
            <div className="w-full flex items-end justify-center relative" style={{ height: 64 }}>
              {/* Glow behind active bar */}
              {bar.isToday && (
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full"
                  style={{
                    background: "var(--mq-accent)",
                    filter: "blur(12px)",
                    opacity: 0.35,
                  }}
                  animate={{ opacity: [0.25, 0.45, 0.25], scale: [0.9, 1.1, 0.9] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {hasActivity && !bar.isToday && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full"
                  style={{
                    background: "var(--mq-accent)",
                    filter: "blur(10px)",
                    opacity: isHovered ? 0.25 : 0.12,
                    transition: "opacity 0.2s",
                  }}
                />
              )}
              <motion.div
                initial={{ scaleY: 0.07 }}
                animate={{ scaleY: bar.height / 100 }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-[32px] rounded-full relative overflow-hidden"
                style={{
                  height: "100%",
                  transformOrigin: "bottom",
                  willChange: "transform",
                  backgroundColor: bar.isToday
                    ? "var(--mq-accent)"
                    : hasActivity
                      ? "var(--mq-accent)"
                      : "var(--mq-border)",
                  opacity: bar.isToday ? 1 : hasActivity ? 0.45 : 0.25,
                  transition: "opacity 0.2s, filter 0.2s",
                  filter: isHovered && hasActivity ? "brightness(1.3)" : "none",
                  animation: bar.isToday ? "mq-breathe-glow 3s ease-in-out infinite" : "none",
                }}
              >
                {/* Shine overlay on today's bar */}
                {bar.isToday && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%)",
                    }}
                  />
                )}
              </motion.div>
            </div>
            {/* Day label */}
            <span
              className="text-[11px] font-medium transition-colors duration-200"
              style={{
                color: bar.isToday
                  ? "var(--mq-accent)"
                  : isHovered
                    ? "var(--mq-text)"
                    : "var(--mq-text-muted)",
              }}
            >
              {bar.day}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 22) return "Добрый вечер";
  return "Доброй ночи";
}

function getGreetingSubtext(): string {
  return "Что послушаем сегодня?";
}
=======
interface RecCategory {
  id: string;
  title: string;
  icon: string;
  tracks: Track[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────
>>>>>>> 3877cbc6b90e1622a38f0be8a64b094f6e9734c6

function getWaveGradient(): string {
  return "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 35%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg)))";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function currentDate(): string {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN VIEW
// ═════════════════════════════════════════════════════════════════════════

function MainView() {
  // ── Store ──
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const history = useAppStore((s) => s.history);
  const playlists = useAppStore((s) => s.playlists);
  const setView = useAppStore((s) => s.setView);
  const userId = useAppStore((s) => s.userId);
  const compactMode = useAppStore((s) => s.compactMode);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const selectedArtist = useAppStore((s) => s.selectedArtist);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const radioMode = useAppStore((s) => s.radioMode);
  const duration = useAppStore((s) => s.duration);
  const progress = useAppStore((s) => s.progress);
  const contacts = useAppStore((s) => s.contacts);

  // ── Local state ──
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [recCategories, setRecCategories] = useState<RecCategory[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  // Bumped by the Empty-State "Retry" button to force a recommendations refetch
  const [retryTick, setRetryTick] = useState<number>(0);
  // Specific error type for better empty-state messaging ("offline" / "api" / "empty" / null)
  const [recError, setRecError] = useState<"offline" | "api" | "empty" | null>(null);

  // ── Wave engine (logic separated from UI) ──
  const wave = useWaveEngine();

  const isMobile = useIsMobile();

  // ── Taste profile ──
  const tasteProfile = useMemo(() => {
    return extractTasteProfile({
      history: Array.isArray(history) ? history : [],
      likedTracksData: Array.isArray(likedTracksData) ? likedTracksData : [],
      dislikedTrackIds: Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [],
    });
  }, [history, likedTracksData, dislikedTrackIds]);

  // ── Recent tracks ──
  const recentTracks = useMemo(() => {
    return history.slice(0, 10).map((h: any) => h.track).filter(Boolean);
  }, [history]);

  // ── Fetch curated playlists ──
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const curatedParams = new URLSearchParams();
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        if (disliked.length > 0) curatedParams.set("dislikedIds", disliked.join(","));

        const curatedRes = await fetch(`/api/playlists/curated?${curatedParams}`);

        if (!cancelled && curatedRes.ok) {
          const data = await curatedRes.json();
          setCuratedPlaylists(data.playlists || []);
        }
      } catch {
        if (!cancelled) { setCuratedPlaylists([]); }
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch recommendations (non-blocking) ──
  useEffect(() => {
    let cancelled = false;
    const fetchRecs = async () => {
      setRecLoading(true);
      setRecError(null);
      try {
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        const params = new URLSearchParams();
        const likedScIds = useAppStore.getState().likedTracksData
          .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
        if (likedScIds) params.set("likedScIds", likedScIds);
        const historyScIds = useAppStore.getState().history.slice(0, 10)
          .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
        if (historyScIds) params.set("historyScIds", historyScIds);
        if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
        if (tasteProfile.topGenres.length > 0) params.set("genres", tasteProfile.topGenres.join(","));
        const favArtistNames = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
        const allArtists = [...new Set([...favArtistNames, ...tasteProfile.topArtists])];
        if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));

        // Fetch recommendations + trending + Apple Music Top + Spotify Top in parallel
        // Detect user country via timezone
        const userCountry = detectUserCountry();

        const [recRes, trendingRes, appleRes, spotifyRes] = await Promise.all([
          fetch(`/api/music/recommendations?${params}`),
          fetch(`/api/music/trending?limit=50`),
          fetch(`/api/music/apple-charts?country=${userCountry}`),
          fetch(`/api/music/spotify-charts?country=${userCountry}`),
        ]);

        const cats: RecCategory[] = [];

        // Add Spotify Top as first category ("Топ Spotify")
        if (spotifyRes.ok) {
          try {
            const spotifyData = await spotifyRes.json();
            const spotifyTracks = (spotifyData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
            if (spotifyTracks.length > 0) {
              cats.push({
                id: "spotify_top",
                title: "Топ Spotify",
                icon: "Flame",
                tracks: spotifyTracks,
              });
            }
          } catch {}
        }

        // Add Apple Music Top 100 as second category
        if (appleRes.ok) {
          try {
            const appleData = await appleRes.json();
            const appleTracks = (appleData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
            if (appleTracks.length > 0) {
              const cName = countryNameFromCode(appleData.country || userCountry);
              cats.push({
                id: "apple_top",
                title: `Топ ${cName}`,
                icon: "Flame",
                tracks: appleTracks,
              });
            }
          } catch {}
        }

        // Add trending as third category ("Популярное сейчас")
        if (trendingRes.ok) {
          const tData = await trendingRes.json();
          const trendingTracks = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
          if (trendingTracks.length > 0) {
            cats.push({
              id: "trending_now",
              title: "Популярное сейчас",
              icon: "Flame",
              tracks: trendingTracks,
            });
          }
        }

        // Add recommendation categories
        if (recRes.ok) {
          const data = await recRes.json();
          const recCats = (data.categories || []).map((cat: any) => ({
            id: cat.id || `cat_${Date.now()}_${Math.random()}`,
            title: cat.title || "Рекомендации",
            icon: cat.icon || "Sparkles",
            tracks: (cat.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50),
          })).filter((cat: any) => cat.tracks.length > 0);
          cats.push(...recCats);
        }

        // If no categories at all, create a fallback from trending
        if (cats.length === 0 && trendingRes.ok) {
          const tData = await trendingRes.json();
          const fallback = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
          if (fallback.length > 0) {
            cats.push({ id: "fallback", title: "Для вас", icon: "Sparkles", tracks: fallback });
          }
        }

        if (!cancelled) {
          setRecCategories(cats);
          setRecError(cats.length === 0 ? "empty" : null);
        }
      } catch (err) {
        if (!cancelled) {
          // Distinguish offline vs API error for better messaging
          const isOffline = err instanceof TypeError && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));
          setRecError(isOffline ? "offline" : "api");
          setRecCategories([]);
        }
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    };
    const timer = setTimeout(fetchRecs, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tasteProfile, retryTick]);

  const handleRetryRecs = useCallback(() => setRetryTick((n) => n + 1), []);

  // ── Friends listening now (polling every 15s) ──
  const { friends: listeningFriends } = useFriendsListening();

  // ── Real-time rec updates (polling hash every 30s, triggers refetch on change) ──
  useRecUpdates(handleRetryRecs);

  // ── Aggregated recommendations (deduped across categories) ──
  // Used as the play context when user taps a rec card, so playback
  // continues across categories instead of being limited to one strip.
  const allRecTracks = useMemo(() => {
    const seen = new Set<string>();
    const result: Track[] = [];
    for (const cat of recCategories) {
      for (const t of cat.tracks) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        result.push(t);
      }
    }
    return result;
  }, [recCategories]);

  // ── Play rec track in context of all visible tracks ──
  // If the clicked track is already current, toggle play/pause instead
  // of restarting it from 0:00. This matches Spotify-like UX where tapping
  // a playing track's card pauses it.
  const handlePlayRec = useCallback((track: Track) => {
    const cur = useAppStore.getState().currentTrack;
    if (cur?.id === track.id) {
      togglePlay();
      return;
    }
    if (allRecTracks.length === 0) return;
    playTrack(track, allRecTracks);
  }, [allRecTracks, playTrack, togglePlay]);

  // ── Wave controls (from useWaveEngine hook) ──
  // Visual WaveCard component handles all rendering; this hook provides logic.

  // ── Artist navigation ──
  const handleNavigateToArtist = useCallback((artist: string) => {
    if (!artist) return;
    setSelectedArtist({ name: artist });
  }, [setSelectedArtist]);

  // ── Artist detail ──
  if (selectedArtist) {
    return (
      <ArtistDetailView
        artist={selectedArtist}
        onBack={() => setSelectedArtist(null)}
        compactMode={compactMode}
        animationsEnabled={animationsEnabled}
      />
    );
  }

  // ── Pull-to-refresh (mobile only) ──
  // Touch-based: user pulls down at scrollTop=0 → triggers handleRetryRecs.
  // Desktop scrolling doesn't engage (uses touch events only).
  const pullStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const PULL_THRESHOLD = 70; // px — must pull this far to trigger

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.scrollY <= 0) {
      pullStartY.current = e.touches[0].clientY;
    } else {
      pullStartY.current = null;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      // Dampen: 0.5x resistance after threshold
      setPullDistance(Math.min(delta * 0.5, 100));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      handleRetryRecs();
    }
    setPullDistance(0);
    pullStartY.current = null;
  }, [pullDistance, handleRetryRecs]);

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4" : "p-3.5 sm:p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator (mobile only) */}
      {pullDistance > 0 && (
        <div
<<<<<<< HEAD
          ref={orb1Ref}
          className={`absolute rounded-full pointer-events-none ${isMobile ? "w-[200px] h-[200px]" : "w-[300px] h-[300px]"}`}
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, var(--mq-accent) ${isMobile ? 14 : 20}%, transparent) 0%, transparent 70%)`,
            top: isMobile ? "-15%" : "-20%",
            left: "5%",
            willChange: "transform",
          }}
        />

        {/* Floating gradient orb 2 */}
        <div
          ref={orb2Ref}
          className={`absolute rounded-full pointer-events-none ${isMobile ? "w-[150px] h-[150px]" : "w-[220px] h-[220px]"}`}
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, var(--mq-accent) ${isMobile ? 8 : 12}%, transparent) 0%, transparent 70%)`,
            bottom: isMobile ? "-5%" : "-10%",
            right: isMobile ? "8%" : "10%",
            willChange: "transform",
          }}
        />

        <ScrollProgressBar />

        {/* Hero content */}
        <div className={`relative z-10 px-5 sm:px-8 ${isMobile ? "py-6 sm:py-8 lg:py-10" : "py-10 sm:py-14 lg:py-16"}`}>
          {isMobile ? (
            /* ── Mobile Premium Layout ── */
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 style={{ color: "var(--mq-text)", fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                    {getGreeting()}
                  </h1>
                  <p className="mt-1.5" style={{ color: "color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-text))", fontSize: "0.9375rem", fontWeight: 400, letterSpacing: "-0.01em" }}>
                    {getGreetingSubtext()}
                  </p>
                </div>
                <motion.button whileTap={{ scale: 0.92 }} onClick={() => setView("settings")}
                  className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden mt-0.5 cursor-pointer"
                  style={{ border: "2px solid color-mix(in srgb, var(--mq-accent) 30%, transparent)", boxShadow: "var(--mq-shadow-card)" }}>
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 25%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 10%, var(--mq-bg)))" }}>
                    <User className="w-4.5 h-4.5" style={{ color: "var(--mq-text-muted)" }} />
                  </div>
                </motion.button>
              </div>

              {currentTrack && isPlaying && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl max-w-sm"
                  style={{ background: "color-mix(in srgb, var(--mq-card) 50%, transparent)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid color-mix(in srgb, var(--mq-accent) 12%, rgba(255,255,255,0.08))", boxShadow: "var(--mq-shadow-card-hover)" }}>
                  <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ boxShadow: "var(--mq-shadow-card)" }}>
                    {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}><Music2 className="w-4 h-4" style={{ color: "var(--mq-text)" }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex items-end gap-[2px] h-2">
                        {[0, 1, 2].map((i) => (<motion.div key={i} className="w-[1.5px] rounded-full" style={{ height: "100%", transformOrigin: "bottom", backgroundColor: "var(--mq-accent)" }} animate={{ scaleY: [0.4, 1, 0.6] }} transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }} />))}
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-accent)" }}>Сейчас играет</span>
                    </div>
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                  </div>
                </motion.div>
              )}

              {tasteProfile.topGenres.length > 0 && (
                <div className="flex gap-2 mt-4 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {tasteProfile.topGenres.slice(0, 3).map((genre) => (
                    <motion.button key={genre} whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.96 }}
                      onClick={() => setSearchQuery(genre)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap cursor-pointer transition-[opacity,transform] duration-200"
                      style={{
                        background: "color-mix(in srgb, var(--mq-accent) 8%, transparent)",
                        color: "var(--mq-accent)",
                        border: "1px solid color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                      }}>
                      <Music2 className="w-3 h-3" style={{ opacity: 0.7 }} />{displayGenre(genre)}
                    </motion.button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ── Desktop Classic Layout ── */
            <>
              <h1 style={{ color: "var(--mq-text)", fontSize: "var(--mq-text-hero)", fontWeight: "var(--mq-font-bold)", letterSpacing: "var(--mq-tracking-tight)", lineHeight: "var(--mq-leading-tight)" }}>
                {getGreeting()}
              </h1>
              <p className="mt-2 font-medium" style={{ color: "color-mix(in srgb, var(--mq-text-muted) 80%, var(--mq-text))", fontSize: "var(--mq-text-lg)" }}>
                {getGreetingSubtext()}
              </p>

              {currentTrack && isPlaying && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex items-center gap-3 px-4 py-3 rounded-2xl max-w-sm"
                  style={{ background: "var(--mq-glass-bg)", backdropFilter: "var(--mq-glass-blur)", WebkitBackdropFilter: "var(--mq-glass-blur)", border: "1px solid var(--mq-glass-border)", boxShadow: "0 0 24px color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
                  <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 mq-cover-shadow">
                    {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}><Music2 className="w-5 h-5" style={{ color: "var(--mq-text)" }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex items-end gap-[2px] h-2.5">
                        {[0, 1, 2].map((i) => (<motion.div key={i} className="w-[2px] rounded-full" style={{ height: "100%", transformOrigin: "bottom", backgroundColor: "var(--mq-accent)" }} animate={{ scaleY: [0.4, 1, 0.6] }} transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 }} />))}
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-accent)" }}>Сейчас играет</span>
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                  </div>
                </motion.div>
              )}

              {tasteProfile.topGenres.length > 0 && (
                <div className="flex gap-2 mt-5 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {tasteProfile.topGenres.slice(0, 3).map((genre) => (
                    <MoodTag key={genre} label={displayGenre(genre)} icon={<Music2 className="w-3 h-3" />} onClick={() => setSearchQuery(genre)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Волна (Wave) — Premium Glass (mobile) / Classic (desktop) ── */}
      <ScrollReveal direction="up" delay={0.03}>
        <div
          className={isMobile ? "relative mb-8 rounded-[28px] overflow-hidden" : "mq-hero-card relative mb-8"}
          style={{
            background: isMobile
              ? (currentTrack?.cover
                ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
                : getWaveGradient())
              : getWaveGradient(),
            minHeight: isMobile ? 140 : 160,
            boxShadow: "var(--mq-shadow-float)",
          }}
=======
          className="flex items-center justify-center overflow-hidden transition-all lg:hidden"
          style={{ height: pullDistance, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
>>>>>>> 3877cbc6b90e1622a38f0be8a64b094f6e9734c6
        >
          <div
            className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={{
              borderColor: "var(--mq-border-thin)",
              borderTopColor: "var(--mq-accent)",
              transform: `rotate(${pullDistance * 3}deg)`,
            }}
          >
            {pullDistance >= PULL_THRESHOLD ? (
              <RotateCcw className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
            ) : null}
          </div>
        </div>
<<<<<<< HEAD
      </ScrollReveal>

      {/* Liked tracks panel — smooth 60fps height animation */}
      <AnimatePresence>
        {showLikedTracks && (
          <motion.div
            key="liked-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 800 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="fixed inset-0 z-50 overflow-y-auto">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowLikedTracks(false)}
                style={{ backdropFilter: "blur(4px)" }}
              />
              {/* Panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ willChange: "transform", transform: "translateZ(0)" }}
                className="absolute right-0 top-0 bottom-0 w-full max-w-md overflow-y-auto"
              >
                <div className="p-4 h-full" style={{ backgroundColor: "var(--mq-bg)" }}>
                  <div className="rounded-2xl p-4 relative overflow-hidden" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Heart className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} fill="#ef4444" />
                        <h2 className="text-base font-bold truncate" style={{ color: "var(--mq-text)" }}>
                          Избранные треки
                        </h2>
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                          {likedTrackIds.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {likedTracksData.length > 0 && (
                          <motion.button whileTap={{ scale: 0.95 }} onClick={() => playTrack(likedTracksData[0], likedTracksData)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                            <Play className="w-3 h-3" style={{ marginLeft: 1 }} />
                            Все
                          </motion.button>
                        )}
                        <button onClick={() => setShowLikedTracks(false)}
                          className="p-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)" }}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {likedTracksData.length > 0 ? (
                      <div className="space-y-1">
                        {likedTracksData.slice(0, 20).map((track, i) => (
                          <motion.div
                            key={track.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 30 }}
                            style={{ willChange: "transform" }}
                          >
                            <TrackCard track={track} index={i} queue={likedTracksData} onArtistClick={handleNavigateToArtist} />
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Heart className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                          Вы ещё не добавили треки в избранное
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Плейлисты (Playlists) — Premium (mobile) / Classic (desktop) ── */}
      {curatedPlaylists.length > 0 && (
        <ScrollReveal direction="up" delay={0.05}>
          <div className="mb-8">
            <SectionHeader title="Плейлисты" icon={ListMusic} />
            <div className="relative group/playlistrow">
              <div ref={curatedScrollRef} className="mq-scroll-row" style={{ scrollSnapType: "x proximity", gap: isMobile ? "12px" : "var(--mq-space-3)" }}>
                {curatedPlaylists.map((pl, i) => (
                  <motion.button
                    key={pl.id}
                    initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedCurated(pl)}
                    className="flex-shrink-0 w-[160px] sm:w-[180px] cursor-pointer group relative"
                    style={{
                      backgroundColor: "var(--mq-card)",
                      borderRadius: 16,
                      border: "1px solid var(--mq-border)",
                      boxShadow: "var(--mq-shadow-card)",
                      overflow: "hidden",
                    }}
                  >
                    {/* ── Cover art — square, top ── */}
                    <div className="relative aspect-square overflow-hidden">
                      <PlaylistArtwork
                        playlistId={pl.id}
                        size={200}
                        rounded="rounded-none"
                        className="!w-full !h-full group-hover:scale-105 transition-transform duration-500"
                      />
                      {/* Play button overlay on hover */}
                      <div
                        className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-300 group-hover:scale-110 sm:translate-y-1 group-hover:translate-y-0"
                        style={{
                          backgroundColor: "var(--mq-accent)",
                          color: "var(--mq-text)",
                          boxShadow: "var(--mq-shadow-accent)",
                        }}
                        aria-hidden
                      >
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    {/* ── Text info — solid bg, below cover ── */}
                    <div className="p-3 text-left">
                      <p
                        className="text-sm font-bold truncate leading-tight"
                        style={{ color: "var(--mq-text)", letterSpacing: "-0.01em" }}
                        title={pl.name}
                      >
                        {pl.name}
                      </p>
                      <p
                        className="text-[11px] mt-1 leading-snug line-clamp-2"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        {pl.subtitle}
                      </p>
                      <p
                        className="text-[10px] mt-2 font-medium uppercase tracking-wider"
                        style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
                      >
                        {pl.tracks.length} треков
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
              {/* PC scroll buttons for playlists — hidden on mobile */}
              <button
                onClick={() => {
                  if (curatedScrollRef.current) curatedScrollRef.current.scrollBy({ left: -400, behavior: 'smooth' });
                }}
                className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/playlistrow:opacity-100 transition-opacity z-10"
                style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (curatedScrollRef.current) curatedScrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
                }}
                className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/playlistrow:opacity-100 transition-opacity z-10"
                style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute top-0 right-0 bottom-2 w-12 pointer-events-none z-10"
                style={{ background: "linear-gradient(to right, transparent, var(--mq-bg))" }} />
            </div>
          </div>
        </ScrollReveal>
=======
>>>>>>> 3877cbc6b90e1622a38f0be8a64b094f6e9734c6
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* HERO GREETING */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <p className="mq-text-eyebrow mb-1.5 text-[10px] sm:text-[11px]">{currentDate()}</p>
          <h1 className="mq-text-display text-xl sm:text-2xl lg:text-3xl" style={{ color: "var(--mq-text)" }}>
            {greeting()}
          </h1>
          {/* UX Core #5 (Эффект контекста): когда трек играет, показываем
              его в hero — единый контекст "что происходит прямо сейчас".
              Без этого hero greeting и Wave Card создают разрыв контекста. */}
          {currentTrack && isPlaying && (
            <p className="text-xs sm:text-sm mt-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
              <span style={{ color: "var(--mq-accent)" }}>●</span> Сейчас играет: {currentTrack.title} — {currentTrack.artist}
            </p>
          )}
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ВОЛНА (Wave) — preserved as-is */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.03}>
        <WaveCard
          isMobile={isMobile}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          radioMode={wave.radioMode}
          progress={progress}
          duration={duration}
          waveLoading={wave.waveLoading}
          waveError={wave.waveError}
          onStartWave={wave.startWave}
          onPauseWave={wave.pauseWave}
          onStopWave={wave.stopWave}
          onSkip={wave.skipTrack}
          onDislike={wave.dislikeTrack}
          onLike={wave.likeTrack}
          isLiked={!!currentTrack && likedTrackIds.includes(currentTrack.id)}
          topGenres={tasteProfile.topGenres}
        />
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* QUICK STATS — 2x2 on mobile, 4 on desktop */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-8">
          <QuickStat
            icon={Heart}
            label="Избранное"
            value={likedTrackIds.length}
            onClick={() => setView("favorites")}
            accent="#ef4444"
            cover={likedTracksData[0]?.cover}
          />
          <QuickStat
            icon={Clock}
            label="История"
            value={history.length}
            onClick={() => setView("history")}
            accent="var(--mq-accent)"
            cover={history[0]?.track?.cover}
          />
          <QuickStat
            icon={ListMusic}
            label="Плейлисты"
            value={playlists.length}
            onClick={() => setView("playlists")}
            accent="#8b5cf6"
            cover={playlists[0]?.tracks?.[0]?.cover}
          />
          <QuickStat
            icon={MessageCircle}
            label="Чаты"
            value={contacts.length}
            onClick={() => setView("messenger")}
            accent="#06b6d4"
          />
        </div>
      </ScrollReveal>

<<<<<<< HEAD
      {/* ── Недавно (Recent) ── */}
      {recentTracks.length > 0 && (
        <ScrollReveal direction="up" delay={0.2}>
          <div className="mb-8">
            <SectionHeader
              title="Недавно"
              icon={Clock}
              action={
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setView("history")}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}>
                  Все
                </motion.button>
              }
            />
            <div className="relative">
              <div className="mq-scroll-row" style={{ scrollSnapType: "x proximity", gap: "var(--mq-space-3)" }}>
              {recentTracks.slice(0, 10).map((entry) => {
                const isCurrentTrack = currentTrack?.id === entry.track.id;
                return (
                  <button
                    key={entry.track.id + "_" + entry.playedAt}
                    onClick={() => playTrack(entry.track, recentTracks.map(e => e.track))}
                    className="mq-card-cinematic flex-shrink-0 w-[148px] text-left cursor-pointer group relative mq-rec-card"
                    style={isCurrentTrack ? { boxShadow: "0 0 16px color-mix(in srgb, var(--mq-accent) 25%, transparent)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
                  >
                    <div className="aspect-square relative overflow-hidden mq-cover-shadow">
                      {entry.track.cover ? (
                        <img src={entry.track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}>
                          <Music className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                        {isCurrentTrack && isPlaying ? (
                          <div className="flex items-end gap-[2px] h-4">
                            <motion.div animate={{ scaleY: [0.3, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }} className="w-[2px] rounded-full" style={{ height: "100%", transformOrigin: "bottom", willChange: "transform", backgroundColor: "#fff" }} />
                            <motion.div animate={{ scaleY: [0.6, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.1 }} className="w-[2px] rounded-full" style={{ height: "100%", transformOrigin: "bottom", willChange: "transform", backgroundColor: "#fff" }} />
                            <motion.div animate={{ scaleY: [1, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.2 }} className="w-[2px] rounded-full" style={{ height: "100%", transformOrigin: "bottom", willChange: "transform", backgroundColor: "#fff" }} />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-200 group-hover:scale-100 scale-75"
                            style={{ background: "var(--mq-accent)", color: "var(--mq-text)" }}>
                            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 min-h-[52px]">
                      <p className="text-xs font-semibold truncate leading-tight" style={{ color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text)" }}>
                        {entry.track.title}
                      </p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                        {entry.track.artist}
                      </p>
                    </div>
                  </button>
                );
              })}
              </div>
              {/* Scroll fade gradient on right edge */}
              <div className="absolute top-0 right-0 bottom-2 w-12 pointer-events-none z-10"
                style={{ background: "linear-gradient(to right, transparent, var(--mq-bg))" }} />
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── Recommendation Categories (from smart recs) ── */}
      {!isRecLoading && recCategories.length > 0 && (
        <ScrollReveal direction="up" delay={0.25}>
          <div className="mb-8">
            {recCategories.slice(0, 10).map((cat, catIdx) => (
              <RecCategoryRow key={cat.id} category={cat} index={catIdx} playTrack={playTrack} animationsEnabled={animationsEnabled} compactMode={compactMode} onOpenAll={setSelectedRecCategory} />
=======
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PLAYLISTS — user's playlists grid */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Section
        title="Плейлисты"
        icon={ListMusic}
        action={
          playlists.length > 0 ? (
            <button onClick={() => setView("playlists")} className="text-xs font-semibold" style={{ color: "var(--mq-accent)" }}>
              Все
            </button>
          ) : undefined
        }
      >
        {playlists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {playlists.slice(0, 8).map((pl, i) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                index={i}
                isCurrent={!!currentTrack && pl.tracks.some(t => t.id === currentTrack.id) && isPlaying}
                onClick={() => {
                  setTimeout(() => useAppStore.getState().setSelectedPlaylistId(pl.id), 0);
                  setView("playlists");
                }}
                onPlay={(e) => {
                  e.stopPropagation();
                  if (pl.tracks.length === 0) return;
                  if (currentTrack?.id === pl.tracks[0].id) { togglePlay(); return; }
                  playTrack(pl.tracks[0], [...pl.tracks], pl.id);
                }}
                animationsEnabled={animationsEnabled}
              />
>>>>>>> 3877cbc6b90e1622a38f0be8a64b094f6e9734c6
            ))}
          </div>
        ) : (
          <button
            onClick={() => setView("playlists")}
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.02] text-left"
            style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
              <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="flex-1 min-w-0">
              {/* UX Core #1 (Эвристика доступности): текст без императива
                  и долга — "Новый плейлист" + "Собери своё" звучит как
                  возможность, а не обязанность. Снижает когнитивный барьер. */}
              <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Новый плейлист</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Собери своё</p>
            </div>
            {/* UX Core #6 (Забывание без подсказок): мини-обложки недавно
                сыгранных треков как визуальная подсказка "вот что можно
                добавить". Без стимула пользователь забывает что у него
                есть музыка для плейлиста. */}
            {recentTracks.length > 0 && (
              <div className="flex -space-x-2 flex-shrink-0">
                {recentTracks.slice(0, 3).map((t, i) => t?.cover ? (
                  <img
                    key={t.id + "_" + i}
                    src={t.cover}
                    alt=""
                    className="w-8 h-8 rounded-md object-cover"
                    style={{ border: "2px solid var(--mq-card)" }}
                    loading="lazy"
                  />
                ) : null)}
              </div>
            )}
          </button>
        )}
      </Section>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FRIENDS LISTENING NOW — social widget (polling-based) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {listeningFriends.length > 0 && (
        <Section title="Друзья слушают" icon={User}>
          <HScroll
            className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1"
          >
            {listeningFriends.map((f) => (
              <div
                key={f.userId}
                className="flex-shrink-0 w-[200px] rounded-2xl p-3 cursor-pointer hover:scale-[1.02] transition-transform"
                style={{
                  backgroundColor: "var(--mq-card)",
                  border: "1px solid var(--mq-border-hairline)",
                }}
                onClick={() => {
                  if (f.scTrackId) {
                    // Try to play the same track
                    const track: Track = {
                      id: `sc_${f.scTrackId}`,
                      title: f.trackTitle,
                      artist: f.trackArtist,
                      album: "",
                      cover: f.trackCover,
                      duration: f.duration,
                      genre: "",
                      audioUrl: "",
                      previewUrl: "",
                      source: "soundcloud",
                      scTrackId: f.scTrackId,
                    };
                    playTrack(track, [track]);
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
                    {f.avatar ? (
                      <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                      {f.username}
                    </p>
                    <div className="flex items-center gap-1">
                      {f.isPlaying && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
                      )}
                      <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                        {f.isPlaying ? "сейчас" : "на паузе"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
                    {f.trackCover ? (
                      <img src={f.trackCover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>
                      {f.trackTitle}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                      {f.trackArtist}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </HScroll>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECOMMENDATIONS — clean card-strip layout (rewritten from scratch) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recCategories.length > 0 && (
        <Section title="Для вас" icon={Sparkles}>
          {/* Featured hero track — picks the playing track if it's in recs,
              otherwise the first track of the first category. */}
          {(() => {
            const heroTrack =
              (currentTrack && allRecTracks.some((t) => t.id === currentTrack.id)
                ? currentTrack
                : null) || recCategories[0]?.tracks[0] || null;
            if (!heroTrack) return null;
            const heroCategory = recCategories.find((c) =>
              c.tracks.some((t) => t.id === heroTrack.id)
            );
            const heroReason = heroCategory ? reasonForRec(heroCategory.id) : "Подобрано для вас";
            return (
              <RecHero
                track={heroTrack}
                reason={heroReason}
                isCurrent={currentTrack?.id === heroTrack.id}
                isPlaying={isPlaying && currentTrack?.id === heroTrack.id}
                onPlay={() => handlePlayRec(heroTrack)}
                onArtistClick={() => handleNavigateToArtist(heroTrack.artist)}
                animationsEnabled={animationsEnabled}
              />
            );
          })()}

          {/* Each category = a horizontal scroll strip of track cards */}
          <div className="space-y-6 mt-5">
            {recCategories.map((cat) => (
              <RecStrip
                key={cat.id}
                title={cat.title}
                icon={iconForRec(cat.id)}
                tracks={cat.tracks}
                reason={reasonForRec(cat.id)}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlay={handlePlayRec}
                onArtistClick={handleNavigateToArtist}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Recommendations loading skeleton (initial load only) */}
      {recLoading && recCategories.length === 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <RecsSkeleton />
        </Section>
      )}

      {/* Recommendations empty state (initial load finished, no categories) */}
      {!recLoading && recCategories.length === 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <RecsEmptyState onRetry={handleRetryRecs} errorType={recError} />
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECENTLY PLAYED */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <Section
          title="Недавно"
          icon={Clock}
          action={
            <button onClick={() => setView("history")} className="text-xs font-semibold" style={{ color: "var(--mq-accent)" }}>
              Все
            </button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {recentTracks.slice(0, 5).map((track, i) => (
              <TrackCard
                key={track.id + "_" + i}
                track={track}
                index={i}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPlay={() => {
                  if (currentTrack?.id === track.id) { togglePlay(); return; }
                  playTrack(track, recentTracks);
                }}
                onArtistClick={() => handleNavigateToArtist(track.artist)}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FAVORITE ARTISTS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {favoriteArtists.length > 0 && (
        <Section title="Любимые артисты" icon={User}>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {favoriteArtists.slice(0, 6).map((artist, i) => (
              <ArtistCircleCard
                key={artist.id}
                artist={artist}
                index={i}
                onClick={() => setSelectedArtist({ name: artist.username, avatar: artist.avatar, followers: artist.followers, trackCount: artist.trackCount })}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CURATED PLAYLISTS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {curatedPlaylists.length > 0 && (
        <Section title="Подобрано для вас" icon={Sparkles}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {curatedPlaylists.slice(0, 8).map((pl, i) => (
              <CuratedPlaylistCard
                key={pl.id}
                playlist={pl}
                index={i}
                onPlay={() => {
                  if (pl.tracks.length === 0) return;
                  if (currentTrack?.id === pl.tracks[0].id) { togglePlay(); return; }
                  playTrack(pl.tracks[0], pl.tracks);
                }}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION WRAPPER — unified styling for all sections
// ═════════════════════════════════════════════════════════════════════════

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ScrollReveal direction="up" delay={0.05}>
      <section className="mb-7 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--mq-accent) 18%, transparent)",
              }}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: "var(--mq-accent)" }} />
            </div>
            <h2 className="mq-text-headline text-base sm:text-lg lg:text-xl" style={{ color: "var(--mq-text)" }}>
              {title}
            </h2>
          </div>
          {action}
        </div>
        {children}
      </section>
    </ScrollReveal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// QUICK STAT
// ═════════════════════════════════════════════════════════════════════════

function QuickStat({
  icon: Icon,
  label,
  value,
  onClick,
  accent,
  cover,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onClick: () => void;
  accent: string;
  cover?: string;
}) {
  // UX Core #1 (Эффект Ресторфф): Quick Stats приглушены чтобы Wave Card
  // визуально доминировала как единственный главный CTA на экране.
  // UX Core #14 (Эффект превосходства картинки): мини-обложка слева
  // запоминается лучше чем иконка + число.
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: "color-mix(in srgb, var(--mq-card) 60%, transparent)",
        border: "1px solid var(--mq-border-hairline)",
      }}
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex-shrink-0 relative"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
        }}
      >
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-4 h-4 sm:w-5 h-5" style={{ color: accent }} />
          </div>
        )}
        {/* Accent dot — subtle indicator of category color */}
        <span
          className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 4px ${accent}` }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm sm:text-base font-bold leading-none" style={{ color: "var(--mq-text)" }}>{value}</p>
        <p className="text-[10px] sm:text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{label}</p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// TRACK CARD — universal card for tracks (recommendations, recently, trending preview)
// ═════════════════════════════════════════════════════════════════════════

function TrackCard({
  track,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  animationsEnabled,
}: {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPlay}
      className="text-left cursor-pointer group w-full"
    >
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-2"
        style={{
          boxShadow: isCurrent
            ? "0 0 0 2px var(--mq-accent), 0 8px 24px color-mix(in srgb, var(--mq-accent) 30%, transparent)"
            : "var(--mq-shadow-premium-md)",
          transition: "box-shadow 0.3s var(--mq-ease-premium)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}
          >
            <Music className="w-7 h-7" style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        <div
          className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0"
          style={{
            backgroundColor: "var(--mq-accent)",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
          }}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {/* Current badge */}
        {isCurrent && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
            style={{
              backgroundColor: "rgba(0,0,0,0.6)",
              color: "var(--mq-accent)",
              border: "1px solid var(--mq-border-accent)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            ИГРАЕТ
          </div>
        )}
      </div>
      <p
        className="text-[13px] sm:text-sm font-semibold truncate leading-tight mt-0.5"
        style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
      >
        {track.title}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
        className="text-[11px] sm:text-xs truncate hover:underline block w-full text-left mt-0.5"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {track.artist}
      </button>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PLAYLIST CARD — user's playlist tile
// ═════════════════════════════════════════════════════════════════════════

const PLAYLIST_GRADIENTS: [string, string][] = [
  ["#2d1b3d", "#0e0e0e"], ["#1b2d3a", "#0e0e0e"], ["#3d2b1b", "#0e0e0e"],
  ["#1b3a2d", "#0e0e0e"], ["#3a1b2d", "#0e0e0e"], ["#2d2d1b", "#0e0e0e"],
];
function hashHue(name: string, idx: 0 | 1): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PLAYLIST_GRADIENTS[Math.abs(h) % PLAYLIST_GRADIENTS.length][idx];
}

function PlaylistCard({
  playlist: pl,
  index,
  isCurrent,
  onClick,
  onPlay,
  animationsEnabled,
}: {
  playlist: { id: string; name: string; cover: string; tracks: Track[] };
  index: number;
  isCurrent: boolean;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="group relative text-left cursor-pointer rounded-2xl overflow-hidden w-full"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
        boxShadow: "var(--mq-shadow-premium-md)",
      }}
    >
      <div
        className="relative aspect-square overflow-hidden flex items-center justify-center"
        style={pl.cover
          ? { backgroundColor: "transparent" }
          : { background: `linear-gradient(135deg, ${hashHue(pl.name, 0)}, ${hashHue(pl.name, 1)})` }
        }
      >
        {pl.cover ? (
          <img src={pl.cover} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <ListMusic className="w-8 h-8" style={{ color: "rgba(255,255,255,0.5)" }} />
            <span className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{pl.tracks.length}</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        {pl.tracks.length > 0 && (
          <div
            onClick={onPlay}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0 cursor-pointer"
            style={{
              backgroundColor: "var(--mq-accent)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
            }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        )}
        {/* Current badge */}
        {isCurrent && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-accent)", border: "1px solid var(--mq-border-accent)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            ИГРАЕТ
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] sm:text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }} title={pl.name}>{pl.name}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
          {pl.tracks.length} {pluralRu(pl.tracks.length, "трек", "трека", "треков")}
        </p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// REC HERO — featured track at the top of the "Для вас" section
// Uses the currently-playing track (if it's in recs) or the first track of
// the first category. Mirrors Spotify's "Featured" / Apple Music's hero card
// pattern with a blurred cover backdrop.
// ═════════════════════════════════════════════════════════════════════════

function RecHero({
  track, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  const liked = useAppStore((s) => s.likedTrackIds.includes(track.id));
  const toggleLike = useAppStore((s) => s.toggleLike);

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      onClick={onPlay}
      className="relative rounded-3xl overflow-hidden mb-1 cursor-pointer group"
      style={{ boxShadow: "var(--mq-shadow-float)" }}
    >
      {/* Blurred cover background */}
      {track.cover ? (
        <div className="absolute inset-0">
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(48px) saturate(180%)", transform: "scale(1.4)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--mq-bg) 55%, transparent), color-mix(in srgb, var(--mq-bg) 35%, transparent))",
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 30%, var(--mq-bg)), var(--mq-bg))",
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 p-3 sm:p-5 flex items-center gap-3 sm:gap-5">
        {/* Cover */}
        <div
          className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden flex-shrink-0"
          style={{ boxShadow: "var(--mq-shadow-elevated)" }}
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
              }}
            >
              <Music className="w-10 h-10" style={{ color: "rgba(255,255,255,0.7)" }} />
            </div>
          )}
          {/* Hover play overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
            {isCurrent && isPlaying ? (
              <Pause className="w-7 h-7 sm:w-9 sm:h-9" fill="#fff" style={{ color: "#fff" }} />
            ) : (
              <Play className="w-7 h-7 sm:w-9 sm:h-9 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <motion.span
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1, 0.95] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
            </motion.span>
            <span
              className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--mq-accent)" }}
            >
              Рекомендация для вас
            </span>
          </div>
          <h3
            className="text-lg sm:text-xl font-bold truncate"
            style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}
            title={track.title}
          >
            {track.title}
          </h3>
          <button
            onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
            className="text-sm truncate hover:underline block w-full text-left mt-0.5"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {track.artist}
          </button>
          {reason && (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--mq-accent) 24%, transparent)",
              }}
            >
              <span
                className="text-[10px] sm:text-[11px] font-medium"
                style={{ color: "var(--mq-accent)" }}
              >
                {reason}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.05 }}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--mq-accent)",
              color: "#fff",
              boxShadow: "var(--mq-shadow-accent)",
            }}
            aria-label={isCurrent && isPlaying ? "Пауза" : "Слушать"}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.05 }}
            onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--mq-card)",
              color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)",
              border: "1px solid var(--mq-border-hairline)",
            }}
            aria-label={liked ? "Убрать из избранного" : "В избранное"}
          >
            <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={liked ? "currentColor" : "none"} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// REC STRIP — horizontal scroll of track cards for one category
// Replaces the old Hero+Tabs+List design with a simpler Spotify-home layout
// ═════════════════════════════════════════════════════════════════════════

function RecStrip({
  title, icon: Icon, tracks, reason, currentTrack, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  title: string;
  icon: React.ElementType;
  tracks: Track[];
  reason: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  onArtistClick: (artist: string) => void;
  animationsEnabled: boolean;
}) {
  if (tracks.length === 0) return null;
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-border-thin)", color: "var(--mq-text-muted)" }}>
          {tracks.length}
        </span>
      </div>

      {/* Horizontal scroll of cards */}
      <HScroll className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1">
        {tracks.map((track, i) => (
          <RecCard
            key={track.id + "_" + i}
            track={track}
            index={i}
            reason={reason}
            isCurrent={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
            onPlay={() => onPlay(track)}
            onArtistClick={() => onArtistClick(track.artist)}
            animationsEnabled={animationsEnabled}
          />
        ))}
      </HScroll>
    </div>
  );
}

// ─── RecCard — visual card (cover + title + artist) ───────────────────────

function RecCard({
  track, index, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  index: number;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, scale: 0.95 } : undefined}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      whileHover={{ y: -4 }}
      onClick={onPlay}
      className="flex-shrink-0 w-[140px] sm:w-[160px] cursor-pointer group"
    >
      {/* Cover */}
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-2"
        style={{
          boxShadow: isCurrent
            ? "0 0 0 2px var(--mq-accent), 0 8px 24px color-mix(in srgb, var(--mq-accent) 30%, transparent)"
            : "var(--mq-shadow-premium-md)",
          transition: "box-shadow 0.3s var(--mq-ease-premium)",
        }}
      >
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
            <Music className="w-7 h-7" style={{ color: "rgba(255,255,255,0.5)" }} />
          </div>
        )}
        {/* Dark gradient — always visible on mobile (so play button stays readable), hover-only on desktop */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play / pause button — visible on mobile, hover-only on desktop */}
        <div
          className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 translate-y-0 sm:translate-y-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-hover:translate-y-0"
          style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {isCurrent && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-accent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 30%, transparent)" }}>
            {/* Animated equalizer bars when playing, static dot when paused */}
            {isPlaying ? (
              <NowPlayingEqualizer size="xs" variant="inline" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            )}
            ИГРАЕТ
          </div>
        )}
      </div>
      {/* Text */}
      <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>
        {track.title}
      </p>
      <button onClick={(e) => { e.stopPropagation(); onArtistClick(); }} className="text-[11px] truncate hover:underline block w-full text-left mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
        {track.artist}
      </button>
      {reason && (
        <p className="text-[10px] truncate mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
          {reason}
        </p>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS — Reasoning helper
// ═════════════════════════════════════════════════════════════════════════

function reasonForRec(categoryId: string): string {
  switch (categoryId) {
    case "spotify_top": return "Топ-чарт Spotify";
    case "apple_top": return "Топ-чарт страны";
    case "trending_now": return "Популярно сейчас";
    case "fallback": return "Подобрано для вас";
    default: return "Похоже на ваше";
  }
}

// Icon per category id — used in RecsTabs tab chips
function iconForRec(categoryId: string): React.ElementType {
  switch (categoryId) {
    case "spotify_top": return Music;
    case "apple_top": return Flame;
    case "trending_now": return TrendingUp;
    case "for_you":
    case "fallback": return Sparkles;
    case "discover": return Compass;
    default: return Sparkles;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RECS SKELETON — loading state
// ═════════════════════════════════════════════════════════════════════════

function RecsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton */}
      <div
        className="relative rounded-3xl overflow-hidden p-5 flex items-center gap-4"
        style={{ backgroundColor: "var(--mq-card)" }}
      >
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl mq-shimmer flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded mq-shimmer" />
          <div className="h-5 w-3/4 rounded mq-shimmer" />
          <div className="h-3 w-1/2 rounded mq-shimmer" />
          <div className="h-5 w-32 rounded-full mq-shimmer mt-2" />
        </div>
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-lg mq-shimmer" />
        ))}
      </div>
      {/* List skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <div className="w-6 h-3 rounded mq-shimmer" />
            <div className="w-11 h-11 rounded-lg mq-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded mq-shimmer" />
              <div className="h-2.5 w-1/3 rounded mq-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// HSCROLL — horizontal scroll container that converts vertical wheel →
// horizontal scroll on PC mice. Uses native addEventListener with
// { passive: false } because React's onWheel is passive and can't
// preventDefault() the vertical page scroll.
// ═════════════════════════════════════════════════════════════════════════

function HScroll({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div ref={ref} className={className} style={{ scrollBehavior: "smooth", ...style }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS EMPTY STATE — when recommendations failed or returned nothing
// ═════════════════════════════════════════════════════════════════════════

function RecsEmptyState({ onRetry, errorType }: { onRetry: () => void; errorType?: "offline" | "api" | "empty" | null }) {
  const messages = {
    offline: {
      title: "Нет интернета",
      desc: "Проверьте подключение к сети",
    },
    api: {
      title: "Сервис недоступен",
      desc: "Попробуйте через минуту",
    },
    empty: {
      // UX Core #1 (Эвристика доступности): без императива "послушайте и
      // поставьте лайки" (долг). Позитивная формулировка снижает барьер.
      title: "Пока пусто",
      desc: "Запустите волну или лайкните трек — и здесь появятся похожие",
    },
  };
  const msg = messages[errorType || "empty"] || messages.empty;
  return (
    <div
      className="text-center py-10 rounded-2xl"
      style={{ backgroundColor: "var(--mq-card)" }}
    >
      <Sparkles
        className="w-9 h-9 mx-auto mb-3"
        style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
      />
      <p
        className="text-sm font-medium mb-1"
        style={{ color: "var(--mq-text)" }}
      >
        {msg.title}
      </p>
      <p
        className="text-xs mb-4 px-4"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {msg.desc}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: "var(--mq-accent)",
          color: "#fff",
          boxShadow: "var(--mq-shadow-accent)",
        }}
      >
        Повторить
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// ARTIST CIRCLE CARD
// ═════════════════════════════════════════════════════════════════════════

function ArtistCircleCard({
  artist,
  index,
  onClick,
  animationsEnabled,
}: {
  artist: { username: string; avatar?: string; trackCount?: number };
  index: number;
  onClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="text-left cursor-pointer group flex flex-col items-center"
    >
      <div
        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mb-2"
        style={{ boxShadow: "var(--mq-shadow-premium-md)" }}
      >
        {artist.avatar ? (
          <img src={artist.avatar} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
            <User className="w-8 h-8" style={{ color: "#fff" }} />
          </div>
        )}
      </div>
      <p className="text-xs sm:text-sm font-semibold truncate w-full text-center" style={{ color: "var(--mq-text)" }}>{artist.username}</p>
      {artist.trackCount !== undefined && (
        <p className="text-[10px] truncate w-full text-center" style={{ color: "var(--mq-text-muted)" }}>
          {artist.trackCount} {pluralRu(artist.trackCount, "трек", "трека", "треков")}
        </p>
      )}
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CURATED PLAYLIST CARD
// ═════════════════════════════════════════════════════════════════════════

function CuratedPlaylistCard({
  playlist: pl,
  index,
  onPlay,
  animationsEnabled,
}: {
  playlist: CuratedPlaylist;
  index: number;
  onPlay: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPlay}
      className="text-left cursor-pointer group rounded-2xl overflow-hidden w-full"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)", boxShadow: "var(--mq-shadow-premium-md)" }}
    >
      <div className="relative aspect-square overflow-hidden">
        <PlaylistArtwork playlistId={pl.id} size={200} rounded="rounded-none" className="!w-full !h-full group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {pl.tracks.length > 0 && (
          <div
            className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0"
            style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] sm:text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>{pl.name}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>{pl.subtitle}</p>
        <p className="text-[10px] mt-1.5 uppercase tracking-wider font-semibold" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
          {pl.tracks.length} {pluralRu(pl.tracks.length, "трек", "трека", "треков")}
        </p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// WAVE CARD — preserved from previous version
// ═════════════════════════════════════════════════════════════════════════

function WaveCard({
  isMobile,
  currentTrack,
  isPlaying,
  radioMode,
  progress,
  duration,
  waveLoading,
  waveError,
  onStartWave,
  onPauseWave,
  onStopWave,
  onSkip,
  onDislike,
  onLike,
  isLiked,
  topGenres,
}: {
  isMobile: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  radioMode: boolean;
  progress: number;
  duration: number;
  waveLoading: boolean;
  waveError: string | null;
  onStartWave: () => void;
  onPauseWave: () => void;
  onStopWave: () => void;
  onSkip: () => void;
  onDislike: () => void;
  onLike: () => void;
  isLiked: boolean;
  topGenres: string[];
}) {
  return (
    <div
      className={isMobile ? "relative mb-8 rounded-[28px] overflow-hidden" : "mq-hero-card relative mb-8"}
      style={{
        background: isMobile
          ? (currentTrack?.cover
            ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
            : getWaveGradient())
          : getWaveGradient(),
        minHeight: isMobile ? 140 : 160,
        boxShadow: "var(--mq-shadow-float)",
      }}
    >
      {/* Blurred album art background (mobile only) */}
      {isMobile && currentTrack?.cover && (
        <div className="absolute inset-0 pointer-events-none">
          <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" style={{ filter: "blur(60px) saturate(180%)", opacity: 0.3, transform: "scale(1.3)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-bg) 70%, transparent), color-mix(in srgb, var(--mq-bg) 50%, transparent))" }} />
        </div>
      )}

      {/* Glass overlay (mobile only) */}
      {isMobile && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: "color-mix(in srgb, var(--mq-bg) 40%, transparent)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
      )}

      {/* Pulsing glow animation */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{ boxShadow: `0 0 ${isMobile ? 80 : 60}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 15 : 18}%, transparent)` }}
        animate={{ opacity: isMobile ? [0.3, 0.6, 0.3] : [0.4, 0.8, 0.4] }}
        transition={{ duration: isMobile ? 5 : 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: isMobile ? 0.04 : 0.08, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />

      {/* Animated multi-layer wave background when playing */}
      {radioMode && currentTrack && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Back wave — slowest, dimmest */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 60 : 80, opacity: isMobile ? 0.08 : 0.10 }}>
            <motion.path
              d="M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
                "M0,55 C150,70 300,25 450,50 C600,70 750,25 900,55 C1050,70 1200,25 1200,50 L1200,80 L0,80 Z",
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          {/* Mid wave — medium speed, medium opacity */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 40 : 55, opacity: isMobile ? 0.10 : 0.14 }}>
            <motion.path
              d="M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z",
                "M0,30 C200,55 400,15 600,45 C800,65 1000,20 1200,50 L1200,80 L0,80 Z",
                "M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          {/* Front wave — fastest, most opaque */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 22 : 32, opacity: isMobile ? 0.14 : 0.18 }}>
            <motion.path
              d="M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z",
                "M0,45 C150,65 300,30 450,50 C600,65 750,30 900,50 C1050,65 1200,30 1200,50 L1200,80 L0,80 Z",
                "M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
        </div>
      )}

      <div className={`relative z-10 ${isMobile ? "p-4 sm:p-5 flex items-center gap-4 sm:gap-5" : "p-5 sm:p-6 flex items-center gap-5"}`} style={{ minHeight: isMobile ? 140 : 160 }}>
        {radioMode && currentTrack ? (
          isMobile ? (
            /* Mobile Active Wave */
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden flex-shrink-0 relative" style={{ boxShadow: "var(--mq-shadow-elevated)" }}>
                {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}><Music className="w-6 h-6" style={{ color: "rgba(255,255,255,0.8)" }} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Waves className="w-3 h-3" style={{ color: "rgba(255,255,255,0.7)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Волна · Играет</span>
                </div>
                <p className="text-base sm:text-lg font-bold truncate" style={{ color: "#fff", letterSpacing: "-0.02em" }}>{currentTrack.title}</p>
                <p className="text-[13px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{currentTrack.artist}</p>
                {isPlaying && duration > 0 && (
                  <div className="mt-2.5 h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)", maxWidth: 180 }}>
                    <motion.div className="h-full rounded-full" style={{ width: "100%", transformOrigin: "left", willChange: "transform", background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.9))" }}
                      initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(progress / duration, 1) }} transition={{ duration: 0.3, ease: "linear" }} />
                  </div>
                )}
              </div>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onPauseWave}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)", border: "1px solid var(--mq-border-medium)", color: "rgba(255,255,255,0.9)", boxShadow: "var(--mq-shadow-card)" }}>
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />}
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onSkip}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
              </motion.button>
              {/* Like/Dislike/Stop removed from Wave Card per user request.
                  Use PlayerBar controls instead (like/dislike there, and
                  Radio button toggles wave on/off). Wave stays focused on
                  playback: just Play/Pause + Skip. */}
            </div>
          ) : (
            /* Desktop Active Wave */
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 mq-cover-shadow">
                {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}><Music className="w-7 h-7" style={{ color: "#fff" }} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Waves className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.9)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>Волна · Играет</span>
                </div>
                <p className="text-lg font-bold truncate" style={{ color: "#fff" }}>{currentTrack.title}</p>
                <p className="text-sm truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{currentTrack.artist}</p>
                {isPlaying && duration > 0 && (
                  <div className="mt-2.5 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.15)", maxWidth: 200 }}>
                    <motion.div className="h-full rounded-full" style={{ width: "100%", transformOrigin: "left", willChange: "transform", backgroundColor: "rgba(255,255,255,0.8)" }}
                      initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(progress / duration, 1) }} transition={{ duration: 0.3, ease: "linear" }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-end gap-[2px] h-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div key={i} className="w-[2.5px] rounded-full"
                      style={{ height: "100%", transformOrigin: "bottom", willChange: "transform", backgroundColor: "rgba(255,255,255,0.7)" }}
                      animate={isPlaying ? { height: [3, 5 + (i % 3) * 2, 3] } : { height: 3 }}
                      transition={isPlaying ? { duration: 0.5 + i * 0.08, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 } : { duration: 0.2 }} />
                  ))}
                </div>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onPauseWave}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-0.5" fill="currentColor" />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onSkip}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
                  <SkipForward className="w-5 h-5" fill="currentColor" />
                </motion.button>
                {/* Like/Dislike/Stop removed from Wave Card per user request.
                    Use PlayerBar controls instead. Wave stays focused on
                    playback: just Play/Pause + Skip. */}
              </div>
            </div>
          )
        ) : (
          isMobile ? (
            /* Mobile Inactive Wave */
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Waves className="w-5 h-5" style={{ color: "rgba(255,255,255,0.8)" }} />
                  <h3 className="text-lg sm:text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                </div>
                <p className="text-[13px] sm:text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Бесконечный поток музыки для вас</p>
                {topGenres.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-hidden">
                    {topGenres.slice(0, 3).map((genre) => (
                      <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", border: "1px solid var(--mq-border-medium)" }}>
                        {displayGenre(genre)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onStartWave} disabled={waveLoading}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.9)", color: "var(--mq-bg)", boxShadow: "var(--mq-shadow-accent)" }}>
                {waveLoading ? (
                  <div className="mq-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-bg)", borderTopColor: "transparent" }} />
                ) : (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />
                )}
              </motion.button>
            </div>
          ) : (
            /* Desktop Inactive Wave */
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Waves className="w-6 h-6" style={{ color: "rgba(255,255,255,0.9)" }} />
                  <h3 className="text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                </div>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>Бесконечный поток музыки для вас</p>
                {topGenres.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-hidden">
                    {topGenres.slice(0, 3).map((genre) => (
                      <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", border: "1px solid var(--mq-border-medium)" }}>
                        {displayGenre(genre)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                onClick={onStartWave} disabled={waveLoading}
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                {waveLoading ? (
                  <div className="mq-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: "#1a1a2e", borderTopColor: "transparent" }} />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                )}
              </motion.button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Country detection ────────────────────────────────────────────────────

function detectUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // Map common timezones to country codes
    const tzMap: Record<string, string> = {
      "Europe/Moscow": "RU",
      "Europe/Kaliningrad": "RU",
      "Europe/Samara": "RU",
      "Europe/Yekaterinburg": "RU",
      "Europe/Omsk": "RU",
      "Europe/Novosibirsk": "RU",
      "Europe/Krasnoyarsk": "RU",
      "Europe/Irkutsk": "RU",
      "Asia/Yakutsk": "RU",
      "Asia/Vladivostok": "RU",
      "Asia/Magadan": "RU",
      "Asia/Kamchatka": "RU",
      "Asia/Anadyr": "RU",
      "Asia/Yekaterinburg": "RU",
      "Europe/Kiev": "UA",
      "Europe/Kyiv": "UA",
      "Europe/Minsk": "BY",
      "Asia/Almaty": "KZ",
      "Asia/Tashkent": "UZ",
      "Europe/London": "GB",
      "Europe/Berlin": "DE",
      "Europe/Paris": "FR",
      "Europe/Madrid": "ES",
      "Europe/Rome": "IT",
      "Europe/Amsterdam": "NL",
      "Europe/Stockholm": "SE",
      "Europe/Oslo": "NO",
      "Europe/Copenhagen": "DK",
      "Europe/Warsaw": "PL",
      "Europe/Prague": "CZ",
      "Europe/Vienna": "AT",
      "Europe/Zurich": "CH",
      "Europe/Brussels": "BE",
      "America/New_York": "US",
      "America/Chicago": "US",
      "America/Denver": "US",
      "America/Los_Angeles": "US",
      "America/Toronto": "CA",
      "America/Vancouver": "CA",
      "America/Mexico_City": "MX",
            "America/Sao_Paulo": "BR",
      "America/Argentina/Buenos_Aires": "AR",
      "Asia/Tokyo": "JP",
      "Asia/Seoul": "KR",
      "Asia/Shanghai": "CN",
      "Asia/Hong_Kong": "HK",
      "Asia/Singapore": "SG",
      "Asia/Kolkata": "IN",
      "Asia/Bangkok": "TH",
      "Asia/Dubai": "AE",
      "Asia/Tel_Aviv": "IL",
      "Australia/Sydney": "AU",
      "Australia/Melbourne": "AU",
      "Pacific/Auckland": "NZ",
    };
    return tzMap[tz] || "RU"; // Default to Russia
  } catch {
    return "RU";
  }
}

function countryNameFromCode(code: string): string {
  const names: Record<string, string> = {
    RU: "России", UA: "Украины", BY: "Беларуси", KZ: "Казахстана",
    US: "США", GB: "Британии", DE: "Германии", FR: "Франции",
    ES: "Испании", IT: "Италии", NL: "Нидерландов", SE: "Швеции",
    NO: "Норвегии", DK: "Дании", PL: "Польши", CZ: "Чехии",
    AT: "Австрии", CH: "Швейцарии", BE: "Бельгии", CA: "Канады",
    MX: "Мексики", BR: "Бразилии", AR: "Аргентины",
    JP: "Японии", KR: "Кореи", CN: "Китая", HK: "Гонконга",
    SG: "Сингапура", IN: "Индии", TH: "Таиланда", AE: "ОАЭ",
    IL: "Израиля", AU: "Австралии", NZ: "Новой Зеландии",
    UZ: "Узбекистана",
  };
  return names[code] || code;
}

export default memo(MainView);
