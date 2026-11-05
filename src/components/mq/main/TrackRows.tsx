"use client";

// Extracted from MainView.tsx (Stage III decomposition) — moved verbatim.
import { Music, Pause, Play, User } from "lucide-react";
import { NowPlayingEqualizer } from "../NowPlayingEqualizer";
import ScrollReveal from "../ScrollReveal";
import { type Track, formatDuration } from "@/lib/musicApi";
import { TrackMoreButton } from "../ui/TrackMoreButton";
import { hoverProps } from "@/lib/hoverCapability";
import { motion } from "framer-motion";
import { pluralRu } from "./homeUtils";
import { useEffect, useRef } from "react";

// ═════════════════════════════════════════════════════════════════════════
// SECTION WRAPPER — unified styling for all sections
// ═════════════════════════════════════════════════════════════════════════

export function Section({
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
        {/* V2.5: bare section header — no icon chip-box (kills the
            "card-in-header" pattern); the icon carries the accent alone. */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Icon className="w-[17px] h-[17px]" style={{ color: "color-mix(in srgb, var(--mq-text) 72%, transparent)" }} />
            <h2 className="mq-t-section text-[15px] sm:text-base lg:text-lg" style={{ color: "var(--mq-text)", fontWeight: 700 }}>
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

export function HorizontalTrackRow({
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  onMore,
}: {
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  onMore: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 rounded-xl p-2 pr-3 transition-colors hover:bg-[var(--mq-overlay-hover)] cursor-pointer"
      style={{ backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-text) 6%, transparent)" : "transparent" }}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
      aria-label={`Играть ${track.title}`}
    >
      <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          {isPlaying ? <Pause className="w-5 h-5 text-white" fill="currentColor" /> : <Play className="w-5 h-5 text-white" fill="currentColor" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="mq-t-track-sm line-clamp-2 leading-snug" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-artist-link mq-artist-link--block mq-t-artist max-w-full text-left truncate hover:underline"
        >
          {track.artist}
        </button>
      </div>
      {isPlaying && <NowPlayingEqualizer />}
      {track.duration > 0 && (
        <span className="mq-t-num shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(track.duration)}
        </span>
      )}
      <TrackMoreButton onOpen={onMore} label={`Действия: ${track.title}`} />
    </div>
  );
}

export function CompactTrackCard({
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  onMore,
}: {
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  onMore: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
      className="group flex-shrink-0 w-[124px] sm:w-[136px] text-left rounded-[var(--mq-mat-radius,14px)] overflow-hidden transition-[border-color] duration-150 cursor-pointer"
      style={{
        /* V2.5: L2 content surface — hairline edge instead of full card chrome.
           FINAL: + the quiet card shadow (solid surfaces sit on the page). */
        backgroundColor: "var(--mq-mat-2-bg)",
        border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--mq-platinum-hi) 30%, transparent)" : "var(--mq-mat-2-edge)"}`,
        boxShadow: "var(--mq-mat-2-shadow)",
      }}
      onClick={onPlay}
      aria-label={`Играть ${track.title}`}
    >
      <div className="relative w-full aspect-square" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          {isPlaying ? <Pause className="w-6 h-6 text-white" fill="currentColor" /> : <Play className="w-6 h-6 text-white" fill="currentColor" />}
        </div>
        {isCurrent && (
          <div className="absolute top-1.5 left-1.5" aria-hidden>
            <NowPlayingEqualizer />
          </div>
        )}
        {/* More — overlay top-right; mobile always visible, desktop on hover */}
        <div
          className="absolute top-1.5 right-1.5 rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <TrackMoreButton onOpen={onMore} size="sm" label={`Действия: ${track.title}`} className="!text-white" />
        </div>
      </div>
      <div className="p-2">
        <p className="mq-t-track-sm line-clamp-2 leading-snug" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <span
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-t-meta-2 truncate block hover:underline"
        >
          {track.artist}
        </span>
      </div>
    </div>
  );
}

export function ChartRow({
  rank,
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  onMore,
}: {
  rank: number;
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  onMore: (e: React.MouseEvent) => void;
}) {
  const isTop = rank <= 3;
  return (
    <div
      className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-[var(--mq-overlay-hover)] cursor-pointer"
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
      aria-label={`№${rank}: играть ${track.title}`}
    >
      <span
        className="mq-t-num text-lg w-8 text-center shrink-0 select-none"
        style={{ color: isTop ? "var(--mq-text)" : "var(--mq-text-muted)", fontWeight: isTop ? 700 : 500 }}
      >
        {rank}
      </span>
      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="mq-t-track-sm line-clamp-2 leading-snug" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-artist-link mq-artist-link--block mq-t-artist max-w-full text-left truncate hover:underline"
        >
          {track.artist}
        </button>
      </div>
      {isPlaying ? <NowPlayingEqualizer /> : (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Play className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
        </div>
      )}
      <TrackMoreButton onOpen={onMore} size="sm" label={`Действия: ${track.title}`} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// HSCROLL — horizontal scroll container that converts vertical wheel →
// horizontal scroll on PC mice. Uses native addEventListener with
// { passive: false } because React's onWheel is passive and can't
// preventDefault() the vertical page scroll.
// ═════════════════════════════════════════════════════════════════════════

export function HScroll({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
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
// ARTIST CIRCLE CARD
// ═════════════════════════════════════════════════════════════════════════

export function ArtistCircleCard({
  artist,
  index,
  onClick,
  onMore,
  animationsEnabled,
}: {
  artist: { username: string; avatar?: string; trackCount?: number; followers?: number; genre?: string };
  index: number;
  onClick: () => void;
  onMore: (e: React.MouseEvent) => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hoverProps({ y: -2, transition: { duration: 0.15, ease: "easeOut" } })}

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
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-text) 10%, var(--mq-bg)), var(--mq-mat-2-bg))" }}>
            <User className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        {/* More — overlay bottom-right of the circle, dark pill for contrast */}
        <div
          className="absolute bottom-1 right-1 rounded-full group/more"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <TrackMoreButton onOpen={onMore} size="sm" label={`Действия: ${artist.username}`} className="!text-white !opacity-100" />
        </div>
      </div>
      <p className="mq-t-track-sm truncate w-full text-center">{artist.username}</p>
      {artist.trackCount !== undefined && (
        <p className="mq-t-meta-2 truncate w-full text-center">
          {artist.trackCount} {pluralRu(artist.trackCount, "трек", "трека", "треков")}
        </p>
      )}
    </motion.div>
  );
}
