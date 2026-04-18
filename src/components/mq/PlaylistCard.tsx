"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Play, Clock } from "lucide-react";

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
  const { playTrack, animationsEnabled } = useAppStore();

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

  return (
    <motion.div
      {...motionProps}
      whileHover={animationsEnabled ? { y: -4 } : undefined}
      className="rounded-xl overflow-hidden cursor-pointer group"
      style={{ backgroundColor: "var(--mq-card)" }}
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={playlist.cover}
          alt={playlist.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          loading="lazy"
        />
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <motion.button
            whileHover={animationsEnabled ? { scale: 1.1 } : undefined}
            whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
            onClick={handlePlay}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent)" }}
          >
            <Play className="w-6 h-6 ml-1" style={{ color: "var(--mq-text)" }} />
          </motion.button>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm truncate" style={{ color: "var(--mq-text)" }}>
          {playlist.name}
        </h3>
        <p className="text-xs mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>
          {playlist.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", opacity: 0.7 }}>
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
