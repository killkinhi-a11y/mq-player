"use client";

import { useState, useCallback } from "react";
import { type Track } from "@/lib/musicApi";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Heart, ThumbsDown, MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import ContextMenu from "./ContextMenu";

interface TrackCardProps {
  track: Track;
  index?: number;
  queue?: Track[];
}

export default function TrackCard({ track, index = 0, queue }: TrackCardProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, animationsEnabled,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds, compactMode } = useAppStore();
  const _likedIds = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const _dislikedIds = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const isActive = currentTrack?.id === track.id;
  const isLiked = _likedIds.includes(track.id);
  const isDisliked = _dislikedIds.includes(track.id);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });

  const handleClick = () => {
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

  const motionProps = animationsEnabled
    ? { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * 0.03 } }
    : {};

  return (
    <>
      <motion.div
        {...motionProps}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center ${compactMode ? "gap-1 sm:gap-2 p-1.5 sm:p-2" : "gap-2 sm:gap-3 p-2 sm:p-3"} rounded-xl cursor-pointer transition-all duration-200 group`}
        style={{
          backgroundColor: isActive ? "var(--mq-accent)" : "var(--mq-card)",
        }}
        whileHover={animationsEnabled ? { scale: 1.01 } : undefined}
        whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
      >
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
          <p className="font-medium text-xs sm:text-sm truncate" style={{ color: "var(--mq-text)" }}>
            {track.title}
          </p>
          <p className="text-[10px] sm:text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            {track.artist}
          </p>
        </div>

        {/* Actions — compact on mobile, only show what fits */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {/* Like — compact on mobile */}
          <button onPointerDown={(e) => e.stopPropagation()} onClick={handleLikeClick}
            className="p-1 sm:p-1.5 rounded-lg active:scale-90"
            style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)", touchAction: "manipulation" }}>
            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={isLiked ? { fill: "#ef4444" } : {}} />
          </button>

          {/* Dislike — hidden on very small mobile to save space */}
          <button onPointerDown={(e) => e.stopPropagation()} onClick={handleDislikeClick}
            className="p-1 sm:p-1.5 rounded-lg active:scale-90 hidden sm:flex"
            style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)", touchAction: "manipulation" }}>
            <ThumbsDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={isDisliked ? { fill: "#ef4444" } : {}} />
          </button>

          {/* More — always accessible */}
          <button onClick={handleMoreClick} className="p-1 sm:p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100"
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
