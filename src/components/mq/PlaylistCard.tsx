"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Play, Clock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    description: string;
    cover: string;
    tracks: Track[];
    genre: string;
  };
  index?: number;
}

export default function PlaylistCard({ playlist, index = 0 }: PlaylistCardProps) {
  const playTrack = useAppStore((s) => s.playTrack);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const isMobile = useIsMobile();

  const handlePlay = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], [...playlist.tracks]);
    }
  };

  const motionProps = animationsEnabled
    ? {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        transition: { delay: index * 0.1, type: "spring" as const, stiffness: 200 },
      }
    : {};

  const radius = isMobile ? "24px" : "14px";

  return (
    <motion.div
      {...motionProps}
      whileHover={animationsEnabled ? { y: -2 } : undefined}
      className="overflow-hidden cursor-pointer group relative"
      style={{
        borderRadius: radius,
        backgroundColor: "var(--mq-card)",
        border: isMobile ? "1px solid var(--mq-border-thin)" : "1px solid var(--mq-border)",
        boxShadow: isMobile
          ? "0 4px 20px rgba(0,0,0,0.2), 0 0 20px color-mix(in srgb, var(--mq-accent) 5%, transparent)"
          : "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Ambient glow layer on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10"
        style={{
          borderRadius: radius,
          boxShadow: `0 0 ${isMobile ? 16 : 20}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 8 : 12}%, transparent)`,
          filter: `blur(${isMobile ? 16 : 20}px)`,
        }}
      />

      {/* Border glow on hover */}
      <div
        className="absolute inset-0 pointer-events-none border border-transparent group-hover:border-[color-mix(in_srgb,var(--mq-accent)_10%,transparent)] transition-colors duration-300"
        style={{ borderRadius: radius }}
      />

      <div className="relative aspect-square overflow-hidden">
        <img
          src={playlist.cover}
          alt={playlist.name}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] mq-cover-shadow"
          loading="lazy"
        />

        {/* Gradient overlay at bottom for text readability */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
          }}
        />

        {/* Play button overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <motion.button
            initial={{ scale: 0.5, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handlePlay}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(16px) saturate(180%)",
              WebkitBackdropFilter: "blur(16px) saturate(180%)",
              border: "1px solid var(--mq-border-medium)",
            }}
          >
            <Play className="w-6 h-6 ml-1" style={{ color: "#fff" }} fill="#fff" />
          </motion.button>
        </div>
      </div>
      <div className="p-3.5">
        <h3 className="font-semibold text-sm truncate" style={{ color: "var(--mq-text)" }}>
          {playlist.name}
        </h3>
        <p className="text-xs mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>
          {playlist.description}
        </p>
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)", color: "var(--mq-accent)" }}>
            {playlist.genre}
          </span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              {formatDuration(playlist.tracks.reduce((a, t) => a + t.duration, 0))}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
