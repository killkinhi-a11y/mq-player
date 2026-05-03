"use client";

import { useState, useCallback, useRef } from "react";
import { type Track } from "@/lib/musicApi";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Heart, ThumbsDown, MoreHorizontal } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import ContextMenu from "./ContextMenu";

interface TrackCardProps {
  track: Track;
  index?: number;
  queue?: Track[];
  onArtistClick?: (artistName: string) => void;
}

export default function TrackCard({ track, index = 0, queue, onArtistClick }: TrackCardProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, animationsEnabled,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds, compactMode } = useAppStore();
  const _likedIds = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const _dislikedIds = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const isActive = currentTrack?.id === track.id;
  const isLiked = _likedIds.includes(track.id);
  const isDisliked = _dislikedIds.includes(track.id);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  // 3D Tilt state
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltX = useMotionValue(0.5);
  const tiltY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(tiltY, [0, 1], [3, -3]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(tiltX, [0, 1], [-3, 3]), { stiffness: 300, damping: 30 });
  const isHovering = useRef(false);

  // Magnetic like button state
  const likeX = useSpring(0, { stiffness: 400, damping: 25 });
  const likeY = useSpring(0, { stiffness: 400, damping: 25 });

  const handleClick = (e: React.MouseEvent) => {
    // Add ripple
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples(prev => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 700);

    if (isActive) {
      togglePlay();
    } else {
      playTrack(track, queue || [track]);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const handleLikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(track.id, track);
  }, [track.id, track, toggleLike]);

  const handleDislikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDislike(track.id, track);
  }, [track.id, track, toggleDislike]);

  // Mouse handlers for 3D tilt
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!animationsEnabled) return;
    isHovering.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    tiltX.set((e.clientX - rect.left) / rect.width);
    tiltY.set((e.clientY - rect.top) / rect.height);
  }, [animationsEnabled, tiltX, tiltY]);

  const handleMouseLeave = useCallback(() => {
    isHovering.current = false;
    tiltX.set(0.5);
    tiltY.set(0.5);
  }, [tiltX, tiltY]);

  // Magnetic like button
  const handleLikeMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!animationsEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const strength = 0.4;
    likeX.set((e.clientX - cx) * strength);
    likeY.set((e.clientY - cy) * strength);
  }, [animationsEnabled, likeX, likeY]);

  const handleLikeMouseLeave = useCallback(() => {
    likeX.set(0);
    likeY.set(0);
  }, [likeX, likeY]);

  const motionProps = animationsEnabled
    ? { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * 0.03 } }
    : {};

  return (
    <>
      <motion.div
        ref={cardRef}
        {...motionProps}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`flex items-center ${compactMode ? "gap-1 sm:gap-2 p-1.5 sm:p-2" : "gap-2 sm:gap-3 p-2 sm:p-3"} rounded-xl cursor-pointer transition-all duration-200 group relative overflow-hidden`}
        style={{
          backgroundColor: isActive ? "var(--mq-accent)" : "var(--mq-card)",
          border: isActive
            ? "1px solid var(--mq-accent)"
            : "1px solid var(--mq-border)",
          rotateX: animationsEnabled ? rotateX : 0,
          rotateY: animationsEnabled ? rotateY : 0,
          transformStyle: "preserve-3d",
          perspective: 800,
          boxShadow: isActive ? "0 0 20px rgba(0,0,0,0.15)" : undefined,
        }}
        whileHover={animationsEnabled ? { scale: 1.01 } : undefined}
        whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
      >
        {/* Ripple effects */}
        {ripples.map(r => (
          <motion.span
            key={r.id}
            className="absolute rounded-full pointer-events-none"
            style={{ left: r.x, top: r.y, width: 0, height: 0, backgroundColor: "rgba(255,255,255,0.15)" }}
            animate={{ width: 300, height: 300, x: -150, y: -150, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        ))}

        {/* Glare overlay on hover */}
        {animationsEnabled && (
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.06) 50%, transparent 54%)",
              backgroundSize: "200% 100%",
              opacity: isHovering.current ? 1 : 0,
            }}
          />
        )}

        {/* Cover — smaller on mobile */}
        <div className={`relative ${compactMode ? "w-8 h-8 sm:w-10 sm:h-10" : "w-10 h-10 sm:w-12 sm:h-12"} rounded-lg overflow-hidden flex-shrink-0`}>
          <img src={track.cover} alt={track.album} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            {isActive && isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--mq-text)" }} /> : <Play className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--mq-text)" }} />}
          </div>
          {isActive && isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
        </div>

        {/* Track info — always take remaining space */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs sm:text-sm truncate" style={{ color: isActive ? "var(--mq-text)" : "var(--mq-text)" }}>
            {track.title}
          </p>
          <p
            className={`text-[10px] sm:text-xs truncate ${onArtistClick ? "cursor-pointer hover:underline" : ""}`}
            style={{ color: isActive ? "rgba(255,255,255,0.75)" : "var(--mq-text-muted)" }}
            onClick={(e) => {
              if (onArtistClick) {
                e.stopPropagation();
                onArtistClick(track.artist);
              }
            }}
          >
            {track.artist}
          </p>
        </div>

        {/* Actions — compact on mobile, only show what fits */}
        <div className="flex items-center gap-1 sm:gap-1 flex-shrink-0">
          {/* Like — magnetic on hover */}
          <motion.button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleLikeClick}
            onMouseMove={handleLikeMouseMove}
            onMouseLeave={handleLikeMouseLeave}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg active:scale-90"
            style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)", touchAction: "manipulation" }}
          >
            <motion.span style={{ x: likeX, y: likeY, display: "inline-block" }}>
              <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={isLiked ? { fill: "#ef4444" } : {}} />
            </motion.span>
          </motion.button>

          {/* Dislike */}
          <button onPointerDown={(e) => e.stopPropagation()} onClick={handleDislikeClick}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg active:scale-90 hidden sm:flex"
            style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)", touchAction: "manipulation" }}>
            <ThumbsDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={isDisliked ? { fill: "#ef4444" } : {}} />
          </button>

          {/* More — always accessible */}
          <button onClick={handleMoreClick} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg sm:opacity-0 sm:group-hover:opacity-100"
            style={{ color: "var(--mq-text-muted)" }}>
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Context Menu */}
      {contextMenu.show && (
        <ContextMenu
          track={track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu((prev) => ({ ...prev, show: false }))}
        />
      )}
    </>
  );
}
